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
    expect(registerResponse.body).toHaveProperty('message');

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
    expect(Array.isArray(historyResponse.body)).toBe(true);
  });
});
