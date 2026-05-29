const logger = require('../utils/logger');

const multerCodeMap = {
  LIMIT_FILE_SIZE: ['File too large', 400, 'file_too_large'],
  LIMIT_UNEXPECTED_FILE: ['Unexpected file field', 400, 'unexpected_file']
};

module.exports = (err, req, res, next) => {
  // Handle multer errors (LIMIT_FILE_SIZE, etc.) as 4xx client errors
  if (err.code && multerCodeMap[err.code]) {
    const [message, status, code] = multerCodeMap[err.code];
    logger.warn({ event: 'multer_error', status, code, message: err.message, path: req.path });
    return res.status(status).json({ error: message, code });
  }

  const status = err.status || 500;
  const code = err.code || 'internal_error';
  logger.error({ event: 'http_error', status, code, message: err.message, path: req.path });
  res.status(status).json({ error: err.message, code });
};
