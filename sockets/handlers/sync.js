/**
 * Sync handler
 * Accepts { lastSeenAt } and emits missed global messages to the reconnecting socket
 */

const Message = require('../../models/Message');
const logger = require('../../utils/logger');

const MAX_HISTORY_GLOBAL = 100;

module.exports = function createSyncHandler(io, socket, state, messageAllowed) {
  return async function handleSync(data, ack) {
    const username = socket.username;
    if (!username) return;

    // Optional per-connection rate limiting to prevent abuse
    try {
      if (typeof messageAllowed === 'function' && !messageAllowed()) {
        socket.emit('error_message', { error: 'Too many requests' });
        if (typeof ack === 'function') {
          try { ack({ status: 'error', message: 'rate_limited' }); } catch (e) {}
        }
        return;
      }
    } catch (e) {
      // ignore limiter errors and proceed
    }

    let lastSeen = null;
    if (data && typeof data.lastSeenAt === 'string') {
      const parsed = new Date(data.lastSeenAt);
      if (!Number.isNaN(parsed.getTime())) lastSeen = parsed;
    }

    try {
      let docs;
      if (lastSeen) {
        docs = await Message.find({ isGlobal: true, createdAt: { $gt: lastSeen } }).sort({ createdAt: 1 }).limit(MAX_HISTORY_GLOBAL);
      } else {
        docs = await Message.find({ isGlobal: true }).sort({ createdAt: -1 }).limit(MAX_HISTORY_GLOBAL);
        docs = docs.reverse();
      }

      // Emit missed messages only to this socket
      const payloads = docs.map(d => ({ sender: d.sender, message: d.message, createdAt: d.createdAt, clientId: d.clientId, id: d._id }));
      payloads.forEach(p => {
        try { socket.emit('receive_global_message', p); } catch (e) {}
      });

      logger.info({ event: 'sync', username, lastSeenAt: lastSeen ? lastSeen.toISOString() : null, count: payloads.length });

      if (typeof ack === 'function') {
        try { ack({ status: 'ok', count: payloads.length }); } catch (e) {}
      }
    } catch (err) {
      logger.error({ event: 'sync_error', err: String(err), username });
      socket.emit('error_message', { error: 'Could not sync messages' });
      if (typeof ack === 'function') {
        try { ack({ status: 'error', message: String(err) }); } catch (e) {}
      }
    }
  };
};
