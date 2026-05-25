const jwt = require('jsonwebtoken');
const User = require('../models/User');
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
  } catch {
    return next(new HttpError('Invalid or expired token', 403, 'invalid_token'));
  }

  // JWT revocation check: reject tokens issued before the user's last logout
  if (req.user.iat) {
    User.findById(req.user.id).select('lastLogout').lean()
      .then(user => {
        if (user && user.lastLogout && req.user.iat * 1000 < user.lastLogout.getTime()) {
          return next(new HttpError('Token revoked, please log in again', 403, 'token_revoked'));
        }
        next();
      })
      .catch(() => next(new HttpError('Authentication error', 500, 'auth_error')));
  } else {
    next();
  }
}

module.exports = verifyToken;