require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const Message = require('./models/Message');
const authRoutes = require('./routes/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ─────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────

// Always declare charset=utf-8 on every JSON response so that
// Chinese characters (and all other Unicode) survive the round-trip
// from the DB → Express → browser without any garbling.
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

app.use(express.json({ limit: '16kb' }));
app.use(express.static('public'));

// ─────────────────────────────────────────
// RATE LIMITERS
// ─────────────────────────────────────────

// Strict limiter for login / register — 5 attempts per 15 minutes
// This was already in package.json but was never wired up.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,   // only counts failed/bad requests
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please wait 15 minutes and try again.' }
});

// Looser limiter for the read-only message history endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' }
});

// ─────────────────────────────────────────
// JWT AUTH MIDDLEWARE  (for REST routes)
// ─────────────────────────────────────────

// The original app issued tokens but never verified them on any
// subsequent request.  This fixes that.
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  // Expect:  Authorization: Bearer <token>
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;   // { id, username, iat, exp }
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
}

// ─────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────

app.use('/auth', authLimiter, authRoutes);

app.get('/ping', (req, res) => {
  res.json({ status: 'ok' });
});

// Fetch global chat history — protected + rate-limited
app.get('/messages/global', authenticateToken, apiLimiter, async (req, res) => {
  try {
    const messages = await Message.find({ isGlobal: true })
      .sort({ createdAt: 1 })
      .limit(100);
    res.json(messages);
  } catch {
    res.status(500).json({ error: 'Could not fetch global messages.' });
  }
});

// Fetch private message history — protected + rate-limited
app.get('/messages/:user1/:user2', authenticateToken, apiLimiter, async (req, res) => {
  const { user1, user2 } = req.params;

  // A user may only fetch threads they're part of
  if (req.user.username !== user1 && req.user.username !== user2) {
    return res.status(403).json({ error: 'You may only view your own messages.' });
  }

  try {
    const messages = await Message.find({
      isGlobal: false,
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 }
      ]
    })
      .sort({ createdAt: 1 })
      .limit(50);
    res.json(messages);
  } catch {
    res.status(500).json({ error: 'Could not fetch messages.' });
  }
});

// ─────────────────────────────────────────
// SOCKET.IO — JWT AUTH MIDDLEWARE
// ─────────────────────────────────────────

// Verify the token during the Socket.IO handshake.
// The client sends:  socket = io({ auth: { token } })
// If the token is missing or invalid the connection is refused before
// any event handler ever runs.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentication required.'));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.username = decoded.username;   // trusted source — not user-supplied
    next();
  } catch {
    return next(new Error('Invalid or expired token.'));
  }
});

// ─────────────────────────────────────────
// SOCKET.IO — EVENTS
// ─────────────────────────────────────────

// Helpers
const MAX_MSG_LENGTH = 2000;  // generous for Chinese (≈2000 chars, not bytes)

function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  // Strip HTML tags to prevent XSS in the chat bubbles.
  // Chinese text passes through untouched because it contains no < or >.
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
}

// Track online users — a Set automatically ignores duplicates
const onlineUsers = new Set();

io.on('connection', (socket) => {
  // socket.username is already set and verified by the JWT middleware above
  const username = socket.username;
  console.log(`${username} connected (${socket.id})`);

  // ── USER COMES ONLINE ──
  // We join them to the global room immediately on connection because
  // we already know who they are from the JWT — no need for a separate
  // 'user_online' event carrying an untrusted username string.
  onlineUsers.add(username);
  socket.join('global');
  io.emit('online_users', Array.from(onlineUsers));
  console.log(`${username} is online. Total: ${onlineUsers.size}`);

  // Keep the event for backwards-compatibility with the frontend,
  // but ignore the payload — we use the verified JWT username instead.
  socket.on('user_online', () => {
    // No-op: user is already online via the JWT handshake above.
  });

  // ── JOIN PRIVATE ROOM ──
  socket.on('join_room', (roomId) => {
    // Validate that the room ID actually contains the authenticated user
    // so someone cannot eavesdrop on another pair's private room.
    if (typeof roomId !== 'string') return;
    const parts = roomId.split('_');
    if (!parts.includes(username)) return;   // not your room
    socket.join(roomId);
  });

  // ── SEND GLOBAL MESSAGE ──
  socket.on('send_global_message', async (data) => {
    if (!data || typeof data.message !== 'string') return;
    const text = sanitizeText(data.message);
    if (!text || text.length > MAX_MSG_LENGTH) return;

    try {
      const newMessage = new Message({
        sender: username,          // verified — ignore data.sender from client
        message: text,
        isGlobal: true
      });
      await newMessage.save();

      io.to('global').emit('receive_global_message', {
        sender: username,
        message: text,
        createdAt: newMessage.createdAt
      });
    } catch (err) {
      console.error('Global message error:', err);
    }
  });

  // ── SEND PRIVATE MESSAGE ──
  socket.on('send_message', async (data) => {
    if (!data || typeof data.message !== 'string' || typeof data.receiver !== 'string') return;

    const text = sanitizeText(data.message);
    if (!text || text.length > MAX_MSG_LENGTH) return;

    const receiver = data.receiver.trim();
    const room = [username, receiver].sort().join('_');   // recompute — never trust client

    try {
      const newMessage = new Message({
        sender: username,
        receiver,
        message: text,
        isGlobal: false
      });
      await newMessage.save();

      io.to(room).emit('receive_message', {
        sender: username,
        message: text,
        createdAt: newMessage.createdAt
      });
    } catch (err) {
      console.error('Private message error:', err);
    }
  });

  // ── DISCONNECT ──
  socket.on('disconnect', () => {
    onlineUsers.delete(username);
    io.emit('online_users', Array.from(onlineUsers));
    console.log(`${username} went offline`);
  });
});

// ─────────────────────────────────────────
// START
// ─────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`✅ Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
  });