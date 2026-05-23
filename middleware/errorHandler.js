const logger = require('../utils/logger');
module.exports = (err, req, res, next) => {
  const status = err.status || 500;
  const code = err.code || 'internal_error';
  logger.error({ event: 'http_error', status, code, message: err.message, path: req.path });
  res.status(status).json({ error: err.message, code });
};