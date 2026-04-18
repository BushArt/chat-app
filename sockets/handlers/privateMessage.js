/**
 * Private message handler
 */

const Message = require('../../models/Message');

module.exports = function createPrivateMessageHandler(io, socket, state, messageAllowed) {

  return async function handleSendPrivateMessage(data) {
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
    if ([...message].length > state.MAX_MESSAGE_LENGTH) return;
    if (!receiver || typeof receiver !== 'string') return;
    if (!room || typeof room !== 'string') return;

    const sanitizedMessage = message.replace(/<[^>]*>/g, '');

    const key = `${sender}:${room}`;
    clearTimeout(state.typingTimeouts.get(key));
    state.typingTimeouts.delete(key);
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
  };
};