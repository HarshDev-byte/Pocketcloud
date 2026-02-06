const { getDatabase } = require('../config/database');

/**
 * Check if first-run setup is complete
 * Redirects to /setup if not complete
 */
function requireSetup(req, res, next) {
  // Skip check for setup route itself
  if (req.path === '/setup' || req.path.startsWith('/setup/')) {
    return next();
  }
  
  try {
    const db = getDatabase();
    
    // Check if setup is complete
    const result = db.exec('SELECT value FROM system_config WHERE key = ?', ['first_run_complete']);
    
    if (result.length === 0 || result[0].values.length === 0 || !result[0].values[0][0]) {
      // First run not complete - redirect to setup
      return res.redirect('/setup');
    }
    
    // Setup complete, proceed
    next();
  } catch (error) {
    console.error('Setup check error:', error);
    // On error, assume setup needed
    return res.redirect('/setup');
  }
}

/**
 * Check if setup is already complete
 * Redirects to home if already done (prevents re-running setup)
 */
function redirectIfSetupComplete(req, res, next) {
  try {
    const db = getDatabase();
    
    const result = db.exec('SELECT value FROM system_config WHERE key = ?', ['first_run_complete']);
    
    if (result.length > 0 && result[0].values.length > 0 && result[0].values[0][0]) {
      // Setup already complete
      return res.redirect('/');
    }
    
    // Setup not complete, allow access to setup
    next();
  } catch (error) {
    console.error('Setup check error:', error);
    next();
  }
}

module.exports = {
  requireSetup,
  redirectIfSetupComplete
};
