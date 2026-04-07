const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ─────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────

const USERNAME_MAX = 32;
const USERNAME_MIN = 2;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 128;

// Usernames: allow letters (any script — so Chinese names work),
// digits, underscores, and hyphens.  Block characters that could
// break URL paths or cause display issues.
const VALID_USERNAME = /^[\p{L}\p{N}_-]+$/u;

function validateUsername(username) {
  if (typeof username !== 'string') return 'Username must be a string.';
  const u = username.trim();
  if (u.length < USERNAME_MIN) return `Username must be at least ${USERNAME_MIN} characters.`;
  if (u.length > USERNAME_MAX) return `Username must be at most ${USERNAME_MAX} characters.`;
  if (!VALID_USERNAME.test(u)) return 'Username may only contain letters, numbers, _ and -.';
  return null;
}

function validatePassword(password) {
  if (typeof password !== 'string') return 'Password must be a string.';
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters.`;
  return null;
}

// ─────────────────────────────────────────
// POST /auth/register
// Creates a new user account
// ─────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate inputs before touching the database
    const usernameError = validateUsername(username);
    if (usernameError) return res.status(400).json({ error: usernameError });

    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const cleanUsername = username.trim();

    // Case-insensitive uniqueness check so 你好 and 你好 can't both register
    // (MongoDB's collation handles this properly for Unicode strings).
    const existingUser = await User.findOne({
      username: { $regex: new RegExp(`^${cleanUsername}$`, 'iu') }
    });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already taken.' });
    }

    // Hash the password before saving.
    // Never store plain text passwords — bcrypt scrambles it irreversibly.
    const hashedPassword = await bcrypt.hash(password, 12);  // increased from 10 → 12

    const user = new User({ username: cleanUsername, password: hashedPassword });
    await user.save();

    res.status(201).json({ message: 'Account created! You can now log in.' });

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// ─────────────────────────────────────────
// POST /auth/login
// Validates credentials and returns a token
// ─────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    // Accept the username exactly as typed (already trimmed on register)
    const user = await User.findOne({ username: username.trim() });

    // Always run bcrypt.compare even when user is not found.
    // This prevents timing attacks that reveal whether a username exists.
    const dummyHash = '$2b$12$invalidhashfortimingprotectiononly';
    const isMatch = user
      ? await bcrypt.compare(password, user.password)
      : await bcrypt.compare(password, dummyHash).then(() => false);

    if (!user || !isMatch) {
      // Return the same generic message for both "no user" and "wrong password"
      return res.status(400).json({ error: 'Invalid username or password.' });
    }

    // Create a JWT token — like a stamped ticket proving who you are.
    // The frontend stores this and sends it with future requests.
    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, username: user.username });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

module.exports = router;