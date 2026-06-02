const mongoose = require('mongoose');
const { getMemoryMongoUri } = require('../../helpers/memoryMongoServer');
const request = require('supertest');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');

jest.mock('express-rate-limit', () => () => (req, res, next) => next());
jest.mock('cloudinary', () => ({
  v2: { config: jest.fn(), uploader: { upload_stream: jest.fn() } },
}));
jest.mock('../../../config/cloudinary', () => ({
  uploadToCloudinary: jest.fn(),
}));

const securityHeaders = require('../../../middleware/security');
const errorHandler = require('../../../middleware/errorHandler');
const User = require('../../../models/User');
const authRoutes = require('../../../routes/auth');

function createApp() {
  const app = express();
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(securityHeaders);
  app.use('/auth', authRoutes);
  app.use(errorHandler);
  return app;
}

async function registerUser(app, username, password = 'password123') {
  return request(app).post('/auth/register').send({ username, password });
}

beforeAll(async () => {
  await mongoose.connect(await getMemoryMongoUri());
  process.env.JWT_SECRET = 'test-secret';
  process.env.BCRYPT_ROUNDS = '4';
});

afterAll(async () => {
  await mongoose.disconnect();
});

beforeEach(async () => {
  await User.deleteMany({});
});

describe('auth routes with MongoDB', () => {
  test('register stores a bcrypt password hash', async () => {
    const app = createApp();
    const res = await registerUser(app, 'db_alice');
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();

    const user = await User.findOne({ username: 'db_alice' });
    expect(user).not.toBeNull();
    expect(user.password).not.toBe('password123');
    expect(await bcrypt.compare('password123', user.password)).toBe(true);
  });

  test('login succeeds with valid credentials', async () => {
    const app = createApp();
    await registerUser(app, 'db_bob');
    const res = await request(app).post('/auth/login').send({
      username: 'db_bob',
      password: 'password123',
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.username).toBe('db_bob');
  });

  test('login rejects invalid password', async () => {
    const app = createApp();
    await registerUser(app, 'db_carol');
    const res = await request(app).post('/auth/login').send({
      username: 'db_carol',
      password: 'wrong-password',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_credentials');
  });

  test('register rejects duplicate username', async () => {
    const app = createApp();
    await registerUser(app, 'db_dup');
    const res = await registerUser(app, 'db_dup');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('username_taken');
  });

  test('GET /auth/me returns profile for valid token', async () => {
    const app = createApp();
    const registerRes = await registerUser(app, 'db_me');
    const token = registerRes.body.token;

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('db_me');
    expect(res.body).not.toHaveProperty('password');
  });

  test('PUT /auth/profile persists displayName and bio', async () => {
    const app = createApp();
    const registerRes = await registerUser(app, 'db_profile');
    const token = registerRes.body.token;

    const res = await request(app)
      .put('/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'Profile Name', bio: 'Hello bio' });

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('Profile Name');
    expect(res.body.bio).toBe('Hello bio');

    const user = await User.findOne({ username: 'db_profile' });
    expect(user.displayName).toBe('Profile Name');
    expect(user.bio).toBe('Hello bio');
  });

  test('POST /auth/logout sets lastLogout timestamp', async () => {
    const app = createApp();
    const registerRes = await registerUser(app, 'db_logout');
    const token = registerRes.body.token;

    const logoutRes = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(logoutRes.status).toBe(200);

    const user = await User.findOne({ username: 'db_logout' });
    expect(user.lastLogout).toBeInstanceOf(Date);
  });

  test('revoked token is rejected by GET /auth/me', async () => {
    const app = createApp();
    const registerRes = await registerUser(app, 'db_revoke');
    const token = registerRes.body.token;

    await request(app).post('/auth/logout').set('Authorization', `Bearer ${token}`);

    const meRes = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(403);
    expect(meRes.body.code).toBe('token_revoked');
  });

  test('fresh login after logout succeeds', async () => {
    const app = createApp();
    await registerUser(app, 'db_relogin');
    const firstLogin = await request(app).post('/auth/login').send({
      username: 'db_relogin',
      password: 'password123',
    });
    await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${firstLogin.body.token}`);

    const secondLogin = await request(app).post('/auth/login').send({
      username: 'db_relogin',
      password: 'password123',
    });
    expect(secondLogin.status).toBe(200);

    const meRes = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${secondLogin.body.token}`);
    expect(meRes.status).toBe(200);
  });

  test('register sets displayName to username via pre-save hook', async () => {
    const app = createApp();
    await registerUser(app, 'db_hook');
    const user = await User.findOne({ username: 'db_hook' });
    expect(user.displayName).toBe('db_hook');
  });
});
