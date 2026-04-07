const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 2,
    maxlength: 32
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    maxlength: 256   // bcrypt hashes are always 60 chars, but leave headroom
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);