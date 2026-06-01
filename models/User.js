const mongoose = require('mongoose');

/**
 * Count Unicode code points in a string, handling surrogate pairs correctly.
 */
function countCodePoints(str) {
  return [...str].length;
}

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  displayName: {
    type: String,
    default: '',
    trim: true,
    validate: {
      validator: function (v) {
        if (!v) return true; // empty string is allowed (default)
        return countCodePoints(v) <= 50;
      },
      message: 'Display name must be at most 50 characters.'
    }
  },
  bio: {
    type: String,
    default: '',
    trim: true,
    validate: {
      validator: function (v) {
        if (!v) return true;
        return countCodePoints(v) <= 160;
      },
      message: 'Bio must be at most 160 characters.'
    }
  },
  status: {
    type: String,
    default: 'online',
    enum: {
      values: ['online', 'away', 'busy', 'offline'],
      message: 'Status must be one of: online, away, busy, offline.'
    }
  },
  lastLogout: {
    type: Date,
    default: null
  },
  avatarUrl: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Pre-save hook: set displayName to username if not provided
userSchema.pre('save', async function () {
  if (!this.displayName || this.displayName === '') {
    this.displayName = this.username;
  }
});

module.exports = mongoose.model('User', userSchema);
