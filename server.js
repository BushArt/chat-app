require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const Message = require('./models/Message');
const authRoutes = require('./routes/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || '*',
    methods: ['GET', 'POST']
  }
});

const MAX_MESSAGE_LENGTH = 1000;

// ─────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || '*'
}));
app.use(express.json());
app.use(express.static('public'));

// ─────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────
app.use('/auth', authRoutes);

app.get('/ping', (req, res) => {
  res.send('Server is running!');
});

app.get('/messages/global', async (req, res) => {
  try {
    const messages = await Message.find({ isGlobal: true })
      .sort({ createdAt: 1 })
      .limit(100);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch global messages' });
  }
});

app.get('/messages/:user1/:user2', async (req, res) => {
  const { user1, user2 } = req.params;
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
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch messages' });
  }
});

// ─────────────────────────────────────────
// SOCKET.IO
// ─────────────────────────────────────────
const onlineUsers = new Set();

// Track typing timeouts so we can auto-clear if client disconnects
const typingTimeouts = new Map(); // key: `${username}:${room}` -> timeout

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('user_online', (username) => {
    if (!username || typeof username !== 'string' || username.length > 30) return;

    socket.username = username;
    onlineUsers.add(username);
    socket.join('global');

    io.emit('online_users', Array.from(onlineUsers));
    console.log(`${username} is online. Total: ${onlineUsers.size}`);
  });

  socket.on('join_room', (roomId) => {
    if (!roomId || typeof roomId !== 'string' || roomId.length > 100) return;
    socket.join(roomId);
    console.log(`${socket.id} joined room: ${roomId}`);
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
    typingTimeouts.set(key, setTimeout(() => {
      socket.to(room).emit('user_stopped_typing', { username: sender, room });
      typingTimeouts.delete(key);
    }, 4000));
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

    const message = data?.message;
    if (!message || typeof message !== 'string') return;
    if (message.trim().length === 0) return;
    if (message.length > MAX_MESSAGE_LENGTH) return;

    // Stop typing indicator when message is sent
    const key = `${sender}:global`;
    clearTimeout(typingTimeouts.get(key));
    typingTimeouts.delete(key);
    socket.to('global').emit('user_stopped_typing', { username: sender, room: 'global' });

    try {
      const newMessage = new Message({
        sender,
        message: message.trim(),
        isGlobal: true
      });
      await newMessage.save();

      io.to('global').emit('receive_global_message', {
        sender,
        message: message.trim(),
        createdAt: newMessage.createdAt
      });

    } catch (err) {
      console.error('Global message error:', err);
    }
  });

  // ── PRIVATE MESSAGE ──
  socket.on('send_message', async (data) => {
    const sender = socket.username;
    if (!sender) return;

    const message = data?.message;
    const receiver = data?.receiver;
    const room = data?.room;

    if (!message || typeof message !== 'string') return;
    if (message.trim().length === 0) return;
    if (message.length > MAX_MESSAGE_LENGTH) return;
    if (!receiver || typeof receiver !== 'string') return;
    if (!room || typeof room !== 'string') return;

    // Stop typing indicator when message is sent
    const key = `${sender}:${room}`;
    clearTimeout(typingTimeouts.get(key));
    typingTimeouts.delete(key);
    socket.to(room).emit('user_stopped_typing', { username: sender, room });

    try {
      const newMessage = new Message({
        sender,
        receiver,
        message: message.trim(),
        isGlobal: false
      });
      await newMessage.save();

      io.to(room).emit('receive_message', {
        sender,
        message: message.trim(),
        createdAt: newMessage.createdAt
      });

    } catch (err) {
      console.error('Private message error:', err);
    }
  });

  socket.on('disconnect', () => {
    if (socket.username) {
      onlineUsers.delete(socket.username);
      io.emit('online_users', Array.from(onlineUsers));
      console.log(`${socket.username} went offline`);

      // Clean up any lingering typing timeouts for this user
      for (const [key, timeout] of typingTimeouts.entries()) {
        if (key.startsWith(`${socket.username}:`)) {
          clearTimeout(timeout);
          typingTimeouts.delete(key);
        }
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