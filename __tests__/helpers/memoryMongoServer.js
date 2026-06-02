const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServerPromise;

/**
 * Returns a shared in-memory MongoDB URI (one server per Jest worker process).
 */
async function getMemoryMongoUri() {
  if (!mongoServerPromise) {
    mongoServerPromise = MongoMemoryServer.create({
      instance: { launchTimeout: 60000 },
    }).then((server) => server);
  }
  const server = await mongoServerPromise;
  return server.getUri();
}

async function stopMemoryMongo() {
  if (mongoServerPromise) {
    const server = await mongoServerPromise;
    await server.stop();
    mongoServerPromise = null;
  }
}

module.exports = { getMemoryMongoUri, stopMemoryMongo };
