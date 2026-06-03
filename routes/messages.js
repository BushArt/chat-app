const express = require('express');
const router = express.Router();
const makeRateLimiter = require('../middleware/rateLimiter');
const HttpError = require('../utils/HttpError');
const crypto = require('crypto');

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

// ─────────────────────────────────────────
// Upload rate limiter: 20 requests per 15 minutes per IP
// ─────────────────────────────────────────
function uploadRateLimitMiddleware(req, res, next) {
  if (isTestEnvironment) return next();
  try {
    if (!req.app.locals._uploadRateLimiters) {
      req.app.locals._uploadRateLimiters = new Map();
      setInterval(() => {
        req.app.locals._uploadRateLimiters.clear();
      }, 15 * 60 * 1000).unref();
    }
    const ip = req.ip || req.connection.remoteAddress || 'anonymous';
    const map = req.app.locals._uploadRateLimiters;
    if (!map.has(ip)) map.set(ip, makeRateLimiter(20, 15 * 60 * 1000));
    const limiter = map.get(ip);
    if (!limiter()) return next(new HttpError('Too many upload requests', 429, 'upload_rate_limited'));
    return next();
  } catch (err) {
    return next();
  }
}

// ─────────────────────────────────────────
// Classify MIME type into attachment type
// ─────────────────────────────────────────
function classifyAttachmentType(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'file';
}

// ─────────────────────────────────────────
// POST /messages/upload
// Upload a file and return attachment metadata.
// ─────────────────────────────────────────
const { uploadToCloudinary } = require('../config/cloudinary');
const { attachmentUpload } = require('../middleware/upload');
const { MAX_VOICE_SIZE } = require('../config/env');
const logger = require('../utils/logger');

router.post('/upload', verifyToken, uploadRateLimitMiddleware, attachmentUpload.single('file'), async (req, res, next) => {
  try {
    // 1. Validate file present
    if (!req.file) {
      return next(new HttpError('No file provided.', 400, 'no_file'));
    }

    // 2. Voice messages are limited to 10 MB (stricter than the 25 MB general limit)
    if (req.file.mimetype.startsWith('audio/') && req.file.size > MAX_VOICE_SIZE) {
      return next(new HttpError('Audio file exceeds the 10 MB limit.', 400, 'voice_size_exceeded'));
    }

    // 3. Parse form fields
    const { room, receiver, isGlobal } = req.body;

    if (!room) {
      return next(new HttpError('Room is required.', 400, 'room_required'));
    }

    // 4. Authorization check for private messages
    if (isGlobal !== 'true') {
      if (!receiver) {
        return next(new HttpError('Receiver is required for private messages.', 400, 'receiver_required'));
      }

      // Parse room participants from the "userA:userB" format
      const participants = room.split(':');
      if (participants.length !== 2) {
        return next(new HttpError('Invalid room format.', 400, 'invalid_room'));
      }
      const [userA, userB] = participants;

      // The authenticated user must be a participant of this room
      if (req.user.username !== userA && req.user.username !== userB) {
        return next(new HttpError('Forbidden', 403, 'forbidden_upload'));
      }

      // The receiver must be a participant of this room
      if (receiver !== userA && receiver !== userB) {
        return next(new HttpError('Receiver is not a participant of this room.', 400, 'invalid_receiver'));
      }

      // Cannot upload files to yourself
      if (req.user.username === receiver) {
        return next(new HttpError('Cannot upload files to yourself.', 400, 'self_upload'));
      }
    }

    logger.info({
      event: 'upload_start',
      username: req.user.username,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

    // 5. Generate safe public ID
    const publicId = `chat-app/attachments/${crypto.randomUUID()}`;

    // 6. Upload to Cloudinary
    let result;
    try {
      // Prefer explicit resource_type for known media types to avoid
      // Cloudinary treating images as 'raw' in some cases.
      let resource_type = 'auto';
      if (req.file.mimetype && req.file.mimetype.startsWith('image/')) resource_type = 'image';
      else if (req.file.mimetype && req.file.mimetype.startsWith('video/')) resource_type = 'video';
      else if (req.file.mimetype && req.file.mimetype.startsWith('audio/')) resource_type = 'video';

      result = await uploadToCloudinary(req.file.buffer, {
        public_id: publicId,
        resource_type
      });
    } catch (cloudinaryErr) {
      logger.error({ event: 'upload_failure', username: req.user.username, error: String(cloudinaryErr), mimetype: req.file.mimetype });
      return next(new HttpError('Failed to upload file.', 500, 'upload_failed'));
    }

    // Try to pick up client-provided duration (in ms) for audio attachments
    const durationMs = req.body && req.body.duration_ms ? Number(req.body.duration_ms) : 0;
    logger.info({
      event: 'upload_success',
      username: req.user.username,
      cloudinary_public_id: result.public_id,
      duration_ms: Number.isFinite(durationMs) ? durationMs : 0
    });

    // 7. Build and return attachment metadata
    const attachment = {
      type: classifyAttachmentType(req.file.mimetype),
      filename: req.file.originalname,
      url: result.secure_url,
      mimetype: req.file.mimetype,
      size: req.file.size,
      duration_ms: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : undefined
    };

    res.json(attachment);
  } catch (err) {
    if (err instanceof HttpError) return next(err);
    logger.error({ event: 'upload_error', err: String(err) });
    next(new HttpError('Server error during upload.', 500, 'upload_error'));
  }
});

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