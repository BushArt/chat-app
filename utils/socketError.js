const logger = require('../utils/logger');
function emitError(socket, event, err) {
  const payload = { error: err.message, code: err.code || 'internal_error' };
  logger.error({ event: 'socket_error', socketId: socket.id, err: err.message, code: payload.code });
  socket.emit(event, payload);
}
module.exports = emitError;