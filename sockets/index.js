/**
 * Socket.IO main entry point
 * Receives io instance from server.js and wires up everything
 */

const jwt = require('jsonwebtoken');
const makeRateLimiter = require('../middleware/rateLimiter');

const state = require('./state');
const createPresenceHandlers = require('./handlers/presence');
const createTypingHandlers = require('./handlers/typing');
const createGlobalMessageHandler = require('./handlers/globalMessage');
const createPrivateMessageHandler = require('./handlers/privateMessage');

module.exports = function setupSockets(io) {

  // ── SOCKET AUTH MIDDLEWARE ──
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.username = payload.username;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  // ── CONNECTION HANDLER ──
  io.on('connection', (socket) => {
    const username = socket.username;
    state.onlineUsers.set(username, (state.onlineUsers.get(username) || 0) + 1);
    socket.join('global');
    setTimeout(() => {
      io.emit('online_users', state.getOnlineList());
    }, 20);
    console.log(`${username} connected (${socket.id}). Connections: ${state.onlineUsers.get(username)}. Unique online: ${state.onlineUsers.size}`);

    // Per-connection rate limiter
    const messageAllowed = makeRateLimiter();

    // Initialize handlers for this socket
    const { handleJoinRoom, handleDisconnect } = createPresenceHandlers(io, socket, state, messageAllowed);
    const { handleStartTyping, handleStopTyping } = createTypingHandlers(io, socket, state);
    const handleSendGlobalMessage = createGlobalMessageHandler(io, socket, state, messageAllowed);
    const handleSendPrivateMessage = createPrivateMessageHandler(io, socket, state, messageAllowed);

    // Register event listeners
    socket.on('join_room', handleJoinRoom);
    socket.on('start_typing', handleStartTyping);
    socket.on('stop_typing', handleStopTyping);
    socket.on('send_global_message', handleSendGlobalMessage);
    socket.on('send_message', handleSendPrivateMessage);
    socket.on('disconnect', handleDisconnect);
  });
};