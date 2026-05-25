/**
 * Typing indicator handlers
 * Handles start_typing and stop_typing events
 */

// Per-socket rate limit state: socket.id → { count, resetTimer }
const typingRateLimits = new Map();

module.exports = function createTypingHandlers(io, socket, state) {

  function handleStartTyping({ room }) {
    const sender = socket.username;
    if (!sender || !room || typeof room !== 'string') return;

    // Rate limit: max 30 typing events per 60 seconds per socket
    const now = Date.now();
    let limit = typingRateLimits.get(socket.id);
    if (!limit || now >= limit.resetAt) {
      limit = { count: 0, resetAt: now + 60000 };
      typingRateLimits.set(socket.id, limit);
    }
    limit.count++;
    if (limit.count > 30) return;

    const key = `${sender}:${room}`;
    socket.to(room).emit('user_typing', { username: sender, room });

    clearTimeout(state.typingTimeouts.get(key));
    
    while (state.typingTimeouts.size >= state.MAX_TYPING_ENTRIES) {
      const oldestKey = state.typingTimeouts.keys().next().value;
      const oldestTimeout = state.typingTimeouts.get(oldestKey);
      clearTimeout(oldestTimeout);
      state.typingTimeouts.delete(oldestKey);
      // Clean up the by-user index for evicted entries
      for (const [user, keys] of state.typingTimeoutsByUser) {
        if (keys.delete(oldestKey) && keys.size === 0) {
          state.typingTimeoutsByUser.delete(user);
          break;
        }
      }
    }
    
    // Track in by-user index for fast disconnect cleanup
    if (!state.typingTimeoutsByUser.has(sender)) {
      state.typingTimeoutsByUser.set(sender, new Set());
    }
    state.typingTimeoutsByUser.get(sender).add(key);
    
    state.typingTimeouts.set(key, setTimeout(() => {
      socket.to(room).emit('user_stopped_typing', { username: sender, room });
      state.typingTimeouts.delete(key);
      const userKeys = state.typingTimeoutsByUser.get(sender);
      if (userKeys) {
        userKeys.delete(key);
        if (userKeys.size === 0) state.typingTimeoutsByUser.delete(sender);
      }
    }, state.TYPING_TIMEOUT));
  }

  function handleStopTyping({ room }) {
    const sender = socket.username;
    if (!sender || !room || typeof room !== 'string') return;

    const key = `${sender}:${room}`;
    clearTimeout(state.typingTimeouts.get(key));
    state.typingTimeouts.delete(key);
    const userKeys = state.typingTimeoutsByUser.get(sender);
    if (userKeys) {
      userKeys.delete(key);
      if (userKeys.size === 0) state.typingTimeoutsByUser.delete(sender);
    }

    socket.to(room).emit('user_stopped_typing', { username: sender, room });
  }

  return {
    handleStartTyping,
    handleStopTyping
  };
};