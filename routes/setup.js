const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDatabase, saveDatabase } = require('../config/database');
const { generateSalt } = require('../services/cryptoService');
const { redirectIfSetupComplete } = require('../middleware/setup');
const { getSetupReadiness } = require('../services/setupVerification');

// Password validation
function validatePassword(password) {
  if (!password || password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }
  
  const commonPasswords = ['password', '12345678', 'qwerty', 'admin', 'letmein', 'welcome'];
  if (commonPasswords.includes(password.toLowerCase())) {
    return { valid: false, error: 'Password too common. Choose something unique.' };
  }
  
  return { valid: true };
}

// Setup page
router.get('/', redirectIfSetupComplete, async (req, res) => {
  try {
    // Run setup verification checklist
    const readiness = await getSetupReadiness();
    
    res.render('setup', { 
      title: 'First-Time Setup',
      error: null,
      readiness
    });
  } catch (error) {
    console.error('Setup page error:', error);
    res.render('setup', { 
      title: 'First-Time Setup',
      error: 'Failed to check system readiness',
      readiness: { ready: false, criticalFailures: [], warnings: [], checklist: { items: [] } }
    });
  }
});

// Process setup
router.post('/', redirectIfSetupComplete, async (req, res) => {
  const { username, password, confirmPassword, acknowledged } = req.body;
  
  try {
    // First, check system readiness
    const readiness = await getSetupReadiness();
    
    if (!readiness.ready) {
      return res.render('setup', {
        title: 'First-Time Setup',
        error: 'System not ready for setup. Please fix the issues above.',
        readiness
      });
    }
    
    const db = getDatabase();
    
    // Validate inputs
    if (!username || !password || !confirmPassword) {
      return res.render('setup', {
        title: 'First-Time Setup',
        error: 'All fields are required',
        readiness
      });
    }
    
    if (password !== confirmPassword) {
      return res.render('setup', {
        title: 'First-Time Setup',
        error: 'Passwords do not match',
        readiness
      });
    }
    
    // Validate password strength
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      return res.render('setup', {
        title: 'First-Time Setup',
        error: passwordCheck.error,
        readiness
      });
    }
    
    // CRITICAL: Verify acknowledgment
    if (acknowledged !== 'true') {
      return res.status(400).render('setup', {
        title: 'First-Time Setup',
        error: 'You must acknowledge the password responsibility warning',
        readiness
      });
    }
    
    // Check if any users already exist (safety check)
    const existingUsers = db.exec('SELECT COUNT(*) FROM users');
    if (existingUsers[0].values[0][0] > 0) {
      return res.status(403).render('error', {
        message: 'Setup already complete. Users already exist.'
      });
    }
    
    // Create admin user
    const hashedPassword = await bcrypt.hash(password, 10);
    const encryptionSalt = generateSalt().toString('hex');
    
    db.run(
      'INSERT INTO users (username, password, encryption_salt) VALUES (?, ?, ?)',
      [username, hashedPassword, encryptionSalt]
    );
    
    // Mark setup as complete
    db.run(
      'INSERT INTO system_config (key, value) VALUES (?, ?)',
      ['first_run_complete', 'true']
    );
    
    saveDatabase();
    
    console.log(`✓ First-time setup complete: Admin user '${username}' created`);
    
    // Redirect to login
    res.redirect('/auth/login');
    
  } catch (error) {
    console.error('Setup error:', error);
    
    // Get readiness for error display
    let readiness;
    try {
      readiness = await getSetupReadiness();
    } catch (readinessError) {
      readiness = { ready: false, criticalFailures: [], warnings: [], checklist: { items: [] } };
    }
    
    res.render('setup', {
      title: 'First-Time Setup',
      error: 'Setup failed. Please try again.',
      readiness
    });
  }
});

module.exports = router;
