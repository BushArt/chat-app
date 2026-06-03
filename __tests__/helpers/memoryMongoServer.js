let MongoMemoryServer;
try {
  // Prefer the main package export
  MongoMemoryServer = require('mongodb-memory-server').MongoMemoryServer || require('mongodb-memory-server');
} catch (e1) {
  try {
    // Fallback to the core package if present
    MongoMemoryServer = require('mongodb-memory-server-core').MongoMemoryServer || require('mongodb-memory-server-core');
  } catch (e2) {
    // Re-throw original error for visibility
    throw e1;
  }
}

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
