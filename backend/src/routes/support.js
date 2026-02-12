/**
 * Support routes for PocketCloud
 * Displays product boundaries, support statement, and system information
 */

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getSupportStatement, getUpgradeSafety, detectEnvironment, validateEnvironment } = require('../services/core/productBoundaries');
const { getIdentity } = require('../services/core/identityService');

const router = express.Router();

// Apply authentication to support routes
router.use(requireAuth);

/**
 * GET /support - Support information page
 */
router.get('/', async (req, res) => {
  try {
    const [supportStatement, upgradeSafety, environment, envValidation, identity] = await Promise.all([
      getSupportStatement(),
      getUpgradeSafety(),
      detectEnvironment(),
      validateEnvironment(),
      getIdentity()
    ]);
    
    res.render('support', {
      title: 'Support',
      username: req.session.username,
      supportStatement,
      upgradeSafety,
      environment,
      envValidation,
      identity
    });
  } catch (error) {
    console.error('Support page error:', error);
    res.status(500).render('error', { 
      message: 'Failed to load support information' 
    });
  }
});

/**
 * GET /support/environment - Environment information (JSON)
 */
router.get('/environment', async (req, res) => {
  try {
    const [environment, validation] = await Promise.all([
      detectEnvironment(),
      validateEnvironment()
    ]);
    
    res.json({
      environment,
      validation,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Environment check error:', error);
    res.status(500).json({ 
      error: 'Failed to check environment',
      details: error.message
    });
  }
});

module.exports = router;