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
    count++;
    const allowed = count <= RATE_LIMIT_MAX;
    
    // Race condition protection: if timer fired after we incremented but before return
    if (resetTimer === null && count > 1) {
      count = 1;
    }
    
    return allowed;
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