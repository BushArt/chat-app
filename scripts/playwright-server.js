/**
 * Starts the chat app on a fixed port with an in-memory MongoDB for browser tests.
 */
require('dotenv').config();
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const PORT = process.env.PLAYWRIGHT_PORT || 3456;

(async () => {
  const mongo = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongo.getUri();
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS || '4';
  process.env.PORT = String(PORT);
  process.env.NODE_ENV = 'test';

  const { connectDatabase, server } = require('../app');
  await connectDatabase();

  server.listen(PORT, () => {
    process.stdout.write(`playwright-server-ready:${PORT}\n`);
  });

  const shutdown = async () => {
    await mongoose.disconnect();
    await mongo.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
