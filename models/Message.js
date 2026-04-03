const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: String,
    required: true
  },
  receiver: {
    type: String,
    default: null    // null means it's a global message, not a private one
  },
  message: {
    type: String,
    required: true
  },
  isGlobal: {
    type: Boolean,
    default: false   // true = global chat, false = private message
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Message', messageSchema);