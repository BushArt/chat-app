/**
 * Sync handler
 * Accepts { type, lastSeenAt, with, room } and emits missed messages back to the calling socket.
 * - type: 'global' (default) or 'private'
 * - For global: emits 'receive_global_message'
 * - For private: emits 'receive_message' with `room` field set to the expected DM room name
 */

const Message = require('../../models/Message');
const logger = require('../../utils/logger');
const emitError = require('../../utils/socketError');
const HttpError = require('../../utils/HttpError');

const MAX_HISTORY_GLOBAL = 100;
const MAX_HISTORY_PRIVATE = 50;

module.exports = function createSyncHandler(io, socket, state, messageAllowed) {
  return async function handleSync(data, ack) {
    const username = socket.username;
    if (!username) return;

    // Optional per-connection rate limiting to prevent abuse
    try {
      if (typeof messageAllowed === 'function' && !messageAllowed()) {
        emitError(socket, 'error_message', new HttpError('Too many requests', 429, 'rate_limited'));
        if (typeof ack === 'function') {
          try { ack({ status: 'error', message: 'rate_limited' }); } catch (e) {
            logger.error({ event: 'ack_error', context: 'sync_rate_limited', err: String(e), username });
          }
        }
        return;
      }
    } catch (e) {
      // ignore limiter errors and proceed
    }

    const type = data?.type === 'private' ? 'private' : 'global';
    let lastSeen = null;
    if (data && typeof data.lastSeenAt === 'string') {
      const parsed = new Date(data.lastSeenAt);
      if (!Number.isNaN(parsed.getTime())) lastSeen = parsed;
    }

    if (type === 'private') {
      const peer = data?.with && typeof data.with === 'string' ? data.with.trim() : null;
      const room = data?.room && typeof data.room === 'string' ? data.room.trim() : null;

      if (!peer && !room) {
        if (typeof ack === 'function') {
          const errorResponse = new HttpError('Missing peer or room for private sync', 400, 'missing_peer_or_room');
          emitError(socket, 'error_message', errorResponse);
          try { ack({ status: 'error', message: errorResponse.message, code: errorResponse.code }); } catch (e) {
            logger.error({ event: 'ack_error', context: 'sync_missing_with_or_room', err: String(e), username });
          }
        }
        return;
      }

      let otherUser = peer;
      let expectedRoom = room;
      if (!otherUser && expectedRoom) {
        const parts = expectedRoom.split(':');
        if (parts.length !== 2 || !parts.includes(username)) {
          if (typeof ack === 'function') {
            const errorResponse = new HttpError('Invalid room format for private sync', 400, 'invalid_room');
            emitError(socket, 'error_message', errorResponse);
            try { ack({ status: 'error', message: errorResponse.message, code: errorResponse.code }); } catch (e) {
              logger.error({ event: 'ack_error', context: 'sync_invalid_room', err: String(e), username });
            }
          }
          return;
        }
        otherUser = parts.find((p) => p !== username);
      }

      if (otherUser && otherUser === username) {
        if (typeof ack === 'function') {
          const errorResponse = new HttpError('Cannot sync private messages with yourself', 400, 'invalid_peer');
          emitError(socket, 'error_message', errorResponse);
          try { ack({ status: 'error', message: errorResponse.message, code: errorResponse.code }); } catch (e) {
            logger.error({ event: 'ack_error', context: 'sync_invalid_peer', err: String(e), username });
          }
        }
        return;
      }

      if (otherUser && !expectedRoom) expectedRoom = [username, otherUser].sort().join(':');

      try {
        let query = Message.find({
          isGlobal: false,
          $or: [
            { sender: username, receiver: otherUser },
            { sender: otherUser, receiver: username }
          ]
        });

        if (lastSeen) {
          query = query.where('createdAt').gt(lastSeen);
        }

        const docs = await query.sort({ createdAt: 1 }).limit(MAX_HISTORY_PRIVATE);
        const payloads = docs.map((doc) => ({
          sender: doc.sender,
          receiver: doc.receiver,
          message: doc.message,
          createdAt: doc.createdAt,
          clientId: doc.clientId,
          id: doc._id,
          room: expectedRoom,
          attachment: doc.attachment || null,
        }));

        payloads.forEach((payload) => {
          try { socket.emit('receive_message', payload); } catch (e) {
            logger.error({ event: 'emit_error', context: 'sync_private_emit', err: String(e), username, peer: otherUser });
          }
        });

        logger.info({ event: 'sync', type: 'private', username, peer: otherUser, room: expectedRoom, lastSeenAt: lastSeen ? lastSeen.toISOString() : null, count: payloads.length });
        if (typeof ack === 'function') {
          try { ack({ status: 'ok', count: payloads.length }); } catch (e) {
            logger.error({ event: 'ack_error', context: 'sync_private_ok_ack', err: String(e), username });
          }
        }
      } catch (err) {
        logger.error({ event: 'sync_error', type: 'private', err: String(err), username });
        const errorResponse = new HttpError('Server error during private sync', 500, 'private_sync_failed');
        emitError(socket, 'error_message', errorResponse);
        if (typeof ack === 'function') {
          try { ack({ status: 'error', message: errorResponse.message, code: errorResponse.code }); } catch (e) {
            logger.error({ event: 'ack_error', context: 'sync_private_error_ack', err: String(e), username });
          }
        }
      }
      return;
    }

    try {
      let docs;
      if (lastSeen) {
        docs = await Message.find({ isGlobal: true, createdAt: { $gt: lastSeen } }).sort({ createdAt: 1 }).limit(MAX_HISTORY_GLOBAL);
      } else {
        docs = await Message.find({ isGlobal: true }).sort({ createdAt: -1 }).limit(MAX_HISTORY_GLOBAL);
        docs = docs.reverse();
      }

      const payloads = docs.map((doc) => ({ sender: doc.sender, message: doc.message, createdAt: doc.createdAt, clientId: doc.clientId, id: doc._id, attachment: doc.attachment || null }));
      payloads.forEach((payload) => {
        try { socket.emit('receive_global_message', payload); } catch (e) {
          logger.error({ event: 'emit_error', context: 'sync_global_emit', err: String(e), username });
        }
      });

      logger.info({ event: 'sync', type: 'global', username, lastSeenAt: lastSeen ? lastSeen.toISOString() : null, count: payloads.length });
      if (typeof ack === 'function') {
        try { ack({ status: 'ok', count: payloads.length }); } catch (e) {
          logger.error({ event: 'ack_error', context: 'sync_global_ok_ack', err: String(e), username });
        }
      }
    } catch (err) {
      logger.error({ event: 'sync_error', type: 'global', err: String(err), username });
      const errorResponse = new HttpError('Server error during global sync', 500, 'global_sync_failed');
      emitError(socket, 'error_message', errorResponse);
      if (typeof ack === 'function') {
        try { ack({ status: 'error', message: errorResponse.message, code: errorResponse.code }); } catch (e) {
          logger.error({ event: 'ack_error', context: 'sync_global_error_ack', err: String(e), username });
        }
      }
    }
  };
};
