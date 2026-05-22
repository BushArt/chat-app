/**
 * Private message handler
 */

const Message = require('../../models/Message');
const logger = require('../../utils/logger');

module.exports = function createPrivateMessageHandler(io, socket, state, messageAllowed) {

  return async function handleSendPrivateMessage(data, ack) {
    const sender = socket.username;
    if (!sender) return;
    if (!messageAllowed()) {
      socket.emit('error_message', { error: 'You are sending messages too fast.' });
      return;
    }

    const message = data?.message;
    const receiver = typeof data?.receiver === 'string' ? data.receiver.trim() : null;
    const room = typeof data?.room === 'string' ? data.room : null;

    if (!message || typeof message !== 'string') return;
    if ([...message.trim()].length === 0) return;
    if ([...message].length > state.MAX_MESSAGE_LENGTH) return;
    if (!receiver) return;
    if (!room) return;

    const expectedRoom = [sender, receiver].sort().join('_');
    if (room !== expectedRoom) return;

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

      const payload = {
        sender,
        message: sanitizedMessage.trim(),
        createdAt: newMessage.createdAt,
        room,
        clientId: newMessage.clientId
      };

      if (socket && socket.connected && typeof ack === 'function') {
        try { ack({ status: 'saved', id: newMessage._id }); } catch (e) {
          logger.error({ event: 'ack_error', context: 'private_message', err: String(e), username: sender, room });
        }
      }

      io.to(room).emit('receive_message', payload);

    } catch (err) {
      logger.error({ event: 'private_message_error', err: String(err) });
      if (typeof ack === 'function') {
        try { ack({ status: 'error', message: String(err) }); } catch (e) {
          logger.error({ event: 'ack_error', context: 'private_message_error_ack', err: String(e), username: sender, room });
        }
      }
    }
  };
};