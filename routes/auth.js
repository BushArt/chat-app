const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const HttpError = require('../utils/HttpError');

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
      password: hashedPassword 
    });
    
    await user.save();

    res.status(201).json({ message: 'Account created! You can now log in.' });

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

    res.json({ token, username: user.username });

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

module.exports = router;
