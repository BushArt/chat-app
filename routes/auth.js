const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');

// ─────────────────────────────────────────
// RATE LIMITER
// Max 10 attempts per IP per 15 minutes
// Applies to both login and register
// ─────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
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
  // Disallow: whitespace, control chars, and everything else.
  const allowed = /^[\w\-\u3000-\u9FFF\uA000-\uA4FF\uAC00-\uD7FF\uF900-\uFAFF\u2E80-\u2EFF\u31F0-\u31FF\u3040-\u30FF]+$/u;
  return allowed.test(username);
}

// ─────────────────────────────────────────
// POST /auth/register
// ─────────────────────────────────────────
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({
        error: 'Username must be 1–30 characters and may only contain letters, numbers, underscores, hyphens, or Chinese/Japanese/Korean characters.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();

    res.status(201).json({ message: 'Account created! You can now log in.' });

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// ─────────────────────────────────────────
// POST /auth/login
// ─────────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await User.findOne({ username });

    // Same vague message for both cases — prevents username enumeration
    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, username: user.username });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

module.exports = router;