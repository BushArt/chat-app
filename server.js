require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const Message = require('./models/Message');
const authRoutes = require('./routes/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ─────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────
app.use(express.json());
app.use(express.static('public'));

// ─────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────
app.use('/auth', authRoutes);

app.get('/ping', (req, res) => {
  res.send('Server is running!');
});

// Fetch global chat history
app.get('/messages/global', async (req, res) => {
  try {
    const messages = await Message.find({ isGlobal: true })
      .sort({ createdAt: 1 })
      .limit(100);  // last 100 global messages
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch global messages' });
  }
});

// Fetch private message history between two users
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

// Track online users — a Set automatically ignores duplicates
const onlineUsers = new Set();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // ── USER COMES ONLINE ──
  // Frontend sends this immediately after login
  // We add them to the global room and broadcast the updated online list
  socket.on('user_online', (username) => {
    socket.username = username;       // store username on the socket for later
    onlineUsers.add(username);
    socket.join('global');            // auto-join the global room

    // Tell everyone the online list updated
    io.emit('online_users', Array.from(onlineUsers));
    console.log(`${username} is online. Total: ${onlineUsers.size}`);
  });

  // ── JOIN PRIVATE ROOM ──
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`${socket.id} joined room: ${roomId}`);
  });

  // ── SEND GLOBAL MESSAGE ──
  socket.on('send_global_message', async (data) => {
    // data = { sender, message }
    try {
      const newMessage = new Message({
        sender: data.sender,
        message: data.message,
        isGlobal: true
      });
      await newMessage.save();

      // Emit to everyone in the global room
      io.to('global').emit('receive_global_message', {
        sender: data.sender,
        message: data.message,
        createdAt: newMessage.createdAt
      });

    } catch (err) {
      console.error('Global message error:', err);
    }
  });

  // ── SEND PRIVATE MESSAGE ──
  socket.on('send_message', async (data) => {
    // data = { sender, receiver, message, room }
    try {
      const newMessage = new Message({
        sender: data.sender,
        receiver: data.receiver,
        message: data.message,
        isGlobal: false
      });
      await newMessage.save();

      io.to(data.room).emit('receive_message', {
        sender: data.sender,
        message: data.message,
        createdAt: newMessage.createdAt
      });

    } catch (err) {
      console.error('Private message error:', err);
    }
  });

  // ── DISCONNECT ──
  socket.on('disconnect', () => {
    if (socket.username) {
      onlineUsers.delete(socket.username);
      // Tell everyone this user went offline
      io.emit('online_users', Array.from(onlineUsers));
      console.log(`${socket.username} went offline`);
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