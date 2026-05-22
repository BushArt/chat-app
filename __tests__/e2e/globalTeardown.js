require('dotenv').config();
const mongoose = require('mongoose');

module.exports = async () => {
  process.env.NODE_ENV = 'test';

  if (!process.env.TEST_MONGO_URI) {
    throw new Error('TEST_MONGO_URI must be defined for end-to-end tests.');
  }

  await mongoose.connect(process.env.TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
};
