require('dotenv').config();

// ─────────────────────────────────────────
// ENV VALIDATION
// Fail fast at startup if required vars are missing
// rather than crashing mid-request with a cryptic error.
// ─────────────────────────────────────────
const REQUIRED_ENV = ['JWT_SECRET'];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
// Validate numeric env vars
const NUMERIC_ENV = ['BCRYPT_ROUNDS'];
NUMERIC_ENV.forEach((key) => {
  if (process.env[key] && isNaN(parseInt(process.env[key], 10))) {
    missingEnv.push(key);
  }
});

if (process.env.NODE_ENV !== 'test') {
  if (!process.env.MONGO_URI) {
    missingEnv.push('MONGO_URI');
  }
} else if (!process.env.MONGO_URI && !process.env.TEST_MONGO_URI) {
  missingEnv.push('TEST_MONGO_URI');
}

if (missingEnv.length > 0) {
  const logger = require('../utils/logger');
  logger.error({ event: 'env_missing', missing: missingEnv });
  process.exit(1);
}

// Validate production origin requirement
if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_ORIGIN) {
  const logger = require('../utils/logger');
  logger.error({ event: 'env_client_origin_missing' });
  process.exit(1);
}

module.exports = {
  allowedOrigin: process.env.CLIENT_ORIGIN ||
    (process.env.NODE_ENV !== 'production' ? '*' : null)
};
