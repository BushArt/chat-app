/**
 * Socket.IO main entry point
 * Receives io instance from server.js and wires up everything
 */

const jwt = require('jsonwebtoken');
const makeRateLimiter = require('../middleware/rateLimiter');

const state = require('./state');
const logger = require('../utils/logger');
const createPresenceHandlers = require('./handlers/presence');
const createTypingHandlers = require('./handlers/typing');
const createGlobalMessageHandler = require('./handlers/globalMessage');
const createPrivateMessageHandler = require('./handlers/privateMessage');
const createSyncHandler = require('./handlers/sync');

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
    if (!state.onlineUsers.has(username)) state.onlineUsers.set(username, new Set());
    state.onlineUsers.get(username).add(socket.id);
    socket.join('global');
    // Emit online user list after a short delay so clients have time to
    // register their `online_users` listener and avoid a race in tests
    // and real clients attaching handlers during connect.
    const timer = setTimeout(() => {
      io.emit('online_users', state.getOnlineList());
    }, 100);
    timer.unref();
    logger.info({ event: 'socket_connect', username, socketId: socket.id, connections: state.onlineUsers.get(username).size, uniqueOnline: state.onlineUsers.size });

    // Per-connection rate limiters
    const messageAllowed = makeRateLimiter();
    const syncAllowed = makeRateLimiter();

    // Initialize handlers for this socket
    const joinLimiter = makeRateLimiter();
    const { handleJoinRoom, handleDisconnect } = createPresenceHandlers(io, socket, state, messageAllowed, joinLimiter);
    const { handleStartTyping, handleStopTyping } = createTypingHandlers(io, socket, state);
    const handleSendGlobalMessage = createGlobalMessageHandler(io, socket, state, messageAllowed);
    const handleSendPrivateMessage = createPrivateMessageHandler(io, socket, state, messageAllowed);
    const handleSync = createSyncHandler(io, socket, state, syncAllowed);

    // Register event listeners
    socket.on('join_room', handleJoinRoom);
    socket.on('start_typing', handleStartTyping);
    socket.on('stop_typing', handleStopTyping);
    socket.on('send_global_message', handleSendGlobalMessage);
    socket.on('send_message', handleSendPrivateMessage);
    socket.on('sync', handleSync);
    socket.on('disconnect', handleDisconnect);
  });
};