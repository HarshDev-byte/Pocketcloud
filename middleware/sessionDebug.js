/**
 * Session Debug Middleware for PocketCloud
 * Helps diagnose cross-device access issues
 */

/**
 * Enhanced authentication middleware with debugging
 */
function requireAuthWithDebug(req, res, next) {
  // Basic auth check
  if (!req.session || !req.session.userId) {
    console.warn(`❌ Auth failed: No session or userId`);
    console.warn(`   URL: ${req.originalUrl}`);
    console.warn(`   IP: ${req.ip}`);
    console.warn(`   User-Agent: ${req.get('User-Agent')?.substring(0, 100)}`);
    
    return res.status(401).render('error', {
      message: 'Please log in to access this page',
      action: 'You need to log in with your username and password to access your encrypted files.',
      showLoginButton: true
    });
  }
  
  // Enhanced validation for encrypted file operations
  if (req.path.includes('/download/') || req.path.includes('/upload')) {
    if (!req.session.password || !req.session.encryptionSalt) {
      console.warn(`❌ Encryption keys missing for user: ${req.session.username}`);
      console.warn(`   Session ID: ${req.sessionID}`);
      console.warn(`   Has password: ${!!req.session.password}`);
      console.warn(`   Has salt: ${!!req.session.encryptionSalt}`);
      console.warn(`   URL: ${req.originalUrl}`);
      console.warn(`   IP: ${req.ip}`);
      console.warn(`   User-Agent: ${req.get('User-Agent')?.substring(0, 100)}`);
      
      return res.status(401).render('error', {
        message: 'Encryption keys not available in your session',
        action: 'Please log out and log back in with your password to restore encryption keys. This is required to decrypt your files.',
        technical: 'Session missing encryption credentials. This commonly happens when accessing from a new device or after session expiry.',
        showLoginButton: true
      });
    }
  }
  
  // Log successful auth for debugging
  if (process.env.NODE_ENV === 'development' || process.env.DEBUG_SESSIONS) {
    console.log(`✓ Auth success: ${req.session.username} (${req.method} ${req.originalUrl})`);
    console.log(`   Session ID: ${req.sessionID}`);
    console.log(`   Has encryption keys: ${!!(req.session.password && req.session.encryptionSalt)}`);
  }
  
  next();
}

/**
 * Middleware to log session information for debugging
 */
function logSessionInfo(req, res, next) {
  if (process.env.NODE_ENV === 'development' || process.env.DEBUG_SESSIONS) {
    console.log(`📊 Session Info:`);
    console.log(`   URL: ${req.method} ${req.originalUrl}`);
    console.log(`   Session ID: ${req.sessionID}`);
    console.log(`   User ID: ${req.session?.userId || 'none'}`);
    console.log(`   Username: ${req.session?.username || 'none'}`);
    console.log(`   Has password: ${!!req.session?.password}`);
    console.log(`   Has salt: ${!!req.session?.encryptionSalt}`);
    console.log(`   IP: ${req.ip}`);
    console.log(`   User-Agent: ${req.get('User-Agent')?.substring(0, 100)}`);
  }
  next();
}

/**
 * Middleware to validate encryption readiness
 */
function requireEncryption(req, res, next) {
  if (!req.session?.password || !req.session?.encryptionSalt) {
    console.error(`❌ Encryption not ready for ${req.session?.username || 'unknown user'}`);
    
    return res.status(401).render('error', {
      message: 'Encryption keys not available',
      action: 'Please log out and log back in to restore your encryption keys.',
      technical: 'Your session is missing the encryption credentials needed to decrypt files. This is a security feature.',
      showLoginButton: true
    });
  }
  
  next();
}

module.exports = {
  requireAuthWithDebug,
  logSessionInfo,
  requireEncryption
};