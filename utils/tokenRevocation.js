/**
 * Returns token issue time in milliseconds, or null if unavailable.
 * Prefers explicit loginAt (ms) over JWT iat (second precision).
 */
function getTokenIssuedAt(payload) {
  if (typeof payload.loginAt === 'number') {
    return payload.loginAt;
  }
  if (payload.iat) {
    return payload.iat * 1000;
  }
  return null;
}

/**
 * True when lastLogout invalidates the token (issued at or before logout).
 */
function isTokenRevoked(payload, lastLogout) {
  if (!lastLogout) {
    return false;
  }
  const issuedAt = getTokenIssuedAt(payload);
  if (issuedAt == null) {
    return false;
  }
  return issuedAt <= lastLogout.getTime();
}

module.exports = { getTokenIssuedAt, isTokenRevoked };
