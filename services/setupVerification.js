/**
 * Setup Verification Service for PocketCloud
 * Ensures system is ready for first-time setup with zero ambiguity
 */

const fs = require('fs-extra');
const { execSync } = require('child_process');
const usbMountService = require('./usbMountService');
const { PRODUCT_VERSION } = require('./productBoundaries');

/**
 * Run complete setup verification checklist
 */
async function runSetupChecklist() {
  const checklist = {
    timestamp: new Date().toISOString(),
    allPassed: false,
    items: []
  };
  
  // Check 1: USB Storage Mounted
  try {
    const mountStatus = usbMountService.getMountStatus();
    checklist.items.push({
      id: 'usb_mounted',
      label: 'USB storage mounted at /mnt/pocketcloud',
      passed: mountStatus.mounted,
      details: mountStatus.mounted ? 
        `Device: ${mountStatus.device}` : 
        mountStatus.reason,
      fixCommand: mountStatus.mounted ? null : 'sudo mount -a',
      critical: true
    });
  } catch (error) {
    checklist.items.push({
      id: 'usb_mounted',
      label: 'USB storage mounted at /mnt/pocketcloud',
      passed: false,
      details: 'Cannot check USB mount status',
      fixCommand: 'Check USB drive connection and run: sudo mount -a',
      critical: true
    });
  }
  
  // Check 2: Filesystem Type
  try {
    const mountStatus = usbMountService.getMountStatus();
    const isOptimal = mountStatus.mounted && (mountStatus.fstype === 'ext4' || mountStatus.fstype === 'ext3');
    checklist.items.push({
      id: 'filesystem_type',
      label: 'Filesystem is ext4 (recommended)',
      passed: isOptimal,
      details: mountStatus.mounted ? 
        `Current: ${mountStatus.fstype}` : 
        'USB not mounted',
      fixCommand: isOptimal ? null : 'Format USB drive with ext4 filesystem',
      critical: false // Warning, not critical
    });
  } catch (error) {
    checklist.items.push({
      id: 'filesystem_type',
      label: 'Filesystem is ext4 (recommended)',
      passed: false,
      details: 'Cannot check filesystem type',
      fixCommand: 'Ensure USB drive is properly mounted',
      critical: false
    });
  }
  
  // Check 3: Disk Space
  try {
    const mountStatus = usbMountService.getMountStatus();
    if (mountStatus.mounted) {
      const output = execSync(`df "${usbMountService.MOUNT_POINT}" | tail -1`, { encoding: 'utf8' });
      const parts = output.split(/\s+/);
      const totalBytes = parseInt(parts[1], 10);
      const usedBytes = parseInt(parts[2], 10);
      const percentUsed = parseInt(parts[4].replace('%', ''), 10);
      const freePercent = 100 - percentUsed;
      
      const hasSpace = freePercent >= 10; // At least 10% free
      checklist.items.push({
        id: 'disk_space',
        label: 'Disk has >10% free space',
        passed: hasSpace,
        details: `${freePercent}% free (${(totalBytes * (freePercent/100) / (1024**3)).toFixed(1)} GB)`,
        fixCommand: hasSpace ? null : 'Delete files to free up space on USB drive',
        critical: true
      });
    } else {
      checklist.items.push({
        id: 'disk_space',
        label: 'Disk has >10% free space',
        passed: false,
        details: 'Cannot check - USB not mounted',
        fixCommand: 'Mount USB drive first',
        critical: true
      });
    }
  } catch (error) {
    checklist.items.push({
      id: 'disk_space',
      label: 'Disk has >10% free space',
      passed: false,
      details: 'Cannot check disk space',
      fixCommand: 'Verify USB drive is accessible',
      critical: true
    });
  }
  
  // Check 4: System Clock
  try {
    const now = new Date();
    const year = now.getFullYear();
    const isValid = year >= 2024 && year <= 2030; // Reasonable range
    
    checklist.items.push({
      id: 'system_clock',
      label: 'System clock is valid',
      passed: isValid,
      details: `Current time: ${now.toLocaleString()}`,
      fixCommand: isValid ? null : 'Set correct date/time: sudo timedatectl set-time "YYYY-MM-DD HH:MM:SS"',
      critical: false
    });
  } catch (error) {
    checklist.items.push({
      id: 'system_clock',
      label: 'System clock is valid',
      passed: false,
      details: 'Cannot check system time',
      fixCommand: 'Check system clock settings',
      critical: false
    });
  }
  
  // Check 5: Node Version
  try {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    const isSupported = majorVersion >= 18; // Node 18+ required
    
    checklist.items.push({
      id: 'node_version',
      label: 'Node.js version supported',
      passed: isSupported,
      details: `Current: ${nodeVersion} (requires v18+)`,
      fixCommand: isSupported ? null : 'Update Node.js to version 18 or higher',
      critical: true
    });
  } catch (error) {
    checklist.items.push({
      id: 'node_version',
      label: 'Node.js version supported',
      passed: false,
      details: 'Cannot check Node.js version',
      fixCommand: 'Ensure Node.js is properly installed',
      critical: true
    });
  }
  
  // Check 6: PocketCloud Version
  checklist.items.push({
    id: 'pocketcloud_version',
    label: 'PocketCloud version',
    passed: true,
    details: `Version ${PRODUCT_VERSION}`,
    fixCommand: null,
    critical: false
  });
  
  // Determine overall status
  const criticalItems = checklist.items.filter(item => item.critical);
  const criticalPassed = criticalItems.filter(item => item.passed);
  checklist.allPassed = criticalPassed.length === criticalItems.length;
  
  return checklist;
}

/**
 * Get setup readiness status
 */
async function getSetupReadiness() {
  const checklist = await runSetupChecklist();
  
  const criticalFailures = checklist.items.filter(item => item.critical && !item.passed);
  const warnings = checklist.items.filter(item => !item.critical && !item.passed);
  
  return {
    ready: checklist.allPassed,
    criticalFailures,
    warnings,
    checklist
  };
}

/**
 * Check if this is a first-time setup
 */
async function isFirstTimeSetup() {
  try {
    // Check if any users exist in database
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    const result = db.exec('SELECT COUNT(*) as count FROM users');
    
    if (result.length === 0 || result[0].values.length === 0) {
      return true; // No users table or no users
    }
    
    const userCount = result[0].values[0][0];
    return userCount === 0;
  } catch (error) {
    // If we can't check, assume first time
    return true;
  }
}

/**
 * Check if user has uploaded any files
 */
async function hasUploadedFiles(userId) {
  try {
    const { getDatabase } = require('../config/database');
    const db = getDatabase();
    const result = db.exec('SELECT COUNT(*) as count FROM files WHERE user_id = ?', [userId]);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return false;
    }
    
    const fileCount = result[0].values[0][0];
    return fileCount > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Check if user has created any backups
 */
async function hasCreatedBackup() {
  try {
    const identityPath = require('path').join(process.cwd(), 'data', '.pocketcloud-identity');
    if (!await fs.pathExists(identityPath)) {
      return false;
    }
    
    const identity = await fs.readJson(identityPath);
    return !!identity.lastBackup;
  } catch (error) {
    return false;
  }
}

/**
 * Mark first success moment as shown
 */
async function markFirstSuccessShown(userId) {
  try {
    const identityPath = require('path').join(process.cwd(), 'data', '.pocketcloud-identity');
    let identity = {};
    
    if (await fs.pathExists(identityPath)) {
      identity = await fs.readJson(identityPath);
    }
    
    if (!identity.firstSuccessShown) {
      identity.firstSuccessShown = {};
    }
    
    identity.firstSuccessShown[userId] = new Date().toISOString();
    await fs.writeJson(identityPath, identity, { spaces: 2 });
    
    return true;
  } catch (error) {
    console.warn('Failed to mark first success shown:', error.message);
    return false;
  }
}

/**
 * Check if first success moment has been shown
 */
async function hasShownFirstSuccess(userId) {
  try {
    const identityPath = require('path').join(process.cwd(), 'data', '.pocketcloud-identity');
    if (!await fs.pathExists(identityPath)) {
      return false;
    }
    
    const identity = await fs.readJson(identityPath);
    return !!(identity.firstSuccessShown && identity.firstSuccessShown[userId]);
  } catch (error) {
    return false;
  }
}

/**
 * Mark backup nudge as dismissed
 */
async function dismissBackupNudge(userId) {
  try {
    const identityPath = require('path').join(process.cwd(), 'data', '.pocketcloud-identity');
    let identity = {};
    
    if (await fs.pathExists(identityPath)) {
      identity = await fs.readJson(identityPath);
    }
    
    if (!identity.backupNudgeDismissed) {
      identity.backupNudgeDismissed = {};
    }
    
    identity.backupNudgeDismissed[userId] = new Date().toISOString();
    await fs.writeJson(identityPath, identity, { spaces: 2 });
    
    return true;
  } catch (error) {
    console.warn('Failed to dismiss backup nudge:', error.message);
    return false;
  }
}

/**
 * Check if backup nudge has been dismissed
 */
async function hasBackupNudgeBeenDismissed(userId) {
  try {
    const identityPath = require('path').join(process.cwd(), 'data', '.pocketcloud-identity');
    if (!await fs.pathExists(identityPath)) {
      return false;
    }
    
    const identity = await fs.readJson(identityPath);
    return !!(identity.backupNudgeDismissed && identity.backupNudgeDismissed[userId]);
  } catch (error) {
    return false;
  }
}

module.exports = {
  runSetupChecklist,
  getSetupReadiness,
  isFirstTimeSetup,
  hasUploadedFiles,
  hasCreatedBackup,
  markFirstSuccessShown,
  hasShownFirstSuccess,
  dismissBackupNudge,
  hasBackupNudgeBeenDismissed
};