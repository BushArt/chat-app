const request = require('supertest');
const express = require('express');
const cors = require('cors');
const securityHeaders = require('../../../middleware/security');
const errorHandler = require('../../../middleware/errorHandler');

jest.mock('../../../config/cloudinary', () => ({ uploadToCloudinary: jest.fn() }));
jest.mock('../../../models/Message');

const { uploadToCloudinary } = require('../../../config/cloudinary');
const Message = require('../../../models/Message');
const messageRoutes = require('../../../routes/messages');
const createGlobalHandler = require('../../../sockets/handlers/globalMessage');

function createApp() {
  const app = express();
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(securityHeaders);
  app.use('/messages', messageRoutes);
  app.use(errorHandler);
  return app;
}

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret';
});

beforeEach(() => {
  jest.clearAllMocks();
});

test('upload then send via global handler persists message with attachment', async () => {
  // Arrange: mock cloudinary to return a known URL
  uploadToCloudinary.mockResolvedValue({ secure_url: 'https://res.cloudinary.com/test/attachments/uuid', public_id: 'chat-app/attachments/uuid' });

  // Create app and perform upload
  const app = createApp();
  const fixture = Buffer.from('fake-image-bytes');
  const uploadRes = await request(app)
    .post('/messages/upload')
    .field('room', 'global')
    .field('isGlobal', 'true')
    .attach('file', fixture, { filename: 'upload.png', contentType: 'image/png' })
    .set('Authorization', 'Bearer valid-token');

  expect(uploadRes.status).toBe(200);
  const attachment = uploadRes.body;
  expect(attachment).toHaveProperty('url');

  // Arrange: mock Message constructor to capture saved data
  const saveMock = jest.fn().mockResolvedValue();
  Message.mockImplementation(function (doc) {
    // copy doc so assertions can inspect
    this._doc = { ...doc };
    this.save = saveMock;
    return this;
  });

  // Fake io/socket objects (only minimal used by handler)
  const fakeIo = { to: () => ({ emit: () => {} }), emit: () => {} };
  const fakeSocket = { username: 'uploader', connected: true };
  const fakeState = { MAX_MESSAGE_LENGTH: 1000, typingTimeouts: new Map(), addOptimisticMessage: () => {} };
  const fakeMessageAllowed = () => true;

  const handler = createGlobalHandler(fakeIo, fakeSocket, fakeState, fakeMessageAllowed);

  // Act: call handler with attachment and ack
  const ack = jest.fn();
  await handler({ message: '', clientId: 'cli123', attachment }, ack);

  // Assert: Message constructor called and save invoked with attachment present
  expect(Message).toHaveBeenCalledTimes(1);
  expect(saveMock).toHaveBeenCalledTimes(1);
  const constructed = Message.mock.calls[0][0];
  expect(constructed).toHaveProperty('attachment');
  expect(constructed.attachment.url).toBe(attachment.url);
});
