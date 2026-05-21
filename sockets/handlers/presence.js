/**
 * Presence and connection handlers
 * Join room logic and disconnect cleanup
 */

const logger = require('../../utils/logger');

module.exports = function createPresenceHandlers(io, socket, state, messageAllowed) {

  function handleJoinRoom(roomId) {
    if (!roomId || typeof roomId !== 'string' || roomId.length > 100) return;
    
    if (roomId === 'global') {
      socket.join(roomId);
      logger.info({ event: 'join_room', socketId: socket.id, room: roomId });
      return;
    }
    
    const parts = roomId.split('_');
    if (parts.length === 2 && (parts[0] === socket.username || parts[1] === socket.username)) {
      socket.join(roomId);
      logger.info({ event: 'join_room', socketId: socket.id, room: roomId });
    }
  }

  function handleDisconnect() {
    messageAllowed.cleanup();
    
    if (socket.username) {
      let remaining = (Number(state.onlineUsers.get(socket.username)) || 1) - 1;
      if (remaining < 0) remaining = 0;
      if (remaining <= 0) {
        state.onlineUsers.delete(socket.username);
        io.emit('online_users', state.getOnlineList());
        logger.info({ event: 'user_offline', username: socket.username });

        for (const [key, timeout] of state.typingTimeouts.entries()) {
          if (key.startsWith(`${socket.username}:`)) {
            clearTimeout(timeout);
            state.typingTimeouts.delete(key);
          }
        }
      } else {
        state.onlineUsers.set(socket.username, remaining);
        logger.info({ event: 'closed_tab', username: socket.username, remaining });
      }
    }
  }

  return {
    handleJoinRoom,
    handleDisconnect
  };
};