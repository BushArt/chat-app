/**
 * Global chat message handler
 */

const Message = require('../../models/Message');
const logger = require('../../utils/logger');
const emitError = require('../../utils/socketError');
const HttpError = require('../../utils/HttpError');

module.exports = function createGlobalMessageHandler(io, socket, state, messageAllowed) {

  return async function handleSendGlobalMessage(data, ack) {
    const sender = socket.username;
    if (!sender) return;
    if (!messageAllowed()) {
      emitError(socket, 'error_message', new HttpError('You are sending messages too fast.', 429, 'rate_limited'));
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
        try { ack({ status: 'saved', id: newMessage._id }); } catch (e) {
          logger.error({ event: 'ack_error', context: 'global_message', err: String(e), username: sender });
        }
      }

      io.to('global').emit('receive_global_message', payload);

    } catch (err) {
      logger.error({ event: 'global_message_error', err: String(err) });
      const errorResponse = new HttpError('Server error during global message sending', 500, 'global_message_failed');
      emitError(socket, 'error_message', errorResponse);
      if (typeof ack === 'function') {
        try { ack({ status: 'error', message: errorResponse.message, code: errorResponse.code }); } catch (e) {
          logger.error({ event: 'ack_error', context: 'global_message_error_ack', err: String(e), username: sender });
        }
      }
    }
  };
};