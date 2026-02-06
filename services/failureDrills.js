/**
 * Failure Drills for PocketCloud
 * Defines and verifies safe failure behavior under real-world scenarios
 */

const fs = require('fs-extra');
const path = require('path');
const { getDatabase } = require('../config/database');
const { STORAGE_ROOT } = require('./storageService');
const usbMountService = require('./usbMountService');

/**
 * Failure Drill Matrix - Defines expected behavior for each failure scenario
 */
const FAILURE_SCENARIOS = {
  USB_UNPLUGGED_UPLOAD: {
    name: 'USB unplugged during upload',
    immediate: 'Upload stream fails, temp file remains',
    userSees: 'Storage disconnected. Upload stopped safely.',
    dataPreserved: 'All existing encrypted files intact',
    cleanedUp: 'Temp file cleaned on next startup',
    recovery: 'Reconnect the drive and try again.',
    code: 'USB_DISCONNECTED_UPLOAD'
  },
  
  USB_UNPLUGGED_DOWNLOAD: {
    name: 'USB unplugged during download',
    immediate: 'Download stream aborts, partial data sent',
    userSees: 'Storage disconnected. Download interrupted.',
    dataPreserved: 'All encrypted files intact on reconnect',
    cleanedUp: 'No cleanup needed (stream-based)',
    recovery: 'Reconnect the drive and download again.',
    code: 'USB_DISCONNECTED_DOWNLOAD'
  },
  
  POWER_LOSS_UPLOAD: {
    name: 'Power loss during upload',
    immediate: 'Process terminates, temp file may remain',
    userSees: 'System restarted. Previous upload was not completed.',
    dataPreserved: 'All existing encrypted files intact',
    cleanedUp: 'Temp files and orphan DB entries cleaned on startup',
    recovery: 'Upload the file again.',
    code: 'POWER_LOSS_UPLOAD'
  },
  
  POWER_LOSS_BACKUP: {
    name: 'Power loss during backup creation',
    immediate: 'Backup process terminates',
    userSees: 'System restarted. Backup was not completed.',
    dataPreserved: 'All encrypted files and database intact',
    cleanedUp: 'Backup temp files cleaned on startup',
    recovery: 'Create a new backup.',
    code: 'POWER_LOSS_BACKUP'
  },
  
  POWER_LOSS_RESTORE: {
    name: 'Power loss during restore',
    immediate: 'Restore process terminates mid-operation',
    userSees: 'System restarted. Restore was interrupted - data may be inconsistent.',
    dataPreserved: 'Depends on restore progress - may need manual recovery',
    cleanedUp: 'Restore temp files cleaned, consistency check runs',
    recovery: 'Check data integrity and restore from backup again if needed.',
    code: 'POWER_LOSS_RESTORE'
  },
  
  WRONG_PASSWORD_RESTORE: {
    name: 'Wrong password after restore',
    immediate: 'Restore completes successfully (encrypted data restored)',
    userSees: 'Password does not match backup. Cannot decrypt files.',
    dataPreserved: 'All encrypted files restored correctly',
    cleanedUp: 'No cleanup needed',
    recovery: 'Remember the original password from when backup was created.',
    code: 'WRONG_PASSWORD_RESTORE'
  },
  
  CORRUPTED_BACKUP: {
    name: 'Corrupted backup file',
    immediate: 'Backup validation fails before any changes',
    userSees: 'Backup file is corrupted or invalid.',
    dataPreserved: 'All current data untouched',
    cleanedUp: 'Uploaded backup file deleted',
    recovery: 'Use a different backup file or create a new backup.',
    code: 'CORRUPTED_BACKUP'
  },
  
  DISK_FULL_UPLOAD: {
    name: 'Disk full during upload',
    immediate: 'Write operation fails, upload aborts',
    userSees: 'Storage is full. Upload failed.',
    dataPreserved: 'All existing encrypted files intact',
    cleanedUp: 'Partial temp file cleaned automatically',
    recovery: 'Delete some files to free space, then try again.',
    code: 'DISK_FULL_UPLOAD'
  },
  
  DISK_READ_ONLY: {
    name: 'Disk remounted read-only',
    immediate: 'Write operations fail, system enters degraded mode',
    userSees: 'Storage is read-only. Uploads disabled.',
    dataPreserved: 'All existing files readable',
    cleanedUp: 'No cleanup possible until writable',
    recovery: 'Check disk for errors and remount as writable.',
    code: 'DISK_READ_ONLY'
  },
  
  SESSION_EXPIRES_OPERATION: {
    name: 'Session expires mid-operation',
    immediate: 'Operation continues but user loses access',
    userSees: 'Your session has expired. Please log in again.',
    dataPreserved: 'All data intact, operation may complete',
    cleanedUp: 'Session data cleared, temp files cleaned on next startup',
    recovery: 'Log in again to access your files.',
    code: 'SESSION_EXPIRED'
  }
};

/**
 * Verify system state after failure scenarios
 */
class FailureVerifier {
  constructor() {
    this.results = [];
  }
  
  /**
   * Check for orphaned temp files
   */
  async checkOrphanedTempFiles() {
    const issues = [];
    
    try {
      if (!await fs.pathExists(STORAGE_ROOT)) {
        return issues;
      }
      
      const userDirs = await fs.readdir(STORAGE_ROOT);
      
      for (const userDir of userDirs) {
        const userPath = path.join(STORAGE_ROOT, userDir);
        const stat = await fs.stat(userPath);
        
        if (stat.isDirectory()) {
          const files = await fs.readdir(userPath);
          
          for (const file of files) {
            // Check for temp files (should not exist after operations complete)
            if (file.startsWith('temp-') || file.includes('.tmp')) {
              issues.push({
                type: 'orphaned_temp_file',
                path: path.join(userPath, file),
                severity: 'warning'
              });
            }
            
            // Check for files without .enc extension (should not exist)
            if (!file.endsWith('.enc') && !file.startsWith('.')) {
              issues.push({
                type: 'unencrypted_file',
                path: path.join(userPath, file),
                severity: 'critical'
              });
            }
          }
        }
      }
    } catch (error) {
      issues.push({
        type: 'filesystem_check_failed',
        error: error.message,
        severity: 'error'
      });
    }
    
    return issues;
  }
  
  /**
   * Check database-filesystem consistency
   */
  async checkDatabaseConsistency() {
    const issues = [];
    
    try {
      const db = getDatabase();
      const result = db.exec('SELECT id, user_id, filepath FROM files');
      
      if (result.length === 0) {
        return issues; // No files in database
      }
      
      const dbFiles = result[0].values.map(row => ({
        id: row[0],
        userId: row[1],
        filepath: row[2]
      }));
      
      // Check if files in database exist on disk
      for (const dbFile of dbFiles) {
        const fullPath = path.join(STORAGE_ROOT, dbFile.filepath);
        
        if (!await fs.pathExists(fullPath)) {
          issues.push({
            type: 'orphaned_db_entry',
            fileId: dbFile.id,
            filepath: dbFile.filepath,
            severity: 'warning'
          });
        }
      }
      
      // Check if files on disk have database entries
      if (await fs.pathExists(STORAGE_ROOT)) {
        const userDirs = await fs.readdir(STORAGE_ROOT);
        
        for (const userDir of userDirs) {
          const userPath = path.join(STORAGE_ROOT, userDir);
          const stat = await fs.stat(userPath);
          
          if (stat.isDirectory()) {
            const files = await fs.readdir(userPath);
            
            for (const file of files) {
              if (file.endsWith('.enc')) {
                const relativePath = path.join(userDir, file);
                const hasDbEntry = dbFiles.some(dbFile => dbFile.filepath === relativePath);
                
                if (!hasDbEntry) {
                  issues.push({
                    type: 'orphaned_file',
                    filepath: relativePath,
                    severity: 'warning'
                  });
                }
              }
            }
          }
        }
      }
    } catch (error) {
      issues.push({
        type: 'consistency_check_failed',
        error: error.message,
        severity: 'error'
      });
    }
    
    return issues;
  }
  
  /**
   * Check storage health and mount status
   */
  async checkStorageHealth() {
    const issues = [];
    
    try {
      const mountStatus = usbMountService.getMountStatus();
      
      if (!mountStatus.mounted) {
        issues.push({
          type: 'storage_not_mounted',
          reason: mountStatus.reason,
          action: mountStatus.action,
          severity: 'critical'
        });
      } else {
        // Check if writable
        const testFile = path.join(STORAGE_ROOT, '.write-test');
        try {
          await fs.writeFile(testFile, 'test');
          await fs.remove(testFile);
        } catch (error) {
          issues.push({
            type: 'storage_not_writable',
            error: error.message,
            severity: 'critical'
          });
        }
      }
    } catch (error) {
      issues.push({
        type: 'storage_check_failed',
        error: error.message,
        severity: 'error'
      });
    }
    
    return issues;
  }
  
  /**
   * Run complete system verification
   */
  async runFullVerification() {
    const results = {
      timestamp: new Date().toISOString(),
      issues: [],
      summary: {
        critical: 0,
        warnings: 0,
        errors: 0
      }
    };
    
    // Run all checks
    const [tempFiles, consistency, storage] = await Promise.all([
      this.checkOrphanedTempFiles(),
      this.checkDatabaseConsistency(),
      this.checkStorageHealth()
    ]);
    
    results.issues = [...tempFiles, ...consistency, ...storage];
    
    // Count severity levels
    results.issues.forEach(issue => {
      if (issue.severity === 'critical') results.summary.critical++;
      else if (issue.severity === 'warning') results.summary.warnings++;
      else if (issue.severity === 'error') results.summary.errors++;
    });
    
    return results;
  }
}

/**
 * Auto-cleanup orphaned data
 */
async function performStartupCleanup() {
  const cleanupResults = {
    tempFilesRemoved: 0,
    orphanedEntriesRemoved: 0,
    errors: []
  };
  
  try {
    // Clean orphaned temp files
    if (await fs.pathExists(STORAGE_ROOT)) {
      const userDirs = await fs.readdir(STORAGE_ROOT);
      
      for (const userDir of userDirs) {
        const userPath = path.join(STORAGE_ROOT, userDir);
        const stat = await fs.stat(userPath);
        
        if (stat.isDirectory()) {
          const files = await fs.readdir(userPath);
          
          for (const file of files) {
            if (file.startsWith('temp-') || file.includes('.tmp')) {
              try {
                await fs.remove(path.join(userPath, file));
                cleanupResults.tempFilesRemoved++;
              } catch (error) {
                cleanupResults.errors.push(`Failed to remove temp file ${file}: ${error.message}`);
              }
            }
          }
        }
      }
    }
    
    // Clean orphaned database entries
    try {
      const db = getDatabase();
      const result = db.exec('SELECT id, filepath FROM files');
      
      if (result.length > 0) {
        const dbFiles = result[0].values;
        
        for (const [fileId, filepath] of dbFiles) {
          const fullPath = path.join(STORAGE_ROOT, filepath);
          
          if (!await fs.pathExists(fullPath)) {
            db.exec('DELETE FROM files WHERE id = ?', [fileId]);
            cleanupResults.orphanedEntriesRemoved++;
          }
        }
      }
    } catch (error) {
      cleanupResults.errors.push(`Database cleanup failed: ${error.message}`);
    }
    
  } catch (error) {
    cleanupResults.errors.push(`Startup cleanup failed: ${error.message}`);
  }
  
  return cleanupResults;
}

/**
 * Get user-friendly failure message
 */
function getFailureMessage(code, details = {}) {
  const scenario = Object.values(FAILURE_SCENARIOS).find(s => s.code === code);
  
  if (!scenario) {
    return {
      message: 'An unexpected error occurred.',
      action: 'Please try again or contact support.',
      technical: details.error || 'Unknown error'
    };
  }
  
  return {
    message: scenario.userSees,
    action: scenario.recovery,
    technical: details.error || scenario.immediate
  };
}

/**
 * Validate system is in safe state
 */
async function validateSafeState() {
  const verifier = new FailureVerifier();
  const results = await verifier.runFullVerification();
  
  const isSafe = results.summary.critical === 0;
  
  return {
    safe: isSafe,
    issues: results.issues,
    summary: results.summary,
    timestamp: results.timestamp
  };
}

module.exports = {
  FAILURE_SCENARIOS,
  FailureVerifier,
  performStartupCleanup,
  getFailureMessage,
  validateSafeState
};