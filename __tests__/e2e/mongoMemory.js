let MongoMemoryServer;
try {
  MongoMemoryServer = require('mongodb-memory-server').MongoMemoryServer || require('mongodb-memory-server');
} catch (e1) {
  try {
    MongoMemoryServer = require('mongodb-memory-server-core').MongoMemoryServer || require('mongodb-memory-server-core');
  } catch (e2) {
    throw e1;
  }
}
const fs = require('fs');
const path = require('path');

const URI_FILE = path.join(__dirname, '.mongo-memory-uri');

let mongoServer;

async function startMemoryMongo() {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  process.env.TEST_MONGO_URI = uri;
  fs.writeFileSync(URI_FILE, uri, 'utf8');
  return uri;
}

async function stopMemoryMongo() {
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
  if (fs.existsSync(URI_FILE)) {
    fs.unlinkSync(URI_FILE);
  }
}

function readMemoryMongoUri() {
  if (process.env.TEST_MONGO_URI) {
    return process.env.TEST_MONGO_URI;
  }
  if (fs.existsSync(URI_FILE)) {
    return fs.readFileSync(URI_FILE, 'utf8').trim();
  }
  return null;
}

module.exports = {
  startMemoryMongo,
  stopMemoryMongo,
  readMemoryMongoUri,
  URI_FILE,
};
