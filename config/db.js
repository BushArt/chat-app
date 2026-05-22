const mongoose = require('mongoose');

async function connectDatabase() {
  const uri = process.env.TEST_MONGO_URI || process.env.MONGO_URI;

  try {
    if (!uri) {
      throw new Error('Missing MongoDB URI');
    }

    await mongoose.connect(uri);
    const logger = require('../utils/logger');
    logger.info({ event: 'db_connected' });
  } catch (err) {
    const logger = require('../utils/logger');
    logger.error({ event: 'db_connection_failed', err: String(err) });
    throw err;
  }
}

module.exports = connectDatabase;