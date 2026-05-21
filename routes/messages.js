const express = require('express');
const router = express.Router();
const makeRateLimiter = require('../middleware/rateLimiter');

// Small per-IP express middleware using in-memory limiter instances
function rateLimitMiddleware(req, res, next) {
  try {
    if (!req.app.locals._rateLimiters) req.app.locals._rateLimiters = new Map();
    const ip = req.ip || req.connection.remoteAddress || 'anonymous';
    const map = req.app.locals._rateLimiters;
    if (!map.has(ip)) map.set(ip, makeRateLimiter());
    const limiter = map.get(ip);
    if (!limiter()) return res.status(429).json({ error: 'Too many requests' });
    return next();
  } catch (err) {
    return next();
  }
}
const Message = require('../models/Message');
const verifyToken = require('../middleware/auth');

const MAX_HISTORY_GLOBAL = 100;
const MAX_HISTORY_PRIVATE = 50;

router.get('/global', rateLimitMiddleware, verifyToken, async (req, res) => {
  try {
    const messages = await Message.find({ isGlobal: true })
      .sort({ createdAt: -1 })
      .limit(MAX_HISTORY_GLOBAL);
    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch global messages' });
  }
});

router.get('/:user1/:user2', verifyToken, async (req, res) => {
  const { user1, user2 } = req.params;

  // Prevent users from reading other people's private conversations
  if (req.user.username !== user1 && req.user.username !== user2) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const recentMessages = await Message.find({
      isGlobal: false,
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(MAX_HISTORY_PRIVATE);
    // Return chronological order to keep client rendering simple.
    res.json(recentMessages.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch messages' });
  }
});

module.exports = router;