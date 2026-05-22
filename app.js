require('./config/env');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const connectDatabase = require('./config/db');
const securityHeaders = require('./middleware/security');
const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
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

app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static('public', { maxAge: '1d' }));
app.use(securityHeaders);

app.use('/auth', authRoutes);
app.use('/messages', messageRoutes);

app.get('/ping', (req, res) => {
  res.send('Server is running!');
});

module.exports = {
  app,
  server,
  io,
  connectDatabase
};
