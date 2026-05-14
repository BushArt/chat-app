// Load and validate environment FIRST - fail fast before anything else
require('./config/env');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Import config
const connectDatabase = require('./config/db');
const { allowedOrigin } = require('./config/env');

// Import middleware
const verifyToken = require('./middleware/auth');
const securityHeaders = require('./middleware/security');

// Import routes
const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');

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

// Initialize socket system
require('./sockets')(io);

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