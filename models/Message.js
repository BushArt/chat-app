const mongoose = require('mongoose');

// Attachment subdocument schema (Phase 3 — File Attachments)
// _id: false — attachments are always accessed through their parent Message,
// so a separate _id would consume index space with no query benefit.
const attachmentSchema = new mongoose.Schema({
  type: { type: String, enum: ['image', 'audio', 'file'] },
  filename: String,
  url: String,
  mimetype: String,
  size: Number // bytes
}, { _id: false });

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
    required: function () {
      // Allow attachment-only messages (empty text when attachment is present)
      return !this.attachment;
    }
  },
  isGlobal: {
    type: Boolean,
    default: false   // true = global chat, false = private message
  },
  clientId: {
    type: String,
    default: null
  },
  // senderDisplayName is denormalized at write time (populated from User.displayName
  // when the message is saved). If a user later changes their display name, historical
  // messages retain the name that was in use when they were sent. No read-repair needed.
  senderDisplayName: {
    type: String,
    default: ''
  },
  attachment: {
    type: attachmentSchema,
    default: null
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