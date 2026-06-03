const fs = require('fs');
const io = require('socket.io-client');
const path = require('path');

(async () => {
  try {
    const token = process.env.CLI_TOKEN || '';
    if (!token) {
      console.error('Provide token via CLI_TOKEN env var');
      process.exit(2);
    }
    const attachPath = '/tmp/upload_result.json';
    if (!fs.existsSync(attachPath)) {
      console.error('Attachment metadata not found at', attachPath);
      process.exit(3);
    }
    const attachment = JSON.parse(fs.readFileSync(attachPath, 'utf8'));
    const socket = io('http://localhost:3000', { auth: { token } });
    socket.on('connect', () => {
      console.log('connected');
      const payload = { sender: 'cli_repro', message: '', clientId: 'cli_send_' + Date.now(), attachment };
      socket.emit('send_global_message', payload, (ack) => {
        console.log('ack', ack);
        setTimeout(() => socket.close(), 500);
      });
    });
    socket.on('connect_error', (err) => { console.error('connect_error', err.message); process.exit(4); });
  } catch (e) {
    console.error('error', e);
    process.exit(1);
  }
})();