/**
 * Typing indicator handlers
 * Handles start_typing and stop_typing events
 */

module.exports = function createTypingHandlers(io, socket, state) {

  function handleStartTyping({ room }) {
    const sender = socket.username;
    if (!sender || !room || typeof room !== 'string') return;

    const key = `${sender}:${room}`;
    socket.to(room).emit('user_typing', { username: sender, room });

    clearTimeout(state.typingTimeouts.get(key));
    
    while (state.typingTimeouts.size >= state.MAX_TYPING_ENTRIES) {
      const oldestKey = state.typingTimeouts.keys().next().value;
      const oldestTimeout = state.typingTimeouts.get(oldestKey);
      clearTimeout(oldestTimeout);
      state.typingTimeouts.delete(oldestKey);
    }
    
    state.typingTimeouts.set(key, setTimeout(() => {
      socket.to(room).emit('user_stopped_typing', { username: sender, room });
      state.typingTimeouts.delete(key);
    }, state.TYPING_TIMEOUT));
  }

  function handleStopTyping({ room }) {
    const sender = socket.username;
    if (!sender || !room || typeof room !== 'string') return;

    const key = `${sender}:${room}`;
    clearTimeout(state.typingTimeouts.get(key));
    state.typingTimeouts.delete(key);

    socket.to(room).emit('user_stopped_typing', { username: sender, room });
  }

  return {
    handleStartTyping,
    handleStopTyping
  };
};