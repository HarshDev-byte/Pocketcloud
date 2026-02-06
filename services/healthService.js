/**
 * Health and readiness service
 * Provides runtime system state without authentication
 */

const fs = require('fs-extra');
const path = require('path');
const config = require('../config/config');
const { getDatabase } = require('../config/database');
const { getStorageHealth } = require('./storageService');
const usbMountService = require('./usbMountService');

/**
 * Check if database is reachable and functional
 */
function checkDatabase() {
  try {
    const db = getDatabase();
    // Simple query to verify database works
    db.exec('SELECT 1');
    return { healthy: true };
  } catch (error) {
    return { healthy: false, reason: 'Database unreachable' };
  }
}

/**
 * Check if storage is available and healthy
 */
async function checkStorage() {
  // First check if USB is mounted
  const mountStatus = usbMountService.getMountStatus();
  
  if (!mountStatus.mounted) {
    return { 
      healthy: false, 
      reason: 'USB drive not mounted',
      mounted: false
    };
  }
  
  const health = await getStorageHealth();
  
  if (!health.healthy) {
    return { 
      healthy: false, 
      reason: health.reason,
      mounted: true
    };
  }
  
  // Warning if almost full, but still healthy
  if (health.warning) {
    return { 
      healthy: true, 
      warning: health.warning,
      mounted: true
    };
  }
  
  return { 
    healthy: true,
    mounted: true
  };
}

/**
 * Check if encryption subsystem is available
 */
function checkEncryption() {
  try {
    const crypto = require('crypto');
    // Verify crypto module works
    crypto.randomBytes(16);
    return { healthy: true };
  } catch (error) {
    return { healthy: false, reason: 'Encryption unavailable' };
  }
}

/**
 * Get overall system health
 * Returns machine-readable status
 */
async function getHealth() {
  const checks = {
    database: checkDatabase(),
    storage: await checkStorage(),
    encryption: checkEncryption()
  };
  
  const allHealthy = Object.values(checks).every(c => c.healthy);
  
  return {
    status: allHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks: {
      database: checks.database.healthy,
      storage: checks.storage.healthy,
      encryption: checks.encryption.healthy
    },
    storage: {
      mounted: checks.storage.mounted || false,
      healthy: checks.storage.healthy
    },
    // Include warnings
    ...(checks.storage.warning ? { warnings: [checks.storage.warning] } : {}),
    // Include reasons for failures
    ...(allHealthy ? {} : {
      failures: Object.entries(checks)
        .filter(([_, check]) => !check.healthy)
        .map(([name, check]) => ({ component: name, reason: check.reason }))
    })
  };
}

/**
 * Check if system is ready to accept operations
 * More strict than health - used to block operations
 */
async function isReady() {
  const health = await getHealth();
  return health.status === 'healthy';
}

/**
 * Get user-visible status for UI
 * Returns simple state for display
 */
async function getUserStatus() {
  const health = await getHealth();
  
  if (health.status === 'healthy') {
    // Check for warnings
    if (health.warnings && health.warnings.length > 0) {
      return {
        state: 'warning',
        color: 'yellow',
        message: health.warnings[0],
        action: 'Consider deleting old files'
      };
    }
    
    return {
      state: 'operational',
      color: 'green',
      message: 'System operational',
      action: null
    };
  }
  
  // Determine specific issue and action
  const failure = health.failures[0]; // Show first failure
  
  if (failure.component === 'database') {
    return {
      state: 'degraded',
      color: 'red',
      message: 'Database unavailable',
      action: 'Restart PocketCloud'
    };
  }
  
  if (failure.component === 'storage') {
    return {
      state: 'degraded',
      color: 'red',
      message: failure.reason,
      action: 'Check USB drive is mounted and accessible'
    };
  }
  
  if (failure.component === 'encryption') {
    return {
      state: 'degraded',
      color: 'red',
      message: 'Encryption unavailable',
      action: 'Restart PocketCloud'
    };
  }
  
  return {
    state: 'degraded',
    color: 'red',
    message: 'System degraded',
    action: 'Restart PocketCloud'
  };
}

module.exports = {
  getHealth,
  isReady,
  getUserStatus
};
