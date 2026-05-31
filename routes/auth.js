const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const HttpError = require('../utils/HttpError');
const cloudinary = require('../config/cloudinary');
const { uploadToCloudinary } = require('../config/cloudinary');
const { avatarUpload } = require('../middleware/upload');

const isTestEnvironment = process.env.NODE_ENV === 'test';

// Escape user input before constructing RegExp to avoid regex injection
function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─────────────────────────────────────────
// RATE LIMITER
// Max 10 attempts per IP per 15 minutes
// Applies to both login and register
// ─────────────────────────────────────────
const authLimiter = isTestEnvironment
  ? (req, res, next) => next()
  : rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn({ event: 'rate_limit', ip: req.ip, path: req.path });
    next(new HttpError(options.message.error, options.statusCode, 'rate_limited'));
  }
});

// Profile update rate limiter: 20 updates per hour per IP
const profileLimiter = isTestEnvironment
  ? (req, res, next) => next()
  : rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Too many profile updates, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn({ event: 'rate_limit_profile', ip: req.ip });
    next(new HttpError(options.message.error, options.statusCode, 'rate_limited'));
  }
});

// ─────────────────────────────────────────
// USERNAME VALIDATION
// Allows: Latin letters, digits, underscores,
// hyphens, Chinese (Simplified + Traditional),
// Japanese (Hiragana, Katakana, Kanji),
// Korean (Hangul), and other CJK unified ideographs.
// No whitespace or special characters allowed.
// Must be 1–30 characters (codepoints, not bytes).
// ─────────────────────────────────────────
function isValidUsername(username) {
  if (typeof username !== 'string') return false;

  // Count Unicode code points (handles emoji / surrogate pairs correctly)
  const codePoints = [...username].length;
  if (codePoints < 1 || codePoints > 30) return false;

  // Allow: word characters (Latin/digits/_), hyphens,
  // and any CJK / Hangul / Hiragana / Katakana blocks.
  // Disallow: whitespace (including U+3000 ideographic space),
  // control chars, and everything else.
  // NOTE: range starts at U+3001 (not U+3000) to exclude ideographic space.
  const allowed = /^[\w\-\u3001-\u9FFF\uA000-\uA4FF\uAC00-\uD7FF\uF900-\uFAFF\u2E80-\u2EFF\u31F0-\u31FF\u3040-\u30FF]+$/u;
  return allowed.test(username);
}

// ─────────────────────────────────────────
// DISPLAY NAME VALIDATION
// Same as username but also allows spaces,
// periods, apostrophes, and common punctuation.
// Max 50 codepoints.
// ─────────────────────────────────────────
function isValidDisplayName(v) {
  if (typeof v !== 'string') return false;
  const trimmed = v.trim();
  const cp = [...trimmed].length;
  if (cp < 1 || cp > 50) return false;
  // Allow username characters plus spaces, periods, apostrophes, commas, exclamation, question marks
  const allowed = /^[\w\-\u3001-\u9FFF\uA000-\uA4FF\uAC00-\uD7FF\uF900-\uFAFF\u2E80-\u2EFF\u31F0-\u31FF\u3040-\u30FF .,'!?]+$/u;
  return allowed.test(trimmed);
}

// ─────────────────────────────────────────
// BIO VALIDATION
// Max 160 codepoints, no HTML tags.
// ─────────────────────────────────────────
function isValidBio(v) {
  if (typeof v !== 'string') return false;
  const trimmed = v.trim();
  const cp = [...trimmed].length;
  if (cp > 160) return false;
  // Reject HTML tags
  return !/<[^>]*>/u.test(trimmed);
}

// ─────────────────────────────────────────
// Count Unicode code points
// ─────────────────────────────────────────
function countCodePoints(str) {
  return [...str].length;
}

// ─────────────────────────────────────────
// Build profile response object (no password)
// ─────────────────────────────────────────
function buildProfile(user) {
  return {
    username: user.username,
    displayName: user.displayName || user.username,
    bio: user.bio || '',
    status: user.status || 'online',
    avatarUrl: user.avatarUrl || null,
    createdAt: user.createdAt
  };
}

// ─────────────────────────────────────────
// POST /auth/register
// ─────────────────────────────────────────
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return next(new HttpError('Username and password are required', 400, 'missing_credentials'));
    }

    // Input hygiene
    const trimmedUsername = username.trim();

    if (!isValidUsername(trimmedUsername)) {
      return next(new HttpError(
        'Username must be 1–30 characters and may only contain letters, numbers, underscores, hyphens, or Chinese/Japanese/Korean characters.',
        400,
        'invalid_username'
      ));
    }

    if (password.length < 6) {
      return next(new HttpError('Password must be at least 6 characters', 400, 'password_too_short'));
    }
    
    if (password.length > 128) {
      return next(new HttpError('Password maximum length is 128 characters', 400, 'password_too_long'));
    }

    const existingUser = await User.findOne({ 
      username: { $regex: new RegExp(`^${escapeRegExp(trimmedUsername)}$`, 'i') } 
    });
    
    if (existingUser) {
      return next(new HttpError('Username already taken', 400, 'username_taken'));
    }

    const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    const hashedPassword = await bcrypt.hash(password, bcryptRounds);
    
    const user = new User({ 
      username: trimmedUsername,
      displayName: trimmedUsername,
      password: hashedPassword 
    });
    
    await user.save();

    // Generate JWT so client can start using the app immediately
    if (!process.env.JWT_SECRET) {
      logger.error({ event: 'jwt_missing' });
      return next(new HttpError('Server configuration error', 500, 'jwt_secret_missing'));
    }

    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      ...buildProfile(user)
    });

  } catch (err) {
    if (err.code === 11000) {
      return next(new HttpError('Username already taken', 400, 'username_taken'));
    }
    logger.error({ event: 'register_error', err: String(err) });
    next(new HttpError('Server error during registration', 500, 'registration_failed'));
  }
});

// ─────────────────────────────────────────
// POST /auth/login
// ─────────────────────────────────────────
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return next(new HttpError('Username and password are required', 400, 'missing_credentials'));
    }

    // Input hygiene
    const trimmedUsername = username.trim();

    if (password.length > 128) {
      return next(new HttpError('Password maximum length is 128 characters', 400, 'password_too_long'));
    }

    const user = await User.findOne({ 
      username: { $regex: new RegExp(`^${escapeRegExp(trimmedUsername)}$`, 'i') } 
    });

    // Same vague message for both cases — prevents username enumeration
    if (!user) {
      logger.warn({ event: 'failed_login', username: trimmedUsername, ip: req.ip });
      return next(new HttpError('Invalid username or password', 400, 'invalid_credentials'));
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.warn({ event: 'failed_login', username: user.username, ip: req.ip });
      return next(new HttpError('Invalid username or password', 400, 'invalid_credentials'));
    }

    if (!process.env.JWT_SECRET) {
      logger.error({ event: 'jwt_missing' });
      return next(new HttpError('Server configuration error', 500, 'jwt_secret_missing'));
    }

    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      ...buildProfile(user)
    });

  } catch (err) {
    logger.error({ event: 'login_error', err: String(err) });
    next(new HttpError('Server error during login', 500, 'login_failed'));
  }
});

// ─────────────────────────────────────────
// POST /auth/logout
// Revokes all existing tokens by recording the logout timestamp.
// ─────────────────────────────────────────
const verifyToken = require('../middleware/auth');

router.post('/logout', verifyToken, async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { lastLogout: new Date() });
    logger.info({ event: 'logout', username: req.user.username });
    res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    logger.error({ event: 'logout_error', err: String(err) });
    next(new HttpError('Server error during logout', 500, 'logout_failed'));
  }
});

// ─────────────────────────────────────────
// GET /auth/me
// Returns the current user's profile.
// ─────────────────────────────────────────
router.get('/me', verifyToken, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-password').lean();

    if (!user) {
      return next(new HttpError('User not found', 404, 'user_not_found'));
    }

    res.json(buildProfile(user));
  } catch (err) {
    logger.error({ event: 'get_me_error', err: String(err) });
    next(new HttpError('Server error', 500, 'server_error'));
  }
});

// ─────────────────────────────────────────
// PUT /auth/profile
// Updates the current user's profile.
// Accepts multipart/form-data (with optional avatar file) or JSON body
// with any subset of { displayName, bio, status }.
// ─────────────────────────────────────────
router.put('/profile', verifyToken, profileLimiter, avatarUpload.single('avatar'), async (req, res, next) => {
  try {
    // req.body fields come from multer (multipart) or express.json() (JSON)
    const { displayName, bio, status } = req.body;

    const updateFields = {};
    const changedFields = [];

    // Validate displayName if provided
    if (displayName !== undefined) {
      const trimmed = String(displayName).trim();
      if (!isValidDisplayName(displayName)) {
        return next(new HttpError(
          'Display name must be 1–50 characters and may only contain letters, numbers, spaces, and common punctuation.',
          400,
          'invalid_display_name'
        ));
      }
      updateFields.displayName = trimmed;
      changedFields.push('displayName');
    }

    // Validate bio if provided
    if (bio !== undefined) {
      if (!isValidBio(bio)) {
        return next(new HttpError(
          'Bio must be at most 160 characters and may not contain HTML.',
          400,
          'invalid_bio'
        ));
      }
      updateFields.bio = String(bio).trim();
      changedFields.push('bio');
    }

    // Validate status if provided
    if (status !== undefined) {
      const allowed = ['online', 'away', 'busy'];
      if (!allowed.includes(status)) {
        return next(new HttpError(
          'Status must be one of: online, away, busy.',
          400,
          'invalid_status'
        ));
      }
      updateFields.status = status;
      changedFields.push('status');
    }

    // Handle avatar upload if a file was provided
    if (req.file) {
      try {
        const result = await uploadToCloudinary(req.file.buffer, {
          folder: 'chat-app/avatars',
          public_id: `user_${req.user.username}`,
          overwrite: true
        });
        updateFields.avatarUrl = result.secure_url;
        changedFields.push('avatarUrl');
      } catch (cloudinaryErr) {
        logger.error({ event: 'avatar_upload_error', username: req.user.username, err: String(cloudinaryErr) });
        return next(new HttpError('Failed to upload avatar.', 500, 'avatar_upload_failed'));
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return next(new HttpError('No valid fields to update.', 400, 'no_fields'));
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return next(new HttpError('User not found', 404, 'user_not_found'));
    }

    logger.info({ event: 'profile_update', username: user.username, changed_fields: changedFields });

    // Broadcast profile_updated via socket.io
    try {
      const io = req.app.get('io');
      if (io) {
        io.emit('profile_updated', {
          username: user.username,
          displayName: user.displayName || user.username,
          status: user.status || 'online',
          avatarUrl: user.avatarUrl || null
        });
      }
    } catch (socketErr) {
      // Non-critical: don't fail the request if broadcast fails
      logger.warn({ event: 'profile_update_broadcast_failed', username: user.username, err: String(socketErr) });
    }

    res.json(buildProfile(user));
  } catch (err) {
    logger.error({ event: 'profile_update_error', err: String(err) });
    next(new HttpError('Server error during profile update', 500, 'profile_update_failed'));
  }
});

module.exports = router;