require('dotenv').config();
const mongoose = require('mongoose');
const { startMemoryMongo } = require('./mongoMemory');

module.exports = async () => {
  process.env.NODE_ENV = 'test';

  const uri = process.env.TEST_MONGO_URI || await startMemoryMongo();
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
};
