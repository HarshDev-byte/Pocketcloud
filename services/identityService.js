/**
 * System identity service
 * Manages persistent device identity and reassurance timestamps
 */

const fs = require('fs-extra');
const path = require('path');

const IDENTITY_FILE = path.join(process.cwd(), 'data', '.pocketcloud-identity');

/**
 * Get or create system identity
 */
async function getIdentity() {
  try {
    if (await fs.pathExists(IDENTITY_FILE)) {
      const data = await fs.readJson(IDENTITY_FILE);
      return data;
    }
  } catch (error) {
    // If file corrupted, recreate
  }
  
  // Create new identity
  const identity = {
    name: 'My PocketCloud',
    setupTimestamp: new Date().toISOString(),
    setupCompleted: false,
    lastHealthCheck: new Date().toISOString()
  };
  
  await fs.ensureDir(path.dirname(IDENTITY_FILE));
  await fs.writeJson(IDENTITY_FILE, identity);
  
  return identity;
}

/**
 * Mark setup as completed
 */
async function markSetupCompleted() {
  const identity = await getIdentity();
  identity.setupCompleted = true;
  await fs.writeJson(IDENTITY_FILE, identity);
}

/**
 * Update last health check timestamp
 */
async function updateHealthCheck() {
  const identity = await getIdentity();
  identity.lastHealthCheck = new Date().toISOString();
  await fs.writeJson(IDENTITY_FILE, identity);
}

/**
 * Get time since last health check in human-readable format
 */
function getTimeSinceHealthCheck(lastCheck) {
  const now = new Date();
  const then = new Date(lastCheck);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 60) {
    return 'just now';
  } else if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  } else {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  }
}

module.exports = {
  getIdentity,
  markSetupCompleted,
  updateHealthCheck,
  getTimeSinceHealthCheck
};
