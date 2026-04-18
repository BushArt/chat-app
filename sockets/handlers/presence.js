/**
 * Presence and connection handlers
 * Join room logic and disconnect cleanup
 */

module.exports = function createPresenceHandlers(io, socket, state, messageAllowed) {

  function handleJoinRoom(roomId) {
    if (!roomId || typeof roomId !== 'string' || roomId.length > 100) return;
    
    if (roomId === 'global') {
      socket.join(roomId);
      console.log(`${socket.id} joined room: ${roomId}`);
      return;
    }
    
    const parts = roomId.split('_');
    if (parts.length === 2 && (parts[0] === socket.username || parts[1] === socket.username)) {
      socket.join(roomId);
      console.log(`${socket.id} joined room: ${roomId}`);
    }
  }

  function handleDisconnect() {
    messageAllowed.cleanup();
    
    if (socket.username) {
      const remaining = (state.onlineUsers.get(socket.username) || 1) - 1;
      if (remaining <= 0) {
        state.onlineUsers.delete(socket.username);
        io.emit('online_users', state.getOnlineList());
        console.log(`${socket.username} fully offline`);

        for (const [key, timeout] of state.typingTimeouts.entries()) {
          if (key.startsWith(`${socket.username}:`)) {
            clearTimeout(timeout);
            state.typingTimeouts.delete(key);
          }
        }
      } else {
        state.onlineUsers.set(socket.username, remaining);
        console.log(`${socket.username} closed a tab (${remaining} connection(s) remaining)`);
      }
    }
  }

  return {
    handleJoinRoom,
    handleDisconnect
  };
};