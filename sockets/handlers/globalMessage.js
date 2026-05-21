/**
 * Global chat message handler
 */

const Message = require('../../models/Message');

module.exports = function createGlobalMessageHandler(io, socket, state, messageAllowed) {

  return async function handleSendGlobalMessage(data, ack) {
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

      const payload = {
        sender,
        message: sanitizedMessage.trim(),
        createdAt: newMessage.createdAt,
        clientId: newMessage.clientId
      };

      // Ack the sender if still connected
      if (socket && socket.connected && typeof ack === 'function') {
        try { ack({ status: 'saved', id: newMessage._id }); } catch (e) { /* swallow ack errors */ }
      }

      io.to('global').emit('receive_global_message', payload);

    } catch (err) {
      logger.error({ event: 'global_message_error', err: String(err) });
      if (typeof ack === 'function') {
        try { ack({ status: 'error', message: String(err) }); } catch (e) {}
      }
    }
  };
};