jest.setTimeout(30000);

// Mock Cloudinary for upload tests
jest.mock("../../config/cloudinary", () => ({
  uploadToCloudinary: jest.fn()
}));

const { uploadToCloudinary } = require("../../config/cloudinary");
const { startE2EServer, stopE2EServer, waitForEvent, waitUntil, connectAndWait, connectSocket, state, User, Message } = require('./helpers');

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
    expect(persisted.senderDisplayName).toBe('alice');

    const historyResponse = await api
      .get('/messages/global')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.messages.some((msg) => msg.clientId === 'global-c1')).toBe(true);
    const historyMsg = historyResponse.body.messages.find((msg) => msg.clientId === 'global-c1');
    expect(historyMsg).toHaveProperty('senderDisplayName', 'alice');
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

    const room = ['alice', 'bob'].sort().join(':');
    const connectPromises = [waitForEvent(alice, 'connect'), waitForEvent(bob, 'connect'), waitForEvent(charlie, 'connect')];
    await Promise.all(connectPromises);

    alice.emit('join_room', room);
    bob.emit('join_room', room);

    await waitUntil(() => alice.connected && bob.connected);

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
    const graceDeadline = Date.now() + 200;
    await waitUntil(() => charlieReceived === true || Date.now() >= graceDeadline, { timeout: 1000, interval: 25 });
    expect(charlieReceived).toBe(false);

    const persisted = await Message.findOne({ clientId: 'private-c1', isGlobal: false, receiver: 'bob' });
    expect(persisted).not.toBeNull();

    const historyResponse = await api
      .get('/messages/alice/bob')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.messages.some((msg) => msg.clientId === 'private-c1')).toBe(true);
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
    expect(historyResponse.body.messages).toHaveLength(100);
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
    expect(historyResponse.body.messages).toHaveLength(50);
  });
});

describe('attachment upload and send end-to-end', () => {
  test('user can upload a file and send it as an attachment in global message', async () => {
    const aliceToken = await registerAndLogin('alice');
    const bobToken = await registerAndLogin('bob');

    // Mock Cloudinary to return a known URL
    uploadToCloudinary.mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/test/chat-app/attachments/uuid-e2e',
      public_id: 'chat-app/attachments/uuid-e2e'
    });

    // Upload file via REST endpoint
    const uploadRes = await api
      .post('/messages/upload')
      .field('room', 'global')
      .field('isGlobal', 'true')
      .attach('file', Buffer.from('fake-image-bytes'), { filename: 'photo.png', contentType: 'image/png' })
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body).toHaveProperty('url');
    expect(uploadRes.body.type).toBe('image');

    const attachment = uploadRes.body;

    // Connect sockets
    const alice = await createConnectedClient(aliceToken);
    const bob = await createConnectedClient(bobToken);
    const connectPromises = [waitForEvent(alice, 'connect'), waitForEvent(bob, 'connect')];
    await Promise.all(connectPromises);

    const bobReceived = waitForEvent(bob, 'receive_global_message');

    alice.emit('send_global_message', {
      message: 'Check this out',
      clientId: 'e2e-attach-c1',
      attachment
    });

    const payload = await bobReceived;

    expect(payload).toMatchObject({
      sender: 'alice',
      message: 'Check this out',
      clientId: 'e2e-attach-c1'
    });
    expect(payload).toHaveProperty('attachment');
    expect(payload.attachment.url).toBe(attachment.url);
    expect(payload.attachment.type).toBe('image');

    // Verify attachment is persisted in MongoDB
    const persisted = await Message.findOne({ clientId: 'e2e-attach-c1' });
    expect(persisted).not.toBeNull();
    expect(persisted.attachment).not.toBeNull();
    expect(persisted.attachment.url).toBe(attachment.url);
    expect(persisted.attachment.type).toBe('image');
    expect(persisted.attachment.filename).toBe('photo.png');

    // Verify attachment fields appear in history response
    const historyResponse = await api
      .get('/messages/global')
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(historyResponse.status).toBe(200);
    const historyMsg = historyResponse.body.messages.find((msg) => msg.clientId === 'e2e-attach-c1');
    expect(historyMsg).toBeDefined();
    expect(historyMsg).toHaveProperty('attachment');
    expect(historyMsg.attachment).toHaveProperty('url', attachment.url);
    expect(historyMsg.attachment).toHaveProperty('type', 'image');
  });

  test('attachment is persisted with correct metadata', async () => {
    const aliceToken = await registerAndLogin('alice_attach');
    const bobToken = await registerAndLogin('bob_attach');

    uploadToCloudinary.mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/test/chat-app/attachments/uuid-e2e-2',
      public_id: 'chat-app/attachments/uuid-e2e-2'
    });

    // Upload a PDF
    const uploadRes = await api
      .post('/messages/upload')
      .field('room', 'global')
      .field('isGlobal', 'true')
      .attach('file', Buffer.from('fake-pdf-content'), { filename: 'doc.pdf', contentType: 'application/pdf' })
      .set('Authorization', `Bearer ${aliceToken}`);

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.type).toBe('file');
    expect(uploadRes.body.filename).toBe('doc.pdf');
    expect(uploadRes.body.mimetype).toBe('application/pdf');
    expect(typeof uploadRes.body.size).toBe('number');

    // Send the attachment
    const alice = await createConnectedClient(aliceToken);
    await waitForEvent(alice, 'connect');

    alice.emit('send_global_message', {
      message: '',
      clientId: 'e2e-attach-c2',
      attachment: uploadRes.body
    });

    await waitUntil(async () => !!(await Message.findOne({ clientId: 'e2e-attach-c2' })));

    // Verify full persistence
    const persisted = await Message.findOne({ clientId: 'e2e-attach-c2' });
    expect(persisted).not.toBeNull();
    expect(persisted.attachment).toMatchObject({
      type: 'file',
      filename: 'doc.pdf',
      url: 'https://res.cloudinary.com/test/chat-app/attachments/uuid-e2e-2',
      mimetype: 'application/pdf'
    });
    expect(typeof persisted.attachment.size).toBe('number');
    expect(persisted.attachment.size).toBeGreaterThan(0);
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
    // Phase 1: online_users returns array of profile objects, not strings
    const aliceEntry = onlineUsers.find((u) => u.username === 'alice');
    expect(aliceEntry).toBeDefined();
    expect(aliceEntry.displayName).toBe('alice');
    expect(aliceEntry.status).toBe('online');
  });

  test('removes username from online_users after disconnect', async () => {
    const aliceToken = await registerAndLogin('alice');
    const alice = trackClient(connectSocket(port, aliceToken));

    const onlineUsersPromise = waitForEvent(alice, 'online_users');
    await waitForEvent(alice, 'connect');
    await onlineUsersPromise;

    alice.close();
    await waitUntil(() => !state.onlineUsers.has('alice'));

    expect(state.onlineUsers.has('alice')).toBe(false);
  });
});
