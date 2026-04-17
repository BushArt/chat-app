const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  senderUsername: {
    type: String,
    required: true,
    index: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  receiverUsername: {
    type: String,
    default: null,
    index: true
  },
  message: {
    type: String,
    required: true,
    maxlength: 5000
  },

  // ✅ Message Status Tracking
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'read'],
    default: 'sent'
  },
  deliveredAt: {
    type: Date,
    default: null
  },
  readAt: {
    type: Date,
    default: null
  },

  // ✅ Edit / Delete Support
  editedAt: {
    type: Date,
    default: null
  },
  deletedAt: {
    type: Date,
    default: null
  },
  isDeleted: {
    type: Boolean,
    default: false
  },

  // ✅ Message Types & Attachments
  type: {
    type: String,
    enum: ['text', 'image', 'file', 'system'],
    default: 'text'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({}),
    validate: {
      validator: function(v) {
        try {
          // Limit metadata size to ~10kb (accurate byte count)
          const size = Buffer.byteLength(JSON.stringify(v || {}), 'utf8');
          return size < 10240;
        } catch {
          return false; // Invalid if serialization fails
        }
      },
      message: 'Metadata exceeds maximum size limit of 10kb'
    }
  },

  // ✅ Threading Support
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },

  // ✅ Client Tracking
  clientId: {
    type: String,
    default: null,
    maxlength: 64
  },
}, {
  timestamps: true
});

// Index for fast global chat history lookups (receiver null = global)
messageSchema.index({ receiver: 1, createdAt: -1 });

// Compound index for fast DM history lookups (newest first)
messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
messageSchema.index({ receiver: 1, sender: 1, createdAt: -1 });

// Username based indexes for backwards compatibility
messageSchema.index({ senderUsername: 1, receiverUsername: 1, createdAt: -1 });

// Status tracking indexes for read receipts
messageSchema.index({ receiver: 1, status: 1 });

// Auto cleanup for soft deleted messages after 30 days
messageSchema.index({ deletedAt: 1 }, { expireAfterSeconds: 2592000, partialFilterExpression: { isDeleted: true } });

// Optimized index for client id lookups (optimistic UI)
messageSchema.index({ clientId: 1, sender: 1 }, { partialFilterExpression: { clientId: { $exists: true } } });

// Pre-save hook to prevent self-replies
messageSchema.pre('save', function(next) {
  if (this.replyTo && this.replyTo.equals(this._id)) {
    return next(new Error('Message cannot reply to itself'));
  }
  next();
});

module.exports = mongoose.model('Message', messageSchema);
