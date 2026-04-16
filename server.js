require('dotenv').config();

// ─────────────────────────────────────────
// ENV VALIDATION
// Fail fast at startup if required vars are missing
// rather than crashing mid-request with a cryptic error.
// ─────────────────────────────────────────
const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET'];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const Message = require('./models/Message');
const authRoutes = require('./routes/auth');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
// allowedOrigin is resolved in the MIDDLEWARE block below.
// It is hoisted here via let so both the Server constructor and
// the Express cors() call share the same origin value.
let allowedOrigin;

const io = new Server(server, {
  cors: {
    get origin() { return allowedOrigin; },
    methods: ['GET', 'POST']
  }
});

const MAX_MESSAGE_LENGTH = 1000;
const TYPING_TIMEOUT = 4000;
const MAX_HISTORY_GLOBAL = 100;
const MAX_HISTORY_PRIVATE = 50;

// ─────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────
// In production CLIENT_ORIGIN must be set explicitly — wildcard is not allowed.
// In development it falls back to '*' for convenience.
allowedOrigin = process.env.CLIENT_ORIGIN ||
  (process.env.NODE_ENV !== 'production' ? '*' : null);
if (!allowedOrigin) {
  console.error('❌ CLIENT_ORIGIN must be set in production');
  process.exit(1);
}
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static('public', { maxAge: '1d' }));

// Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.removeHeader('X-Powered-By');
  next();
});

// ─────────────────────────────────────────
// AUTH MIDDLEWARE
// Verifies the JWT from the Authorization header.
// Attach to any route that should require a logged-in user.
// ─────────────────────────────────────────
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// ─────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────
app.use('/auth', authRoutes);

app.get('/ping', (req, res) => {
  res.send('Server is running!');
});

app.get('/messages/global', verifyToken, async (req, res) => {
  try {
    const messages = await Message.find({ isGlobal: true })
      .sort({ createdAt: 1 })
      .limit(MAX_HISTORY_GLOBAL);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch global messages' });
  }
});

app.get('/messages/:user1/:user2', verifyToken, async (req, res) => {
  const { user1, user2 } = req.params;

  // Prevent users from reading other people's private conversations
  if (req.user.username !== user1 && req.user.username !== user2) {
    return res.status(403).json({ error: 'Forbidden' });
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
    .limit(MAX_HISTORY_PRIVATE);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch messages' });
  }
});

// ─────────────────────────────────────────
// SOCKET.IO
// ─────────────────────────────────────────
// Maps username -> number of active socket connections.
// Using a count instead of a Set means a user with multiple tabs open
// only disappears from the online list when ALL their tabs are closed.
const onlineUsers = new Map(); // username -> connection count

// Track typing timeouts so we can auto-clear if client disconnects
const typingTimeouts = new Map(); // key: `${username}:${room}` -> timeout
const MAX_TYPING_ENTRIES = 10000; // Prevent unlimited growth

// Helper: returns the list of currently online usernames for broadcasting
function getOnlineList() {
  return Array.from(onlineUsers.keys());
}

// ── SOCKET AUTH MIDDLEWARE ──
// Runs before every connection is accepted.
// The client passes its JWT in the handshake auth object:
//   io({ auth: { token: '<jwt>' } })
// Connections with a missing or invalid token are rejected here,
// so every socket that reaches io.on('connection') is already authenticated
// and socket.username is guaranteed to be set from the verified token.
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

// Per-socket message rate limiter: max 10 messages per 5 seconds.
// Counts reset on a rolling window. Sockets that exceed the limit
// are warned once and their message silently dropped until the window resets.
const RATE_LIMIT_MAX      = 10;  // messages
const RATE_LIMIT_WINDOW   = 5000; // ms

function makeRateLimiter() {
  let count = 0;
  let resetTimer = null;
  
  const isAllowed = function() {
    if (resetTimer === null) {
      resetTimer = setTimeout(() => {
        count = 0;
        resetTimer = null;
      }, RATE_LIMIT_WINDOW);
    }
    count++;
    return count <= RATE_LIMIT_MAX;
  };
  
  isAllowed.cleanup = function() {
    if (resetTimer !== null) {
      clearTimeout(resetTimer);
      resetTimer = null;
    }
  };
  
  return isAllowed;
}

io.on('connection', (socket) => {
  // username is guaranteed to be set by the auth middleware above —
  // no need for a separate user_online event.
  const username = socket.username;
  // Increment connection count — user may have multiple tabs open
  onlineUsers.set(username, (onlineUsers.get(username) || 0) + 1);
  socket.join('global');
  io.emit('online_users', getOnlineList());
  console.log(`${username} connected (${socket.id}). Connections: ${onlineUsers.get(username)}. Unique online: ${onlineUsers.size}`);

  // One rate limiter shared across all message events for this socket
  const messageAllowed = makeRateLimiter();

  socket.on('join_room', (roomId) => {
    if (!roomId || typeof roomId !== 'string' || roomId.length > 100) return;
    
    // Allow global room for everyone
    if (roomId === 'global') {
      socket.join(roomId);
      console.log(`${socket.id} joined room: ${roomId}`);
      return;
    }
    
    // Verify user is authorized for this private room
    // Private room id format is "user1_user2" sorted alphabetically
    const parts = roomId.split('_');
    if (parts.length === 2 && (parts[0] === socket.username || parts[1] === socket.username)) {
      socket.join(roomId);
      console.log(`${socket.id} joined room: ${roomId}`);
    }
  });

  // ── TYPING INDICATORS ──
  socket.on('start_typing', ({ room }) => {
    const sender = socket.username;
    if (!sender || !room || typeof room !== 'string') return;

    const key = `${sender}:${room}`;

    // Broadcast to the room (excluding sender)
    socket.to(room).emit('user_typing', { username: sender, room });

    // Auto-stop typing after 4 seconds in case client doesn't send stop_typing
    clearTimeout(typingTimeouts.get(key));
    
    // LRU cleanup: if we hit max size, remove oldest entry
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

  // ── GLOBAL MESSAGE ──
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

    // Strip HTML tags to prevent XSS
    const sanitizedMessage = message.replace(/<[^>]*>/g, '');

    // Stop typing indicator when message is sent
    const key = `${sender}:global`;
    clearTimeout(typingTimeouts.get(key));
    typingTimeouts.delete(key);
    socket.to('global').emit('user_stopped_typing', { username: sender, room: 'global' });

    try {
      const newMessage = new Message({
        sender,
        message: sanitizedMessage.trim(),
        isGlobal: true
      });
      await newMessage.save();

      io.to('global').emit('receive_global_message', {
        sender,
        message: sanitizedMessage.trim(),
        createdAt: newMessage.createdAt,
        clientId: data?.clientId || null
      });

    } catch (err) {
      console.error('Global message error:', err);
    }
  });

  // ── PRIVATE MESSAGE ──
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

    // Strip HTML tags to prevent XSS
    const sanitizedMessage = message.replace(/<[^>]*>/g, '');

    // Stop typing indicator when message is sent
    const key = `${sender}:${room}`;
    clearTimeout(typingTimeouts.get(key));
    typingTimeouts.delete(key);
    socket.to(room).emit('user_stopped_typing', { username: sender, room });

    try {
      const newMessage = new Message({
        sender,
        receiver,
        message: sanitizedMessage.trim(),
        isGlobal: false
      });
      await newMessage.save();

      io.to(room).emit('receive_message', {
        sender,
        message: sanitizedMessage.trim(),
        createdAt: newMessage.createdAt,
        room,
        clientId: data?.clientId || null
      });

    } catch (err) {
      console.error('Private message error:', err);
    }
  });

  socket.on('disconnect', () => {
    // Clean up rate limiter timer to prevent memory leak
    messageAllowed.cleanup();
    
    if (socket.username) {
      const remaining = (onlineUsers.get(socket.username) || 1) - 1;
      if (remaining <= 0) {
        // All tabs closed — user is truly offline
        onlineUsers.delete(socket.username);
        io.emit('online_users', getOnlineList());
        console.log(`${socket.username} fully offline`);

        // Clean up any lingering typing timeouts for this user
        for (const [key, timeout] of typingTimeouts.entries()) {
          if (key.startsWith(`${socket.username}:`)) {
            clearTimeout(timeout);
            typingTimeouts.delete(key);
          }
        }
      } else {
        // Still has other tabs open — stay in the online list
        onlineUsers.set(socket.username, remaining);
        console.log(`${socket.username} closed a tab (${remaining} connection(s) remaining)`);
      }
    }
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