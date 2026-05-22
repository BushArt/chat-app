require('dotenv').config();
process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS || '4';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const request = require('supertest');
const ioClient = require('socket.io-client');
const mongoose = require('mongoose');

const { app, server, io, connectDatabase } = require('../../app');
const state = require('../../sockets/state');
const User = require('../../models/User');
const Message = require('../../models/Message');

async function startE2EServer() {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  await connectDatabase();

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
  connectSocket,
  connectAndWait,
  state,
  User,
  Message
};
