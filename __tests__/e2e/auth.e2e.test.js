jest.setTimeout(30000);

const { startE2EServer, stopE2EServer, User, Message } = require('./helpers');

let api;
let stopServer;

beforeAll(async () => {
  const serverContext = await startE2EServer();
  api = serverContext.api;
  stopServer = serverContext.server;
});

afterAll(async () => {
  await stopE2EServer();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Message.deleteMany({})]);
});

describe('auth end-to-end', () => {
  test('registers a new user and allows login immediately', async () => {
    const registerResponse = await api
      .post('/auth/register')
      .send({ username: 'alice', password: 'password123' });

    expect(registerResponse.status).toBe(201);
    expect(registerResponse.body).toHaveProperty('token');
    expect(registerResponse.body).toHaveProperty('username', 'alice');
    expect(registerResponse.body).toHaveProperty('displayName');
    expect(registerResponse.body).toHaveProperty('bio');
    expect(registerResponse.body).toHaveProperty('status');
    expect(registerResponse.body).toHaveProperty('avatarUrl');
    expect(registerResponse.body).toHaveProperty('createdAt');

    const loginResponse = await api
      .post('/auth/login')
      .send({ username: 'alice', password: 'password123' });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body).toHaveProperty('token');
    expect(loginResponse.body.token).toBeTruthy();
  });

  test('prevents registration of duplicate usernames in a case-insensitive way', async () => {
    const firstResponse = await api
      .post('/auth/register')
      .send({ username: 'alice', password: 'password123' });

    expect(firstResponse.status).toBe(201);

    const duplicateResponse = await api
      .post('/auth/register')
      .send({ username: 'Alice', password: 'password123' });

    expect(duplicateResponse.status).toBe(400);
    expect(duplicateResponse.body).toHaveProperty('error');
    expect(duplicateResponse.body.error.toLowerCase()).toContain('taken');
  });

  test('allows a login token to fetch global message history', async () => {
    await api.post('/auth/register').send({ username: 'alice', password: 'password123' });
    const loginResponse = await api.post('/auth/login').send({ username: 'alice', password: 'password123' });

    const token = loginResponse.body.token;
    const historyResponse = await api
      .get('/messages/global')
      .set('Authorization', `Bearer ${token}`);

    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body).toHaveProperty('messages');
    expect(Array.isArray(historyResponse.body.messages)).toBe(true);
  });

  test('GET /auth/me returns correct profile after registration', async () => {
    await api.post('/auth/register').send({ username: 'alice', password: 'password123' });
    const loginResponse = await api.post('/auth/login').send({ username: 'alice', password: 'password123' });
    const token = loginResponse.body.token;

    const meResponse = await api
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body).toHaveProperty('username', 'alice');
    expect(meResponse.body).toHaveProperty('displayName', 'alice');
    expect(meResponse.body).toHaveProperty('bio', '');
    expect(meResponse.body).toHaveProperty('status', 'online');
    expect(meResponse.body).toHaveProperty('createdAt');
    expect(meResponse.body).not.toHaveProperty('password');
    expect(meResponse.body).not.toHaveProperty('hash');
  });

  test('GET /auth/me returns 401 without JWT', async () => {
    const meResponse = await api.get('/auth/me');
    expect(meResponse.status).toBe(401);
  });

  test('PUT /auth/profile persists changes to MongoDB', async () => {
    await api.post('/auth/register').send({ username: 'alice', password: 'password123' });
    const loginResponse = await api.post('/auth/login').send({ username: 'alice', password: 'password123' });
    const token = loginResponse.body.token;

    const updateResponse = await api
      .put('/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'Alice Chen', bio: 'Hello world' });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toHaveProperty('displayName', 'Alice Chen');
    expect(updateResponse.body).toHaveProperty('bio', 'Hello world');

    const meResponse = await api
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.displayName).toBe('Alice Chen');
    expect(meResponse.body.bio).toBe('Hello world');
  });

  test('PUT /auth/profile partial update does not overwrite other fields', async () => {
    await api.post('/auth/register').send({ username: 'bob', password: 'password123' });
    const loginResponse = await api.post('/auth/login').send({ username: 'bob', password: 'password123' });
    const token = loginResponse.body.token;

    await api
      .put('/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'Bob Smith' });

    const bioUpdate = await api
      .put('/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ bio: 'Just a bio' });

    expect(bioUpdate.status).toBe(200);
    expect(bioUpdate.body.displayName).toBe('Bob Smith');
    expect(bioUpdate.body.bio).toBe('Just a bio');
  });
});
