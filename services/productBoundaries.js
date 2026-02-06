/**
 * Product Boundaries Service for PocketCloud
 * Defines and enforces explicit product boundaries, supported environments, and guarantees
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const config = require('../config/config');
const usbMountService = require('./usbMountService');

// PocketCloud Product Version - FINAL
const PRODUCT_VERSION = '1.0.0';
const BACKUP_FORMAT_VERSION = '1.0';

// PRODUCT IS COMPLETE - NO NEW FEATURES WILL BE ADDED TO 1.x SERIES

// Supported Environment Definitions
const SUPPORTED_ENVIRONMENTS = {
  OS: {
    supported: ['linux'],
    distributions: ['raspbian', 'raspberry pi os', 'debian', 'ubuntu'],
    architecture: ['arm64', 'x64']
  },
  STORAGE: {
    filesystem: ['ext4', 'ext3'],
    mountType: 'external_usb',
    minSize: 1024 * 1024 * 1024 // 1GB minimum
  },
  USAGE: {
    deployment: 'single_device',
    users: 'single_primary',
    access: 'local_network_only'
  }
};

// Explicitly Unsupported (Hard Boundaries)
const UNSUPPORTED_ENVIRONMENTS = {
  STORAGE: [
    'SD card storage',
    'Cloud hosting (AWS, GCP, Azure)',
    'Docker containers',
    'Network filesystems (NFS, SMB as storage root)',
    'RAID arrays',
    'LVM volumes',
    'Automatic disk formatting'
  ],
  OS: [
    'Windows as production environment',
    'macOS as production environment',
    'Docker containers',
    'Virtual machines (not recommended)'
  ],
  USAGE: [
    'Multi-device synchronization',
    'Real-time collaboration',
    'Public internet hosting',
    'Enterprise deployment'
  ]
};

// Immutable Configuration (Cannot Change After Setup)
const IMMUTABLE_CONFIG = {
  STORAGE_ROOT: {
    value: '/mnt/pocketcloud',
    reason: 'Storage location must be consistent for USB mounting and data integrity'
  },
  ENCRYPTION_ALGORITHM: {
    value: 'AES-256-GCM',
    reason: 'Changing encryption would break existing encrypted files'
  },
  KEY_DERIVATION: {
    value: 'scrypt',
    reason: 'Changing key derivation would make existing files inaccessible'
  },
  SESSION_MAX_AGE: {
    value: 24 * 60 * 60 * 1000, // 24 hours
    reason: 'Session duration affects security model and cannot be changed'
  },
  RATE_LIMITS: {
    upload: 5, // per minute
    download: 10, // per minute
    reason: 'Rate limits are part of the security model'
  }
};

/**
 * Detect current environment
 */
function detectEnvironment() {
  const env = {
    os: {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      distribution: null
    },
    storage: {
      root: config.STORAGE_ROOT,
      mounted: false,
      filesystem: null,
      device: null
    },
    node: {
      version: process.version
    }
  };
  
  // Detect Linux distribution
  if (env.os.platform === 'linux') {
    try {
      const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
      const nameMatch = osRelease.match(/PRETTY_NAME="([^"]+)"/);
      if (nameMatch) {
        env.os.distribution = nameMatch[1].toLowerCase();
      }
    } catch (error) {
      // Fallback detection methods
      try {
        env.os.distribution = execSync('lsb_release -d -s', { encoding: 'utf8' }).trim().toLowerCase();
      } catch (fallbackError) {
        env.os.distribution = 'unknown';
      }
    }
  }
  
  // Detect storage
  try {
    const mountStatus = usbMountService.getMountStatus();
    env.storage.mounted = mountStatus.mounted;
    env.storage.filesystem = mountStatus.fstype;
    env.storage.device = mountStatus.device;
  } catch (error) {
    env.storage.error = error.message;
  }
  
  return env;
}

/**
 * Validate environment against supported boundaries
 */
function validateEnvironment() {
  const env = detectEnvironment();
  const issues = [];
  
  // Check OS support
  if (!SUPPORTED_ENVIRONMENTS.OS.supported.includes(env.os.platform)) {
    issues.push({
      type: 'unsupported_os',
      severity: 'critical',
      current: env.os.platform,
      supported: SUPPORTED_ENVIRONMENTS.OS.supported,
      message: `Operating system '${env.os.platform}' is not supported`,
      action: 'PocketCloud requires Linux (Raspberry Pi OS, Debian, or Ubuntu)'
    });
  }
  
  // Check architecture
  if (!SUPPORTED_ENVIRONMENTS.OS.architecture.includes(env.os.arch)) {
    issues.push({
      type: 'unsupported_architecture',
      severity: 'warning',
      current: env.os.arch,
      supported: SUPPORTED_ENVIRONMENTS.OS.architecture,
      message: `Architecture '${env.os.arch}' may not be fully supported`,
      action: 'Recommended: arm64 (Raspberry Pi 4) or x64'
    });
  }
  
  // Check storage filesystem
  if (env.storage.mounted && env.storage.filesystem) {
    if (!SUPPORTED_ENVIRONMENTS.STORAGE.filesystem.includes(env.storage.filesystem)) {
      issues.push({
        type: 'unsupported_filesystem',
        severity: 'warning',
        current: env.storage.filesystem,
        supported: SUPPORTED_ENVIRONMENTS.STORAGE.filesystem,
        message: `Filesystem '${env.storage.filesystem}' is not optimal`,
        action: 'Recommended: ext4 for best performance and reliability'
      });
    }
  }
  
  // Check for explicitly unsupported storage
  if (env.storage.root !== '/mnt/pocketcloud') {
    issues.push({
      type: 'unsupported_storage_location',
      severity: 'critical',
      current: env.storage.root,
      supported: '/mnt/pocketcloud',
      message: 'Storage location must be /mnt/pocketcloud',
      action: 'Use the canonical mount point for external USB storage'
    });
  }
  
  return {
    environment: env,
    supported: issues.filter(i => i.severity === 'critical').length === 0,
    issues
  };
}

/**
 * Validate configuration immutability
 */
function validateConfigImmutability() {
  const violations = [];
  
  // Check STORAGE_ROOT
  if (config.STORAGE_ROOT !== IMMUTABLE_CONFIG.STORAGE_ROOT.value) {
    violations.push({
      setting: 'STORAGE_ROOT',
      current: config.STORAGE_ROOT,
      required: IMMUTABLE_CONFIG.STORAGE_ROOT.value,
      reason: IMMUTABLE_CONFIG.STORAGE_ROOT.reason
    });
  }
  
  // Check SESSION_MAX_AGE
  if (config.SESSION_MAX_AGE !== IMMUTABLE_CONFIG.SESSION_MAX_AGE.value) {
    violations.push({
      setting: 'SESSION_MAX_AGE',
      current: config.SESSION_MAX_AGE,
      required: IMMUTABLE_CONFIG.SESSION_MAX_AGE.value,
      reason: IMMUTABLE_CONFIG.SESSION_MAX_AGE.reason
    });
  }
  
  return violations;
}

/**
 * Check backup version compatibility
 */
function checkBackupCompatibility(backupVersion) {
  const currentMajor = parseInt(BACKUP_FORMAT_VERSION.split('.')[0]);
  const backupMajor = parseInt(backupVersion.split('.')[0]);
  
  if (backupMajor > currentMajor) {
    return {
      compatible: false,
      reason: 'backup_too_new',
      message: `Backup format v${backupVersion} is newer than supported v${BACKUP_FORMAT_VERSION}`,
      action: 'Update PocketCloud to restore this backup'
    };
  }
  
  if (backupMajor < currentMajor) {
    return {
      compatible: true,
      migration: true,
      reason: 'backup_needs_migration',
      message: `Backup format v${backupVersion} will be migrated to v${BACKUP_FORMAT_VERSION}`,
      action: 'Backup will be automatically updated during restore'
    };
  }
  
  return {
    compatible: true,
    migration: false,
    reason: 'version_match',
    message: `Backup format v${backupVersion} is compatible`
  };
}

/**
 * Get product support statement
 */
function getSupportStatement() {
  return {
    title: 'PocketCloud Support Boundaries',
    statement: 'PocketCloud is designed for personal use on a single device. We guarantee encryption, data integrity, and safe failure. We do not provide cloud sync, collaboration, or data recovery if passwords are lost.',
    guarantees: [
      'AES-256-GCM encryption for all files',
      'Data integrity with tamper detection',
      'Safe failure under all scenarios',
      'Zero-knowledge architecture (passwords never stored)',
      'Atomic backup and restore operations'
    ],
    limitations: [
      'Single device usage only',
      'No cloud synchronization',
      'No real-time collaboration',
      'No password recovery (by design)',
      'Local network access only'
    ],
    supported: {
      environment: 'Raspberry Pi OS (64-bit) with external USB storage',
      filesystem: 'ext4 (recommended), ext3 (supported)',
      usage: 'Personal file storage with encryption',
      access: 'Local network only'
    },
    unsupported: UNSUPPORTED_ENVIRONMENTS
  };
}

/**
 * Get upgrade safety information
 */
function getUpgradeSafety() {
  return {
    version: PRODUCT_VERSION,
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    upgradeRules: [
      'Never auto-migrate data silently',
      'Never change encryption parameters',
      'Never break restore compatibility within major version',
      'Always backup before upgrading'
    ],
    breakingChanges: {
      major: 'May require manual migration or fresh setup',
      minor: 'Backward compatible, may add new features',
      patch: 'Bug fixes only, fully compatible'
    },
    recommendation: 'Always create a backup before upgrading PocketCloud'
  };
}

/**
 * Enforce product boundaries at startup
 */
async function enforceProductBoundaries() {
  const results = {
    environment: null,
    config: null,
    supported: true,
    criticalIssues: [],
    warnings: []
  };
  
  // Validate environment
  const envValidation = validateEnvironment();
  results.environment = envValidation;
  
  const criticalEnvIssues = envValidation.issues.filter(i => i.severity === 'critical');
  const warningEnvIssues = envValidation.issues.filter(i => i.severity === 'warning');
  
  results.criticalIssues.push(...criticalEnvIssues);
  results.warnings.push(...warningEnvIssues);
  
  // Validate configuration immutability
  const configViolations = validateConfigImmutability();
  results.config = configViolations;
  
  if (configViolations.length > 0) {
    results.criticalIssues.push(...configViolations.map(v => ({
      type: 'config_violation',
      severity: 'critical',
      setting: v.setting,
      message: `Configuration ${v.setting} cannot be changed after setup`,
      reason: v.reason,
      action: `Reset ${v.setting} to ${v.required}`
    })));
  }
  
  results.supported = results.criticalIssues.length === 0;
  
  return results;
}

module.exports = {
  PRODUCT_VERSION,
  BACKUP_FORMAT_VERSION,
  SUPPORTED_ENVIRONMENTS,
  UNSUPPORTED_ENVIRONMENTS,
  IMMUTABLE_CONFIG,
  detectEnvironment,
  validateEnvironment,
  validateConfigImmutability,
  checkBackupCompatibility,
  getSupportStatement,
  getUpgradeSafety,
  enforceProductBoundaries
};