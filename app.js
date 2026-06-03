require('./config/env');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const connectDatabase = require('./config/db');
const securityHeaders = require('./middleware/security');
const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const debugRoutes = require('./routes/debug');
const { allowedOrigin } = require('./config/env');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    get origin() {
      return allowedOrigin;
    },
    methods: ['GET', 'POST']
  }
});

require('./sockets')(io);
// Expose io for route-level socket broadcasts (e.g., profile_updated)
app.set('io', io);

app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static('public', { maxAge: '1d' }));
app.use(securityHeaders);

app.use('/auth', authRoutes);
app.use('/messages', messageRoutes);
app.use('/debug', debugRoutes);

app.get('/ping', (req, res) => {
  res.send('Server is running!');
});

// ── Error Handling ──
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

module.exports = {
  app,
  server,
  io,
  connectDatabase
};
