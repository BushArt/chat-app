require('dotenv').config(); // must be first — loads your .env file

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const Message = require('./models/Message');
const authRoutes = require('./routes/auth');

// ─────────────────────────────────────────
// APP SETUP
// ─────────────────────────────────────────
const app = express();

// Socket.IO needs to attach to a raw http server, not just Express
const server = http.createServer(app);
const io = new Server(server);

// ─────────────────────────────────────────
// MIDDLEWARE
// Code that runs on every request before hitting a route
// ─────────────────────────────────────────
app.use(express.json());        // lets us read JSON from request bodies
app.use(express.static('public')); // serves public/index.html automatically

// ─────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────
app.use('/auth', authRoutes);   // register and login routes

// Health check — visit localhost:3000/ping to confirm server is running
app.get('/ping', (req, res) => {
  res.send('Server is running!');
});

// Fetch message history between two users
// Example: GET /messages/alice/bob
app.get('/messages/:user1/:user2', async (req, res) => {
  const { user1, user2 } = req.params;
  try {
    const messages = await Message.find({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 }
      ]
    })
    .sort({ createdAt: 1 }) // oldest first
    .limit(50);

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch messages' });
  }
});

// ─────────────────────────────────────────
// SOCKET.IO — REAL-TIME EVENTS
// ─────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // When a user opens a chat, they join a room
  // A room is a private channel — only people in it receive its messages
  // Room name is built from both usernames sorted alphabetically
  // e.g. alice + bob = "alice_bob" regardless of who initiates
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`${socket.id} joined room: ${roomId}`);
  });

  // When a message is sent:
  // 1. Save it to the database
  // 2. Broadcast it to everyone in the room
  socket.on('send_message', async (data) => {
    // data = { sender, receiver, message, room }
    try {
      const newMessage = new Message({
        sender: data.sender,
        receiver: data.receiver,
        message: data.message
      });
      await newMessage.save();

      // Emit to all sockets in the room (both users see it instantly)
      io.to(data.room).emit('receive_message', {
        sender: data.sender,
        message: data.message,
        createdAt: newMessage.createdAt
      });

    } catch (err) {
      console.error('Message error:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// ─────────────────────────────────────────
// START SERVER
// Connect to database first, then start listening
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