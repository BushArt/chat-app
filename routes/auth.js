const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ─────────────────────────────────────────
// POST /auth/register
// Creates a new user account
// ─────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Reject if username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Hash the password before saving
    // Never store plain text passwords — bcrypt scrambles it irreversibly
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save new user to the database
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
// Validates credentials and returns a token
// ─────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find user in database
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Compare submitted password against stored hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect password' });
    }

    // Create a JWT token — like a stamped ticket proving who you are
    // The frontend stores this and sends it with future requests
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