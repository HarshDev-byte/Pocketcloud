/**
 * USB Mount Service for PocketCloud
 * Provides reliable, persistent, UUID-based USB storage mounting
 */

const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

// Canonical mount point - ONLY supported path
const MOUNT_POINT = '/mnt/pocketcloud';

/**
 * Get UUID of a block device
 */
function getDeviceUUID(devicePath) {
  try {
    const output = execSync(`blkid -s UUID -o value "${devicePath}"`, { encoding: 'utf8' });
    return output.trim();
  } catch (error) {
    return null;
  }
}

/**
 * Get device path from UUID
 */
function getDeviceFromUUID(uuid) {
  try {
    const output = execSync(`blkid -U "${uuid}"`, { encoding: 'utf8' });
    return output.trim();
  } catch (error) {
    return null;
  }
}

/**
 * Get filesystem type of a device
 */
function getFilesystemType(devicePath) {
  try {
    const output = execSync(`blkid -s TYPE -o value "${devicePath}"`, { encoding: 'utf8' });
    return output.trim();
  } catch (error) {
    return null;
  }
}

/**
 * Check if path is mounted
 */
function isMounted(mountPoint) {
  try {
    const output = execSync('mount', { encoding: 'utf8' });
    return output.includes(` ${mountPoint} `);
  } catch (error) {
    return false;
  }
}

/**
 * Get mount info for a path
 */
function getMountInfo(mountPoint) {
  try {
    const output = execSync(`findmnt -n -o SOURCE,FSTYPE "${mountPoint}"`, { encoding: 'utf8' });
    const parts = output.trim().split(/\s+/);
    return {
      device: parts[0],
      fstype: parts[1]
    };
  } catch (error) {
    return null;
  }
}

/**
 * Check if mount point is on root filesystem
 */
function isOnRootFilesystem(mountPoint) {
  try {
    // Get device for mount point
    const mountDf = execSync(`df "${mountPoint}" | tail -1`, { encoding: 'utf8' });
    const mountDevice = mountDf.split(/\s+/)[0];
    
    // Get device for root
    const rootDf = execSync('df / | tail -1', { encoding: 'utf8' });
    const rootDevice = rootDf.split(/\s+/)[0];
    
    return mountDevice === rootDevice;
  } catch (error) {
    // If we can't determine, assume it's on root (fail-safe)
    return true;
  }
}

/**
 * Verify mount point meets all requirements
 */
function verifyMountPoint() {
  // Check 1: Mount point exists
  if (!fs.existsSync(MOUNT_POINT)) {
    return {
      valid: false,
      reason: 'Mount point does not exist',
      action: `Create mount point: sudo mkdir -p ${MOUNT_POINT}`,
      code: 'MOUNT_POINT_MISSING'
    };
  }

  // Check 2: Is mounted
  if (!isMounted(MOUNT_POINT)) {
    return {
      valid: false,
      reason: 'No USB drive mounted',
      action: 'Mount USB drive and run: sudo mount -a',
      code: 'NOT_MOUNTED'
    };
  }

  // Check 3: Not on root filesystem
  if (isOnRootFilesystem(MOUNT_POINT)) {
    return {
      valid: false,
      reason: 'Mount point is on SD card, not external drive',
      action: `Mount external USB drive to ${MOUNT_POINT}`,
      code: 'ON_ROOT_FILESYSTEM'
    };
  }

  // Check 4: Get mount info
  const mountInfo = getMountInfo(MOUNT_POINT);
  if (!mountInfo) {
    return {
      valid: false,
      reason: 'Cannot read mount information',
      action: 'Check USB drive is properly mounted',
      code: 'MOUNT_INFO_FAILED'
    };
  }

  // Check 5: Filesystem type (prefer ext4, but allow others)
  const preferredFS = ['ext4', 'ext3', 'ext2'];
  const isPreferred = preferredFS.includes(mountInfo.fstype);
  
  // Check 6: Write access
  try {
    const testFile = path.join(MOUNT_POINT, '.pocketcloud-write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
  } catch (error) {
    return {
      valid: false,
      reason: 'Mount point not writable',
      action: 'Check USB drive permissions and disk space',
      code: 'NOT_WRITABLE'
    };
  }

  return {
    valid: true,
    mountInfo,
    isPreferred,
    warnings: isPreferred ? [] : [`Filesystem ${mountInfo.fstype} not optimal (ext4 recommended)`]
  };
}

/**
 * Get detailed mount status for diagnostics
 */
function getMountStatus() {
  const verification = verifyMountPoint();
  
  if (!verification.valid) {
    return {
      mounted: false,
      reason: verification.reason,
      action: verification.action,
      code: verification.code,
      mountPoint: MOUNT_POINT
    };
  }

  // Get UUID of mounted device
  const uuid = getDeviceUUID(verification.mountInfo.device);
  
  return {
    mounted: true,
    mountPoint: MOUNT_POINT,
    device: verification.mountInfo.device,
    fstype: verification.mountInfo.fstype,
    uuid: uuid,
    isPreferred: verification.isPreferred,
    warnings: verification.warnings
  };
}

/**
 * Generate fstab entry for UUID-based mounting
 */
function generateFstabEntry(uuid, fstype = 'ext4') {
  return `UUID=${uuid} ${MOUNT_POINT} ${fstype} defaults,nofail 0 2`;
}

/**
 * Get user-friendly error guidance
 */
function getErrorGuidance(code) {
  const guidance = {
    MOUNT_POINT_MISSING: {
      title: 'Mount point missing',
      steps: [
        'Create mount point:',
        `sudo mkdir -p ${MOUNT_POINT}`,
        'Then mount your USB drive and restart PocketCloud'
      ]
    },
    NOT_MOUNTED: {
      title: 'External storage not detected',
      expected: [
        `USB drive mounted at ${MOUNT_POINT}`,
        'ext4 filesystem (recommended)'
      ],
      steps: [
        '1. Plug in USB drive',
        '2. Run: sudo mount -a',
        '3. Restart PocketCloud'
      ]
    },
    ON_ROOT_FILESYSTEM: {
      title: 'Storage on SD card detected',
      problem: 'PocketCloud requires external USB storage for data safety',
      steps: [
        '1. Plug in external USB drive',
        `2. Mount to ${MOUNT_POINT}`,
        '3. Restart PocketCloud'
      ]
    },
    MOUNT_INFO_FAILED: {
      title: 'Mount information unavailable',
      steps: [
        '1. Check USB drive is properly connected',
        '2. Verify mount with: mount | grep pocketcloud',
        '3. Restart PocketCloud'
      ]
    },
    NOT_WRITABLE: {
      title: 'Storage not writable',
      steps: [
        '1. Check disk space: df -h',
        '2. Check permissions: ls -la /mnt/',
        '3. Fix with: sudo chown -R pocketcloud:pocketcloud /mnt/pocketcloud',
        '4. Restart PocketCloud'
      ]
    }
  };

  return guidance[code] || {
    title: 'Storage configuration error',
    steps: [
      '1. Check USB drive connection',
      '2. Verify mount configuration',
      '3. Restart PocketCloud'
    ]
  };
}

/**
 * Check if storage is healthy for runtime operations
 */
function isStorageHealthy() {
  const verification = verifyMountPoint();
  return verification.valid;
}

/**
 * Get storage health for health service
 */
function getStorageHealth() {
  const verification = verifyMountPoint();
  
  if (!verification.valid) {
    return {
      healthy: false,
      reason: verification.reason,
      action: verification.action,
      code: verification.code
    };
  }

  return {
    healthy: true,
    mountPoint: MOUNT_POINT,
    device: verification.mountInfo.device,
    fstype: verification.mountInfo.fstype,
    warnings: verification.warnings
  };
}

module.exports = {
  MOUNT_POINT,
  verifyMountPoint,
  getMountStatus,
  generateFstabEntry,
  getErrorGuidance,
  isStorageHealthy,
  getStorageHealth,
  getDeviceUUID,
  getDeviceFromUUID,
  getFilesystemType
};