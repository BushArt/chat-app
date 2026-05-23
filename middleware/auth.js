const jwt = require('jsonwebtoken');
const HttpError = require('../utils/HttpError');

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return next(new HttpError('Authentication required', 401, 'authentication_required'));
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return next(new HttpError('Invalid or expired token', 403, 'invalid_token'));
  }
}

module.exports = verifyToken;