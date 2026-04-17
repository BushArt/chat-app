// Load and validate environment FIRST - fail fast before anything else
require('./config/env');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');

// Import config
const connectDatabase = require('./config/db');
const { allowedOrigin } = require('./config/env');

// Import middleware
const verifyToken = require('./middleware/auth');
const securityHeaders = require('./middleware/security');
const makeRateLimiter = require('./middleware/rateLimiter');

// Import routes
const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const Message = require('./models/Message');

// Constants
const MAX_MESSAGE_LENGTH = 1000;
const TYPING_TIMEOUT = 4000;

// Initialize app
const app = express();
const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    get origin() { return allowedOrigin; },
    methods: ['GET', 'POST']
  }
});

// ─────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static('public', { maxAge: '1d' }));
app.use(securityHeaders);

// ─────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/messages', messageRoutes);

app.get('/ping', (req, res) => {
  res.send('Server is running!');
});

// ─────────────────────────────────────────
// SOCKET.IO STATE
// ─────────────────────────────────────────
const onlineUsers = new Map(); // username -> connection count
const typingTimeouts = new Map(); // key: `${username}:${room}` -> timeout
const MAX_TYPING_ENTRIES = 10000;

function getOnlineList() {
  return Array.from(onlineUsers.keys());
}

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

// ─────────────────────────────────────────
// SOCKET HANDLERS
// ─────────────────────────────────────────
io.on('connection', (socket) => {
  const username = socket.username;
  onlineUsers.set(username, (onlineUsers.get(username) || 0) + 1);
  socket.join('global');
  io.emit('online_users', getOnlineList());
  console.log(`${username} connected (${socket.id}). Connections: ${onlineUsers.get(username)}. Unique online: ${onlineUsers.size}`);

  const messageAllowed = makeRateLimiter();

  socket.on('join_room', (roomId) => {
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
  });

  socket.on('start_typing', ({ room }) => {
    const sender = socket.username;
    if (!sender || !room || typeof room !== 'string') return;

    const key = `${sender}:${room}`;
    socket.to(room).emit('user_typing', { username: sender, room });

    clearTimeout(typingTimeouts.get(key));
    
    if (typingTimeouts.size >= MAX_TYPING_ENTRIES) {
      const oldestKey = typingTimeouts.keys().next().value;
      const oldestTimeout = typingTimeouts.get(oldestKey);
      clearTimeout(oldestTimeout);
      typingTimeouts.delete(oldestKey);
    }
    
    typingTimeouts.set(key, setTimeout(() => {
      socket.to(room).emit('user_stopped_typing', { username: sender, room });
      typingTimeouts.delete(key);
    }, TYPING_TIMEOUT));
  });

  socket.on('stop_typing', ({ room }) => {
    const sender = socket.username;
    if (!sender || !room || typeof room !== 'string') return;

    const key = `${sender}:${room}`;
    clearTimeout(typingTimeouts.get(key));
    typingTimeouts.delete(key);

    socket.to(room).emit('user_stopped_typing', { username: sender, room });
  });

  socket.on('send_global_message', async (data) => {
    const sender = socket.username;
    if (!sender) return;
    if (!messageAllowed()) {
      socket.emit('error_message', { error: 'You are sending messages too fast.' });
      return;
    }

    const message = data?.message;
    if (!message || typeof message !== 'string') return;
    if ([...message.trim()].length === 0) return;
    if ([...message].length > MAX_MESSAGE_LENGTH) return;

    const sanitizedMessage = message.replace(/<[^>]*>/g, '');

    const key = `${sender}:global`;
    clearTimeout(typingTimeouts.get(key));
    typingTimeouts.delete(key);
    socket.to('global').emit('user_stopped_typing', { username: sender, room: 'global' });

    try {
      const newMessage = new Message({
        sender,
        message: sanitizedMessage.trim(),
        isGlobal: true,
        clientId: data.clientId
      });
      await newMessage.save();

      io.to('global').emit('receive_global_message', {
        sender,
        message: sanitizedMessage.trim(),
        createdAt: newMessage.createdAt,
        clientId: newMessage.clientId
      });

    } catch (err) {
      console.error('Global message error:', err);
    }
  });

  socket.on('send_message', async (data) => {
    const sender = socket.username;
    if (!sender) return;
    if (!messageAllowed()) {
      socket.emit('error_message', { error: 'You are sending messages too fast.' });
      return;
    }

    const message = data?.message;
    const receiver = data?.receiver;
    const room = data?.room;

    if (!message || typeof message !== 'string') return;
    if ([...message.trim()].length === 0) return;
    if ([...message].length > MAX_MESSAGE_LENGTH) return;
    if (!receiver || typeof receiver !== 'string') return;
    if (!room || typeof room !== 'string') return;

    const sanitizedMessage = message.replace(/<[^>]*>/g, '');

    const key = `${sender}:${room}`;
    clearTimeout(typingTimeouts.get(key));
    typingTimeouts.delete(key);
    socket.to(room).emit('user_stopped_typing', { username: sender, room });

    try {
      const newMessage = new Message({
        sender,
        receiver,
        message: sanitizedMessage.trim(),
        isGlobal: false,
        clientId: data.clientId
      });
      await newMessage.save();

      io.to(room).emit('receive_message', {
        sender,
        message: sanitizedMessage.trim(),
        createdAt: newMessage.createdAt,
        room,
        clientId: newMessage.clientId
      });

    } catch (err) {
      console.error('Private message error:', err);
    }
  });

  socket.on('disconnect', () => {
    messageAllowed.cleanup();
    
    if (socket.username) {
      const remaining = (onlineUsers.get(socket.username) || 1) - 1;
      if (remaining <= 0) {
        onlineUsers.delete(socket.username);
        io.emit('online_users', getOnlineList());
        console.log(`${socket.username} fully offline`);

        for (const [key, timeout] of typingTimeouts.entries()) {
          if (key.startsWith(`${socket.username}:`)) {
            clearTimeout(timeout);
            typingTimeouts.delete(key);
          }
        }
      } else {
        onlineUsers.set(socket.username, remaining);
        console.log(`${socket.username} closed a tab (${remaining} connection(s) remaining)`);
      }
    }
  });
});

// ─────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────
connectDatabase()
  .then(() => {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`✅ Server running at http://localhost:${PORT}`);
    });
  })
  .catch(() => {
    process.exit(1);
  });