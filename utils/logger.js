const { createLogger, format, transports } = require('winston');

// Test env should remain friendly to existing tests — delegate to console
if (process.env.NODE_ENV === 'test') {
  module.exports = {
    info: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
    debug: (...args) => console.debug ? console.debug(...args) : console.log(...args),
    child: () => module.exports
  };
  return;
}

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  transports: [new transports.Console()]
});

module.exports = logger;
