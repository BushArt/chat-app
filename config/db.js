const mongoose = require('mongoose');

async function connectDatabase() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const logger = require('../utils/logger');
    logger.info({ event: 'db_connected' });
  } catch (err) {
    const logger = require('../utils/logger');
    logger.error({ event: 'db_connection_failed', err: String(err) });
    throw err;
  }
}

module.exports = connectDatabase;