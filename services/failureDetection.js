/**
 * Failure Detection Service for PocketCloud
 * Detects and handles failures gracefully with safe state convergence
 */

const fs = require('fs-extra');
const path = require('path');
const { getDatabase } = require('../config/database');
const { STORAGE_ROOT } = require('./storageService');
const usbMountService = require('./usbMountService');
const { getFailureMessage } = require('./failureDrills');

/**
 * Storage failure detector
 */
class StorageFailureDetector {
  constructor() {
    this.lastKnownState = null;
    this.checkInterval = null;
  }
  
  /**
   * Start monitoring storage health
   */
  startMonitoring(intervalMs = 30000) {
    this.checkInterval = setInterval(async () => {
      await this.checkStorageHealth();
    }, intervalMs);
  }
  
  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
  
  /**
   * Check current storage health
   */
  async checkStorageHealth() {
    try {
      const currentState = usbMountService.getMountStatus();
      
      // Detect state changes
      if (this.lastKnownState && this.lastKnownState.mounted && !currentState.mounted) {
        console.warn('Storage failure detected: USB drive disconnected');
        await this.handleStorageDisconnection();
      }
      
      this.lastKnownState = currentState;
      return currentState;
      
    } catch (error) {
      console.error('Storage health check failed:', error.message);
      return { mounted: false, error: error.message };
    }
  }
  
  /**
   * Handle storage disconnection
   */
  async handleStorageDisconnection() {
    // Log the event
    console.log('Security event: Storage disconnected during operation');
    
    // System will enter degraded mode via health service
    // No immediate action needed - operations will fail gracefully
  }
}

/**
 * Upload failure handler
 */
class UploadFailureHandler {
  /**
   * Handle upload failure with cleanup
   */
  static async handleUploadFailure(tempFilePath, fileId = null, error = null) {
    const cleanupResults = {
      tempFileRemoved: false,
      dbEntryRemoved: false,
      error: null
    };
    
    try {
      // Remove temp file if it exists
      if (tempFilePath && await fs.pathExists(tempFilePath)) {
        await fs.remove(tempFilePath);
        cleanupResults.tempFileRemoved = true;
      }
      
      // Remove database entry if it was created
      if (fileId) {
        try {
          const db = getDatabase();
          db.exec('DELETE FROM files WHERE id = ?', [fileId]);
          cleanupResults.dbEntryRemoved = true;
        } catch (dbError) {
          console.warn('Failed to remove orphaned DB entry:', dbError.message);
        }
      }
      
      // Log the failure
      console.log('Upload failure handled:', {
        tempFile: tempFilePath,
        fileId: fileId,
        error: error?.message || 'Unknown error'
      });
      
    } catch (cleanupError) {
      cleanupResults.error = cleanupError.message;
      console.error('Upload cleanup failed:', cleanupError.message);
    }
    
    return cleanupResults;
  }
  
  /**
   * Get user-friendly upload error message
   */
  static getUploadErrorMessage(error) {
    if (error.code === 'ENOSPC') {
      return getFailureMessage('DISK_FULL_UPLOAD');
    }
    
    if (error.code === 'EROFS') {
      return getFailureMessage('DISK_READ_ONLY');
    }
    
    if (error.message.includes('USB') || error.message.includes('mount')) {
      return getFailureMessage('USB_DISCONNECTED_UPLOAD');
    }
    
    return {
      message: 'Upload failed due to an unexpected error.',
      action: 'Please try again.',
      technical: error.message
    };
  }
}

/**
 * Download failure handler
 */
class DownloadFailureHandler {
  /**
   * Handle download failure
   */
  static async handleDownloadFailure(filePath, error = null) {
    // For downloads, we don't need cleanup since we're streaming
    // Just log the failure
    console.log('Download failure handled:', {
      file: filePath,
      error: error?.message || 'Unknown error'
    });
    
    return {
      handled: true,
      error: error?.message
    };
  }
  
  /**
   * Get user-friendly download error message
   */
  static getDownloadErrorMessage(error) {
    if (error.message.includes('USB') || error.message.includes('mount')) {
      return getFailureMessage('USB_DISCONNECTED_DOWNLOAD');
    }
    
    if (error.name === 'CryptoIntegrityError') {
      return {
        message: 'This file appears to be damaged and cannot be opened.',
        action: 'The file may be corrupted. Try downloading again or restore from backup.',
        technical: 'Encryption integrity check failed'
      };
    }
    
    return {
      message: 'Download failed due to an unexpected error.',
      action: 'Please try again.',
      technical: error.message
    };
  }
}

/**
 * Session failure handler
 */
class SessionFailureHandler {
  /**
   * Handle session expiration during operation
   */
  static handleSessionExpiry(req, res) {
    // Clear any remaining session data
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.warn('Failed to destroy expired session:', err.message);
        }
      });
    }
    
    const failureMessage = getFailureMessage('SESSION_EXPIRED');
    
    // Return appropriate response based on request type
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({
        error: failureMessage.message,
        action: failureMessage.action,
        redirectTo: '/auth/login'
      });
    } else {
      return res.redirect('/auth/login?expired=1');
    }
  }
}

/**
 * Backup/Restore failure handler
 */
class BackupRestoreFailureHandler {
  /**
   * Handle backup creation failure
   */
  static async handleBackupFailure(tempDir, error = null) {
    const cleanupResults = {
      tempDirRemoved: false,
      error: null
    };
    
    try {
      if (tempDir && await fs.pathExists(tempDir)) {
        await fs.remove(tempDir);
        cleanupResults.tempDirRemoved = true;
      }
      
      console.log('Backup failure handled:', {
        tempDir: tempDir,
        error: error?.message || 'Unknown error'
      });
      
    } catch (cleanupError) {
      cleanupResults.error = cleanupError.message;
      console.error('Backup cleanup failed:', cleanupError.message);
    }
    
    return cleanupResults;
  }
  
  /**
   * Handle restore failure with rollback
   */
  static async handleRestoreFailure(backupDir, currentDataBackup, error = null) {
    console.error('Restore failure detected, attempting rollback...');
    
    const rollbackResults = {
      databaseRestored: false,
      storageRestored: false,
      identityRestored: false,
      error: null
    };
    
    try {
      // Restore original database
      const originalDb = path.join(currentDataBackup, 'database.db');
      if (await fs.pathExists(originalDb)) {
        const config = require('../config/config');
        await fs.copy(originalDb, config.DB_PATH);
        rollbackResults.databaseRestored = true;
      }
      
      // Restore original storage
      const originalStorage = path.join(currentDataBackup, 'storage');
      if (await fs.pathExists(originalStorage)) {
        if (await fs.pathExists(STORAGE_ROOT)) {
          await fs.remove(STORAGE_ROOT);
        }
        await fs.copy(originalStorage, STORAGE_ROOT);
        rollbackResults.storageRestored = true;
      }
      
      // Restore original identity
      const originalIdentity = path.join(currentDataBackup, 'identity.json');
      if (await fs.pathExists(originalIdentity)) {
        const identityPath = path.join(process.cwd(), 'data', '.pocketcloud-identity');
        await fs.copy(originalIdentity, identityPath);
        rollbackResults.identityRestored = true;
      }
      
      console.log('Rollback completed successfully');
      
    } catch (rollbackError) {
      rollbackResults.error = rollbackError.message;
      console.error('CRITICAL: Rollback failed:', rollbackError.message);
    }
    
    return rollbackResults;
  }
}

/**
 * System state validator
 */
class SystemStateValidator {
  /**
   * Validate system is in consistent state
   */
  static async validateConsistency() {
    const issues = [];
    
    try {
      // Check no plaintext files exist
      if (await fs.pathExists(STORAGE_ROOT)) {
        const userDirs = await fs.readdir(STORAGE_ROOT);
        
        for (const userDir of userDirs) {
          const userPath = path.join(STORAGE_ROOT, userDir);
          const stat = await fs.stat(userPath);
          
          if (stat.isDirectory()) {
            const files = await fs.readdir(userPath);
            
            for (const file of files) {
              if (!file.endsWith('.enc') && !file.startsWith('.')) {
                issues.push({
                  type: 'plaintext_file_detected',
                  path: path.join(userPath, file),
                  severity: 'critical'
                });
              }
            }
          }
        }
      }
      
      // Check database is accessible
      try {
        const db = getDatabase();
        db.exec('SELECT 1');
      } catch (dbError) {
        issues.push({
          type: 'database_inaccessible',
          error: dbError.message,
          severity: 'critical'
        });
      }
      
      // Check storage is mounted and writable
      const mountStatus = usbMountService.getMountStatus();
      if (!mountStatus.mounted) {
        issues.push({
          type: 'storage_not_mounted',
          reason: mountStatus.reason,
          severity: 'critical'
        });
      }
      
    } catch (error) {
      issues.push({
        type: 'validation_failed',
        error: error.message,
        severity: 'error'
      });
    }
    
    return issues;
  }
  
  /**
   * Ensure system converges to safe state
   */
  static async ensureSafeState() {
    const issues = await this.validateConsistency();
    const criticalIssues = issues.filter(issue => issue.severity === 'critical');
    
    if (criticalIssues.length > 0) {
      console.error('Critical system state issues detected:', criticalIssues);
      
      // For critical issues, system should not operate
      return {
        safe: false,
        issues: criticalIssues,
        action: 'System requires manual intervention'
      };
    }
    
    return {
      safe: true,
      issues: issues.filter(issue => issue.severity !== 'critical'),
      action: null
    };
  }
}

// Global storage monitor instance
const storageMonitor = new StorageFailureDetector();

module.exports = {
  StorageFailureDetector,
  UploadFailureHandler,
  DownloadFailureHandler,
  SessionFailureHandler,
  BackupRestoreFailureHandler,
  SystemStateValidator,
  storageMonitor
};