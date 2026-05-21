const RATE_LIMIT_MAX      = 10;  // messages
const RATE_LIMIT_WINDOW   = 5000; // ms

function makeRateLimiter() {
  let count = 0;
  let resetTimer = null;
  
  const isAllowed = function() {
    if (resetTimer === null) {
      resetTimer = setTimeout(() => {
        count = 0;
        resetTimer = null;
      }, RATE_LIMIT_WINDOW);
    }
    // Increment then compare (atomic-style within this event loop)
    count++;
    return count <= RATE_LIMIT_MAX;
  };
  
  isAllowed.cleanup = function() {
    if (resetTimer !== null) {
      clearTimeout(resetTimer);
      resetTimer = null;
    }
  };
  
  return isAllowed;
}

module.exports = makeRateLimiter;