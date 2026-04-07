const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: String,
    required: true,
    trim: true,
    maxlength: 32     // matches the username max in auth.js
  },
  receiver: {
    type: String,
    default: null,    // null means it's a global message, not a private one
    trim: true,
    maxlength: 32
  },
  message: {
    type: String,
    required: true,
    trim: true,
    // 2000 Unicode characters.  A Chinese character is one character,
    // so this is a fair limit regardless of the script being used.
    // (MongoDB stores strings as UTF-8, so a Chinese char uses ~3 bytes,
    //  but the limit here is intentionally in characters, not bytes.)
    maxlength: 2000
  },
  isGlobal: {
    type: Boolean,
    default: false    // true = global chat, false = private message
  }
}, {
  timestamps: true
});

// Index to speed up fetching conversation history between two users
messageSchema.index({ isGlobal: 1, createdAt: 1 });
messageSchema.index({ sender: 1, receiver: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);