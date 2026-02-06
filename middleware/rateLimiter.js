/**
 * Rate limiting middleware for PocketCloud
 * Protects against resource exhaustion from concurrent operations
 * 
 * Simple in-memory implementation (no external dependencies)
 */

// Store request counts: { key: { count, resetTime } }
const requestCounts = new Map();

/**
 * Create a rate limiter middleware
 * @param {Object} options - Configuration options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum requests per window
 * @param {string} options.message - Error message
 * @returns {Function} Express middleware
 */
function createRateLimiter(options) {
  const { windowMs, max, message } = options;
  
  return (req, res, next) => {
    // Use session userId if available, otherwise IP
    const key = req.session?.userId || req.ip;
    const now = Date.now();
    
    // Get or create entry
    let entry = requestCounts.get(key);
    
    // Reset if window expired
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + windowMs
      };
      requestCounts.set(key, entry);
    }
    
    // Increment count
    entry.count++;
    
    // Check limit
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({ 
        error: message,
        retryAfter: retryAfter
      });
    }
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());
    
    next();
  };
}

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requestCounts.entries()) {
    if (now > entry.resetTime + 60000) { // 1 minute grace period
      requestCounts.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Upload rate limiter
 * Prevents too many concurrent uploads from exhausting disk I/O
 */
const uploadLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute window
  max: 5, // 5 uploads per minute
  message: 'Too many uploads. Please wait a minute and try again.'
});

/**
 * Download rate limiter
 * Prevents too many concurrent downloads from exhausting bandwidth
 */
const downloadLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute window
  max: 10, // 10 downloads per minute
  message: 'Too many downloads. Please wait a minute and try again.'
});

/**
 * General API rate limiter
 * Protects against general abuse
 */
const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: 'Too many requests. Please try again later.'
});

module.exports = {
  uploadLimiter,
  downloadLimiter,
  apiLimiter
};
