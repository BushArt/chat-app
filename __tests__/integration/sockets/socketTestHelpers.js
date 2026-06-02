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

async function connectAndWaitOrError(client, timeout = 5000) {
  const connectPromise = waitForEvent(client, 'connect', timeout).then((value) => ({
    type: 'connect',
    value,
  }));
  const errorPromise = waitForEvent(client, 'connect_error', timeout).then((value) => ({
    type: 'connect_error',
    value,
  }));

  const result = await Promise.race([connectPromise, errorPromise]);
  if (result.type === 'connect_error') {
    return { client, error: result.value, connected: false };
  }
  return { client, error: null, connected: true };
}

function connectClient(port, token) {
  const ioClient = require('socket.io-client');
  return ioClient(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    forceNew: true,
    auth: { token },
  });
}

async function connectAndWait(port, token, timeout = 5000) {
  const client = connectClient(port, token);
  const result = await connectAndWaitOrError(client, timeout);
  if (!result.connected) {
    client.close();
    throw new Error(`Socket connection failed: ${JSON.stringify(result.error)}`);
  }
  return client;
}

function resetJwtVerifyDefault(jwt, payload = { id: 'user1', username: 'alice' }) {
  jwt.verify.mockReset();
  jwt.verify.mockReturnValue(payload);
}

async function closeSocketServer(io, server) {
  await new Promise((resolve) => {
    if (io && typeof io.close === 'function') {
      io.close(() => resolve());
      return;
    }
    if (server && typeof server.close === 'function') {
      server.close(() => resolve());
      return;
    }
    resolve();
  });
}

module.exports = {
  waitForEvent,
  connectAndWaitOrError,
  connectClient,
  connectAndWait,
  resetJwtVerifyDefault,
  closeSocketServer,
};
