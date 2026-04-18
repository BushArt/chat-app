/**
 * Global chat message handler
 */

const Message = require('../../models/Message');

module.exports = function createGlobalMessageHandler(io, socket, state, messageAllowed) {

  return async function handleSendGlobalMessage(data) {
    const sender = socket.username;
    if (!sender) return;
    if (!messageAllowed()) {
      socket.emit('error_message', { error: 'You are sending messages too fast.' });
      return;
    }

    const message = data?.message;
    if (!message || typeof message !== 'string') return;
    if ([...message.trim()].length === 0) return;
    if ([...message].length > state.MAX_MESSAGE_LENGTH) return;

    const sanitizedMessage = message.replace(/<[^>]*>/g, '');

    const key = `${sender}:global`;
    clearTimeout(state.typingTimeouts.get(key));
    state.typingTimeouts.delete(key);
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
  };
};