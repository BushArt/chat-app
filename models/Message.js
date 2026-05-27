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
  },
  clientId: {
    type: String,
    default: null
  },
  senderDisplayName: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Index for fast global chat history lookups
messageSchema.index({ isGlobal: 1, createdAt: 1 });

// Compound index for fast DM history lookups
// Covers queries like: sender=A,receiver=B  OR  sender=B,receiver=A
messageSchema.index({ sender: 1, receiver: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);