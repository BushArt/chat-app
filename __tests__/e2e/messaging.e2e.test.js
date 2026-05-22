jest.setTimeout(30000);

const { startE2EServer, stopE2EServer, waitForEvent, connectAndWait, connectSocket, state, User, Message } = require('./helpers');

let api;
let app;
let serverInstance;
let port;
let clients = [];

beforeAll(async () => {
  const serverContext = await startE2EServer();
  api = serverContext.api;
  app = serverContext.app;
  serverInstance = serverContext.server;
  port = serverContext.port;
});

afterAll(async () => {
  await stopE2EServer();
});

beforeEach(async () => {
  app.locals._rateLimiters = new Map();
  clients = [];
  state.onlineUsers.clear();
  state.typingTimeouts.clear();
  await Promise.all([User.deleteMany({}), Message.deleteMany({})]);
});

afterEach(() => {
  clients.forEach((client) => {
    client.removeAllListeners();
    client.close();
  });
});

function trackClient(client) {
  clients.push(client);
  return client;
}

async function registerAndLogin(username) {
  const password = 'password123';
  await api.post('/auth/register').send({ username, password });
  const loginResponse = await api.post('/auth/login').send({ username, password });
  return loginResponse.body.token;
}

async function createConnectedClient(token) {
  const client = trackClient(connectSocket(port, token));
  return client;
}

describe('global messaging end-to-end', () => {
  test('broadcasts a global message and persists it', async () => {
    const aliceToken = await registerAndLogin('alice');
    const bobToken = await registerAndLogin('bob');

    const alice = await createConnectedClient(aliceToken);
    const bob = await createConnectedClient(bobToken);

    const aliceOnline = waitForEvent(alice, 'online_users');
    const bobOnline = waitForEvent(bob, 'online_users');
    await Promise.all([waitForEvent(alice, 'connect'), waitForEvent(bob, 'connect'), aliceOnline, bobOnline]);

    const aliceReceived = waitForEvent(alice, 'receive_global_message');
    const bobReceived = waitForEvent(bob, 'receive_global_message');

    alice.emit('send_global_message', { message: 'Hello world', clientId: 'global-c1' });

    const [alicePayload, bobPayload] = await Promise.all([aliceReceived, bobReceived]);

    expect(alicePayload).toMatchObject({ sender: 'alice', message: 'Hello world', clientId: 'global-c1' });
    expect(bobPayload).toMatchObject({ sender: 'alice', message: 'Hello world', clientId: 'global-c1' });

    const persisted = await Message.findOne({ clientId: 'global-c1', sender: 'alice', isGlobal: true });
    expect(persisted).not.toBeNull();

    const historyResponse = await api
      .get('/messages/global')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.some((msg) => msg.clientId === 'global-c1')).toBe(true);
  });
});

describe('private messaging end-to-end', () => {
  test('delivers a direct message only to room members and persists it', async () => {
    const aliceToken = await registerAndLogin('alice');
    const bobToken = await registerAndLogin('bob');
    const charlieToken = await registerAndLogin('charlie');

    const alice = await createConnectedClient(aliceToken);
    const bob = await createConnectedClient(bobToken);
    const charlie = await createConnectedClient(charlieToken);

    const room = ['alice', 'bob'].sort().join('_');
    const connectPromises = [waitForEvent(alice, 'connect'), waitForEvent(bob, 'connect'), waitForEvent(charlie, 'connect')];
    await Promise.all(connectPromises);

    alice.emit('join_room', room);
    bob.emit('join_room', room);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const bobReceived = waitForEvent(bob, 'receive_message');
    let charlieReceived = false;
    charlie.on('receive_message', () => {
      charlieReceived = true;
    });

    alice.emit('send_message', {
      message: 'Private hello',
      receiver: 'bob',
      room,
      clientId: 'private-c1'
    });

    const payload = await bobReceived;

    expect(payload).toMatchObject({ sender: 'alice', message: 'Private hello', clientId: 'private-c1', room });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(charlieReceived).toBe(false);

    const persisted = await Message.findOne({ clientId: 'private-c1', isGlobal: false, receiver: 'bob' });
    expect(persisted).not.toBeNull();

    const historyResponse = await api
      .get('/messages/alice/bob')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.some((msg) => msg.clientId === 'private-c1')).toBe(true);
  });
});

describe('history limits end-to-end', () => {
  test('returns only the most recent 100 global messages', async () => {
    const aliceToken = await registerAndLogin('alice');
    const now = Date.now();
    const messages = Array.from({ length: 101 }, (_, index) => ({
      sender: 'alice',
      message: `message-${index}`,
      isGlobal: true,
      createdAt: new Date(now + index),
      clientId: `global-${index}`
    }));

    await Message.insertMany(messages);

    const historyResponse = await api
      .get('/messages/global')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body).toHaveLength(100);
  });

  test('returns only the most recent 50 DM messages', async () => {
    const aliceToken = await registerAndLogin('alice');
    await registerAndLogin('bob');
    const now = Date.now();
    const messages = Array.from({ length: 51 }, (_, index) => ({
      sender: index % 2 === 0 ? 'alice' : 'bob',
      receiver: index % 2 === 0 ? 'bob' : 'alice',
      message: `dm-${index}`,
      isGlobal: false,
      createdAt: new Date(now + index),
      clientId: `dm-${index}`
    }));

    await Message.insertMany(messages);

    const historyResponse = await api
      .get('/messages/alice/bob')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body).toHaveLength(50);
  });
});

describe('presence end-to-end', () => {
  test('emits online_users including connected username', async () => {
    const aliceToken = await registerAndLogin('alice');
    const alice = trackClient(connectSocket(port, aliceToken));

    const onlineUsersPromise = waitForEvent(alice, 'online_users');
    await waitForEvent(alice, 'connect');
    const onlineUsers = await onlineUsersPromise;

    expect(Array.isArray(onlineUsers)).toBe(true);
    expect(onlineUsers).toContain('alice');
  });

  test('removes username from online_users after disconnect', async () => {
    const aliceToken = await registerAndLogin('alice');
    const alice = trackClient(connectSocket(port, aliceToken));

    const onlineUsersPromise = waitForEvent(alice, 'online_users');
    await waitForEvent(alice, 'connect');
    await onlineUsersPromise;

    alice.close();
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(state.onlineUsers.has('alice')).toBe(false);
  });
});
