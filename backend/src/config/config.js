const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Get or generate session secret
 * Generates once, saves to .pocketcloud-secret, reuses on restart
 */
function getSessionSecret() {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }
  
  const secretFile = path.join(process.cwd(), '.pocketcloud-secret');
  
  // Try to read existing secret
  if (fs.existsSync(secretFile)) {
    try {
      return fs.readFileSync(secretFile, 'utf8').trim();
    } catch (error) {
      console.warn('Could not read session secret file, generating new one');
    }
  }
  
  // Generate new secret
  const secret = crypto.randomBytes(32).toString('hex');
  
  // Save for future restarts
  try {
    fs.writeFileSync(secretFile, secret, { mode: 0o600 });
    console.log('✓ Generated new session secret');
  } catch (error) {
    console.warn('Could not save session secret file, will regenerate on restart');
  }
  
  return secret;
}

// Centralized configuration for PocketCloud
const config = {
  // Server configuration
  PORT: parseInt(process.env.PORT, 10) || 3000,
  
  // Storage configuration - CANONICAL MOUNT POINT ONLY
  STORAGE_ROOT: (process.env.NODE_ENV === 'development' || process.env.POCKETCLOUD_DEV_MODE === 'true') 
    ? path.join(process.cwd(), 'dev-storage') // Development mode: local directory
    : '/mnt/pocketcloud', // Production: Fixed canonical path, no override allowed
  
  // Upload limits (1GB default - streaming supports it)
  MAX_UPLOAD_SIZE: parseInt(process.env.MAX_UPLOAD_SIZE, 10) || (1024 * 1024 * 1024),
  
  // Session configuration
  SESSION_SECRET: getSessionSecret(),
  SESSION_MAX_AGE: 24 * 60 * 60 * 1000, // 24 hours (fixed, not configurable)
  
  // Database configuration
  DB_PATH: process.env.DB_PATH || path.join(process.cwd(), 'data', 'pocketcloud.db')
};

module.exports = config;
