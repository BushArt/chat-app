const express = require('express');
const router = express.Router();
const makeRateLimiter = require('../middleware/rateLimiter');
const HttpError = require('../utils/HttpError');

const isTestEnvironment = process.env.NODE_ENV === 'test';

// Small per-IP express middleware using in-memory limiter instances
function rateLimitMiddleware(req, res, next) {
  if (isTestEnvironment) return next();
  try {
    if (!req.app.locals._rateLimiters) {
      req.app.locals._rateLimiters = new Map();
      // Periodically purge stale entries to prevent unbounded memory growth
      setInterval(() => {
        req.app.locals._rateLimiters.clear();
      }, 15 * 60 * 1000).unref();
    }
    const ip = req.ip || req.connection.remoteAddress || 'anonymous';
    const map = req.app.locals._rateLimiters;
    if (!map.has(ip)) map.set(ip, makeRateLimiter());
    const limiter = map.get(ip);
    if (!limiter()) return next(new HttpError('Too many requests', 429, 'rate_limited'));
    return next();
  } catch (err) {
    return next();
  }
}
const Message = require('../models/Message');
const verifyToken = require('../middleware/auth');

const MAX_HISTORY_GLOBAL = 100;
const MAX_HISTORY_PRIVATE = 50;
const ObjectId = require('mongoose').Types.ObjectId;

/**
 * Parse the `before` query parameter into a MongoDB filter condition.
 * Accepts a 24-hex-char MongoDB ObjectId string or an ISO 8601 timestamp.
 * Returns `null` when `before` is not provided.
 * Throws a 400 HttpError when `before` is present but invalid.
 */
function parseBeforeParam(before) {
  if (before === undefined || before === null || before === '') return null;

  // Try ObjectId (24 hex chars)
  if (/^[0-9a-fA-F]{24}$/.test(before)) {
    return { _id: { $lt: new ObjectId(before) } };
  }

  // Try ISO 8601 timestamp (must look like a date, not a bare number)
  if (/^\d{4}-\d{2}-\d{2}/.test(before)) {
    const ts = Date.parse(before);
    if (!Number.isNaN(ts)) {
      return { createdAt: { $lt: new Date(before) } };
    }
  }

  throw new HttpError(
    'Invalid `before` parameter. Must be a valid ObjectId or ISO timestamp.',
    400,
    'invalid_pagination_cursor'
  );
}

/**
 * Paginated fetch helper.
 * Runs the same query regardless of `before`. The only difference is the
 * filter condition — when `before` is provided, an additional `_id < cursor`
 * or `createdAt < cursor` clause is added.
 */
async function fetchPaginated(findFilter, limit, before) {
  const filter = before ? { ...findFilter, ...parseBeforeParam(before) } : findFilter;

  const messages = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit);

  const chronological = messages.reverse();
  const hasMore = messages.length === limit;
  const cursor = hasMore && messages.length > 0
    ? String(messages[messages.length - 1]._id)
    : null;

  return { messages: chronological, hasMore, cursor };
}

router.get('/global', rateLimitMiddleware, verifyToken, async (req, res, next) => {
  try {
    const result = await fetchPaginated({ isGlobal: true }, MAX_HISTORY_GLOBAL, req.query.before);
    res.json(result);
  } catch (err) {
    if (err instanceof HttpError) return next(err);
    next(new HttpError('Could not fetch global messages', 500, 'global_messages_fetch_failed'));
  }
});

router.get('/:user1/:user2', verifyToken, async (req, res, next) => {
  const { user1, user2 } = req.params;

  // Prevent users from reading other people's private conversations
  if (req.user.username !== user1 && req.user.username !== user2) {
    return next(new HttpError('Forbidden', 403, 'forbidden_access'));
  }
  try {
    const result = await fetchPaginated(
      {
        isGlobal: false,
        $or: [
          { sender: user1, receiver: user2 },
          { sender: user2, receiver: user1 }
        ]
      },
      MAX_HISTORY_PRIVATE,
      req.query.before
    );
    res.json(result);
  } catch (err) {
    if (err instanceof HttpError) return next(err);
    next(new HttpError('Could not fetch messages', 500, 'private_messages_fetch_failed'));
  }
});

module.exports = router;