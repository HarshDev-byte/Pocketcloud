/**
 * Storage service for external USB drive management
 * Provides real filesystem stats and mount verification
 * Uses canonical mount point /mnt/pocketcloud
 */

const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const usbMountService = require('./usbMountService');

// Use canonical mount point instead of config
const STORAGE_ROOT = usbMountService.MOUNT_POINT;

/**
 * Get real filesystem statistics for storage path
 */
function getFilesystemStats(storagePath) {
  try {
    // Use df to get real filesystem stats
    const output = execSync(`df -B1 "${storagePath}" | tail -1`, { encoding: 'utf8' });
    const parts = output.split(/\s+/);
    
    // df output: Filesystem 1B-blocks Used Available Use% Mounted
    const totalBytes = parseInt(parts[1], 10);
    const usedBytes = parseInt(parts[2], 10);
    const freeBytes = parseInt(parts[3], 10);
    const percentUsed = parseInt(parts[4].replace('%', ''), 10);
    
    return {
      totalBytes,
      usedBytes,
      freeBytes,
      percentUsed,
      available: true
    };
  } catch (error) {
    return {
      totalBytes: 0,
      usedBytes: 0,
      freeBytes: 0,
      percentUsed: 0,
      available: false,
      error: error.message
    };
  }
}

/**
 * Verify storage is properly configured and available
 */
async function verifyStorage() {
  // Use USB mount service for verification
  const mountStatus = usbMountService.getMountStatus();
  
  if (!mountStatus.mounted) {
    return {
      healthy: false,
      reason: mountStatus.reason,
      action: mountStatus.action,
      code: mountStatus.code
    };
  }
  
  // Get filesystem stats
  const stats = getFilesystemStats(STORAGE_ROOT);
  if (!stats.available) {
    return {
      healthy: false,
      reason: 'Cannot read storage statistics',
      action: 'Check USB drive is properly mounted',
      code: 'STATS_UNAVAILABLE'
    };
  }
  
  // Check sufficient free space (at least 1%)
  if (stats.percentUsed >= 99) {
    return {
      healthy: false,
      reason: 'Storage is full',
      action: 'Delete files to free up space',
      code: 'STORAGE_FULL'
    };
  }
  
  return {
    healthy: true,
    stats,
    mountInfo: {
      device: mountStatus.device,
      fstype: mountStatus.fstype,
      uuid: mountStatus.uuid
    },
    warnings: mountStatus.warnings || []
  };
}

/**
 * Get storage state for health checks
 */
async function getStorageHealth() {
  const verification = await verifyStorage();
  
  if (!verification.healthy) {
    return {
      healthy: false,
      reason: verification.reason,
      action: verification.action
    };
  }
  
  // Check if almost full (< 5% free)
  if (verification.stats.percentUsed >= 95) {
    return {
      healthy: true,
      warning: 'Storage almost full',
      stats: verification.stats
    };
  }
  
  return {
    healthy: true,
    stats: verification.stats
  };
}

/**
 * Check if uploads should be allowed
 */
async function canUpload() {
  const health = await getStorageHealth();
  
  if (!health.healthy) {
    return { allowed: false, reason: health.reason };
  }
  
  // Block uploads if < 5% free
  if (health.stats.percentUsed >= 95) {
    return { allowed: false, reason: 'Storage almost full (< 5% free)' };
  }
  
  return { allowed: true };
}

/**
 * Get user-friendly storage info for dashboard
 */
async function getStorageInfo() {
  const verification = await verifyStorage();
  
  if (!verification.healthy) {
    const guidance = usbMountService.getErrorGuidance(verification.code);
    
    return {
      available: false,
      state: 'unavailable',
      message: verification.reason,
      action: verification.action,
      code: verification.code,
      guidance: guidance,
      device: 'External USB Drive',
      mountPath: STORAGE_ROOT
    };
  }
  
  const stats = verification.stats;
  
  // Determine state
  let state = 'healthy';
  let message = 'Storage healthy';
  let action = null;
  
  if (stats.percentUsed >= 99) {
    state = 'full';
    message = 'Storage full';
    action = 'Delete files to free up space';
  } else if (stats.percentUsed >= 95) {
    state = 'almost-full';
    message = 'Storage almost full';
    action = 'Consider deleting old files';
  }
  
  return {
    available: true,
    state,
    message,
    action,
    device: verification.mountInfo.device,
    fstype: verification.mountInfo.fstype,
    uuid: verification.mountInfo.uuid,
    mountPath: STORAGE_ROOT,
    totalBytes: stats.totalBytes,
    usedBytes: stats.usedBytes,
    freeBytes: stats.freeBytes,
    percentUsed: stats.percentUsed,
    totalGB: (stats.totalBytes / (1024 ** 3)).toFixed(2),
    usedGB: (stats.usedBytes / (1024 ** 3)).toFixed(2),
    freeGB: (stats.freeBytes / (1024 ** 3)).toFixed(2),
    warnings: verification.warnings
  };
}

module.exports = {
  STORAGE_ROOT,
  verifyStorage,
  getStorageHealth,
  canUpload,
  getStorageInfo
};
