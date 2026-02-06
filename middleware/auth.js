const { SessionFailureHandler } = require('../services/failureDetection');

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  
  // Handle session expiry with proper failure messaging
  return SessionFailureHandler.handleSessionExpiry(req, res);
}

function redirectIfAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return res.redirect('/files');
  }
  next();
}

module.exports = { requireAuth, redirectIfAuth };
