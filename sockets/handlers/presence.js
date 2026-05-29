/**
 * Presence and connection handlers
 * Join room logic and disconnect cleanup
 */

const User = require('../../models/User');
const logger = require('../../utils/logger');

module.exports = function createPresenceHandlers(io, socket, state, messageAllowed, joinLimiter) {

  function handleJoinRoom(roomId) {
    if (!roomId || typeof roomId !== 'string' || roomId.length > 100) return;
    if (joinLimiter && !joinLimiter()) return;
    
    if (roomId === 'global') {
      socket.join(roomId);
      logger.info({ event: 'join_room', socketId: socket.id, room: roomId });
      return;
    }
    
    const colonIdx = roomId.indexOf(':');
    if (colonIdx > 0) {
      const a = roomId.slice(0, colonIdx);
      const b = roomId.slice(colonIdx + 1);
      if (a === socket.username || b === socket.username) {
        socket.join(roomId);
        logger.info({ event: 'join_room', socketId: socket.id, room: roomId });
      }
    }
  }

  async function handleDisconnect() {
    messageAllowed.cleanup();
    
    if (socket.username) {
      const sockets = state.onlineUsers.get(socket.username);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          state.onlineUsers.delete(socket.username);
          // Set status to offline in DB
          User.updateOne({ username: socket.username }, { status: 'offline' }).catch(err => {
            logger.warn({ event: 'status_update_failed', username: socket.username, status: 'offline', err: String(err) });
          });
          const onlineList = await state.getOnlineList();
          io.emit('online_users', onlineList);
          logger.info({ event: 'user_offline', username: socket.username });

          // Clean up typing timeouts for this user via indexed lookup (O(1) instead of O(MAX_TYPING))
          const userKeys = state.typingTimeoutsByUser.get(socket.username);
          if (userKeys) {
            userKeys.forEach((key) => {
              clearTimeout(state.typingTimeouts.get(key));
              state.typingTimeouts.delete(key);
            });
            state.typingTimeoutsByUser.delete(socket.username);
          }
        } else {
          logger.info({ event: 'closed_tab', username: socket.username, remaining: sockets.size });
        }
      }
    }
  }

  return {
    handleJoinRoom,
    handleDisconnect
  };
};