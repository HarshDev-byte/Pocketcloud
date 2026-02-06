/**
 * Readiness middleware
 * Blocks operations when system is not ready
 */

const { isReady } = require('../services/healthService');

/**
 * Middleware to check system readiness before operations
 * Used for upload, download, delete routes
 */
async function requireReady(req, res, next) {
  const ready = await isReady();
  
  if (!ready) {
    return res.status(503).render('error', {
      message: 'System is not ready. Please wait a moment and try again.'
    });
  }
  
  next();
}

module.exports = { requireReady };
