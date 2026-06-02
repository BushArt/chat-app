require('dotenv').config();
process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS || '4';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const request = require('supertest');
const ioClient = require('socket.io-client');
const mongoose = require('mongoose');
const { readMemoryMongoUri } = require('./mongoMemory');

const baseTestUri = process.env.TEST_MONGO_URI || readMemoryMongoUri() || process.env.MONGO_URI;
const jestWorkerId = process.env.JEST_WORKER_ID;

function buildWorkerTestUri(uri, workerId) {
  if (!uri || !workerId) return uri;
  const [connectionString, query = ''] = uri.split('?');
  const match = connectionString.match(/^(mongodb(?:\+srv)?:\/\/[^/]+)(?:\/(.*))?$/);
  if (!match) return uri;
  const prefix = match[1];
  const dbName = match[2] ? match[2] : 'test';
  const workerDb = `${dbName}_worker${workerId}`;
  return query ? `${prefix}/${workerDb}?${query}` : `${prefix}/${workerDb}`;
}

process.env.TEST_MONGO_URI = buildWorkerTestUri(baseTestUri, jestWorkerId);

const { app, server, io, connectDatabase } = require('../../app');
const state = require('../../sockets/state');
const User = require('../../models/User');
const Message = require('../../models/Message');

async function startE2EServer() {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  await connectDatabase();
  await mongoose.connection.dropDatabase();

  await new Promise((resolve, reject) => {
    server.listen(0, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  const port = server.address().port;
  const api = request(`http://127.0.0.1:${port}`);

  return { app, server, io, port, api };
}

async function stopE2EServer() {
  await new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  if (io && typeof io.close === 'function') {
    io.close();
  }

  await mongoose.disconnect();
}

function waitForEvent(emitter, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for "${event}"`));
    }, timeout);

    emitter.once(event, (...args) => {
      clearTimeout(timer);
      resolve(args.length <= 1 ? args[0] : args);
    });
  });
}

async function waitUntil(predicate, { timeout = 5000, interval = 50 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error('waitUntil: condition not met within timeout');
}

function connectSocket(port, token) {
  return ioClient(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    forceNew: true,
    auth: { token }
  });
}

async function connectAndWait(port, token) {
  const client = connectSocket(port, token);
  const connectPromise = waitForEvent(client, 'connect');
  const errorPromise = waitForEvent(client, 'connect_error');
  const result = await Promise.race([
    connectPromise.then((value) => ({ type: 'connect', value })),
    errorPromise.then((value) => ({ type: 'connect_error', value }))
  ]);

  if (result.type === 'connect_error') {
    client.close();
    throw new Error(`Socket connection failed: ${JSON.stringify(result.value)}`);
  }
  return client;
}

module.exports = {
  startE2EServer,
  stopE2EServer,
  waitForEvent,
  waitUntil,
  connectSocket,
  connectAndWait,
  state,
  User,
  Message
};
