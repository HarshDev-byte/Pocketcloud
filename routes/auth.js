const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDatabase, saveDatabase } = require('../config/database');
const { redirectIfAuth } = require('../middleware/auth');
const { generateSalt } = require('../services/cryptoService');

// Login page
router.get('/login', redirectIfAuth, (req, res) => {
  res.render('login', { title: 'Login', error: null });
});

// Login handler
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.render('login', { title: 'Login', error: 'Please provide username and password' });
  }
  
  try {
    const db = getDatabase();
    const result = db.exec('SELECT * FROM users WHERE username = ?', [username]);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return res.render('login', { title: 'Login', error: 'Invalid credentials' });
    }
    
    const user = {
      id: result[0].values[0][0],
      username: result[0].values[0][1],
      password: result[0].values[0][2],
      encryptionSalt: result[0].values[0][3]
    };
    
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.render('login', { title: 'Login', error: 'Invalid credentials' });
    }
    
    // Store session data including encryption salt and raw password
    // WARNING: Storing password in session is necessary for zero-knowledge encryption
    // Session is server-side only (not sent to client)
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.encryptionSalt = user.encryptionSalt;
    req.session.password = password; // Needed for file decryption
    
    console.log(`✓ User logged in: ${username} (encryption ready)`);
    res.redirect('/files');
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { title: 'Login', error: 'Login failed' });
  }
});

// Register page
router.get('/register', redirectIfAuth, (req, res) => {
  res.render('register', { title: 'Register', error: null });
});

// Register handler
router.post('/register', async (req, res) => {
  const { username, password, confirmPassword } = req.body;
  
  if (!username || !password || !confirmPassword) {
    return res.render('register', { title: 'Register', error: 'All fields are required' });
  }
  
  if (password !== confirmPassword) {
    return res.render('register', { title: 'Register', error: 'Passwords do not match' });
  }
  
  if (password.length < 6) {
    return res.render('register', { title: 'Register', error: 'Password must be at least 6 characters' });
  }
  
  try {
    const db = getDatabase();
    
    // Check if username exists
    const existing = db.exec('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      return res.render('register', { title: 'Register', error: 'Username already exists' });
    }
    
    // Hash password for authentication
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Generate encryption salt for file encryption
    const encryptionSalt = generateSalt().toString('hex');
    
    db.run('INSERT INTO users (username, password, encryption_salt) VALUES (?, ?, ?)', 
      [username, hashedPassword, encryptionSalt]);
    saveDatabase();
    
    console.log(`✓ User registered: ${username} (encryption enabled)`);
    res.redirect('/auth/login');
  } catch (error) {
    console.error('Registration error:', error);
    res.render('register', { title: 'Register', error: 'Registration failed' });
  }
});

// Dashboard (temporary - for Phase 2 testing)
router.get('/dashboard', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/auth/login');
  }
  
  res.send(`
    <h1>Welcome, ${req.session.username}!</h1>
    <p>You are logged in.</p>
    <a href="/auth/logout">Logout</a>
  `);
});

// Logout
router.get('/logout', (req, res) => {
  const username = req.session.username;
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    } else {
      console.log(`✓ User logged out: ${username}`);
    }
    res.redirect('/');
  });
});

module.exports = router;
