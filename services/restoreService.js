/**
 * Restore Service for PocketCloud
 * Handles atomic restore from .pcbackup files
 */

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const tar = require('tar');
const { pipeline } = require('stream');
const { promisify } = require('util');
const pipelineAsync = promisify(pipeline);

const config = require('../config/config');
const { STORAGE_ROOT } = require('./storageService');
const { BACKUP_FORMAT_VERSION, checkBackupCompatibility } = require('./productBoundaries');
const { BackupRestoreFailureHandler } = require('./failureDetection');

/**
 * Validate backup file format and integrity
 */
async function validateBackup(backupPath) {
  const tempDir = path.join(process.cwd(), 'temp', `restore-validate-${Date.now()}`);
  
  try {
    await fs.ensureDir(tempDir);
    
    // Extract backup to temp directory
    await tar.extract({
      file: backupPath,
      cwd: tempDir
    });
    
    // Check manifest exists
    const manifestPath = path.join(tempDir, 'manifest.json');
    if (!await fs.pathExists(manifestPath)) {
      throw new Error('Invalid backup: missing manifest.json');
    }
    
    // Read and validate manifest
    const manifest = await fs.readJson(manifestPath);
    
    if (!manifest.backupVersion) {
      throw new Error('Invalid backup: missing backup version');
    }
    
    if (manifest.backupVersion !== BACKUP_FORMAT_VERSION) {
      const compatibility = checkBackupCompatibility(manifest.backupVersion);
      if (!compatibility.compatible) {
        throw new Error(`${compatibility.message}. ${compatibility.action}`);
      }
      
      if (compatibility.migration) {
        console.warn(`Backup migration: ${compatibility.message}`);
      }
    }
    
    if (!manifest.checksum) {
      throw new Error('Invalid backup: missing checksum');
    }
    
    // Verify checksum
    const calculatedChecksum = await calculateBackupChecksum(tempDir);
    if (calculatedChecksum !== manifest.checksum) {
      throw new Error('Backup integrity check failed: checksum mismatch');
    }
    
    // Check required files exist
    const dbPath = path.join(tempDir, 'database.db');
    if (!await fs.pathExists(dbPath)) {
      throw new Error('Invalid backup: missing database.db');
    }
    
    const filesDir = path.join(tempDir, 'files');
    if (!await fs.pathExists(filesDir)) {
      throw new Error('Invalid backup: missing files directory');
    }
    
    // Validate database file
    const dbStat = await fs.stat(dbPath);
    if (dbStat.size === 0) {
      throw new Error('Invalid backup: database file is empty');
    }
    
    // Count encrypted files
    let encryptedFileCount = 0;
    const userDirs = await fs.readdir(filesDir);
    
    for (const userDir of userDirs) {
      const userPath = path.join(filesDir, userDir);
      const stat = await fs.stat(userPath);
      
      if (stat.isDirectory()) {
        const files = await fs.readdir(userPath);
        for (const file of files) {
          if (file.endsWith('.enc')) {
            encryptedFileCount++;
          }
        }
      }
    }
    
    await fs.remove(tempDir);
    
    return {
      valid: true,
      manifest,
      encryptedFileCount
    };
    
  } catch (error) {
    // Clean up temp directory
    try {
      await fs.remove(tempDir);
    } catch (cleanupError) {
      console.warn('Failed to clean up validation temp directory:', cleanupError.message);
    }
    
    return {
      valid: false,
      error: error.message
    };
  }
}

/**
 * Perform atomic restore from backup
 */
async function performRestore(backupPath) {
  const tempDir = path.join(process.cwd(), 'temp', `restore-${Date.now()}`);
  const backupDir = path.join(tempDir, 'backup');
  const currentDataBackup = path.join(tempDir, 'current-backup');
  
  try {
    await fs.ensureDir(tempDir);
    await fs.ensureDir(backupDir);
    
    // Step 1: Validate backup
    const validation = await validateBackup(backupPath);
    if (!validation.valid) {
      throw new Error(`Backup validation failed: ${validation.error}`);
    }
    
    // Step 2: Extract backup to temp directory
    await tar.extract({
      file: backupPath,
      cwd: backupDir
    });
    
    // Step 3: Backup current data (for rollback)
    await fs.ensureDir(currentDataBackup);
    
    // Backup current database
    if (await fs.pathExists(config.DB_PATH)) {
      await fs.copy(config.DB_PATH, path.join(currentDataBackup, 'database.db'));
    }
    
    // Backup current storage
    if (await fs.pathExists(STORAGE_ROOT)) {
      await fs.copy(STORAGE_ROOT, path.join(currentDataBackup, 'storage'));
    }
    
    // Backup current identity
    const identityPath = path.join(process.cwd(), 'data', '.pocketcloud-identity');
    if (await fs.pathExists(identityPath)) {
      await fs.copy(identityPath, path.join(currentDataBackup, 'identity.json'));
    }
    
    // Step 4: Atomic swap - restore database
    const restoredDbPath = path.join(backupDir, 'database.db');
    await fs.copy(restoredDbPath, config.DB_PATH);
    
    // Step 5: Atomic swap - restore storage
    // Remove current storage and replace with backup
    if (await fs.pathExists(STORAGE_ROOT)) {
      await fs.remove(STORAGE_ROOT);
    }
    
    const restoredFilesPath = path.join(backupDir, 'files');
    await fs.copy(restoredFilesPath, STORAGE_ROOT);
    
    // Step 6: Restore identity if exists
    const restoredIdentityPath = path.join(backupDir, 'identity.json');
    if (await fs.pathExists(restoredIdentityPath)) {
      await fs.copy(restoredIdentityPath, identityPath);
    }
    
    // Step 7: Clean up temp directory
    await fs.remove(tempDir);
    
    // Log security event
    console.log(`Security event: System restored from backup at ${new Date().toISOString()}`);
    console.log(`Restored ${validation.encryptedFileCount} encrypted files`);
    
    return {
      success: true,
      manifest: validation.manifest,
      encryptedFileCount: validation.encryptedFileCount
    };
    
  } catch (error) {
    // Rollback on failure using failure handler
    const rollbackResult = await BackupRestoreFailureHandler.handleRestoreFailure(
      backupDir, 
      currentDataBackup, 
      error
    );
    
    // Clean up temp directory
    try {
      await fs.remove(tempDir);
    } catch (cleanupError) {
      console.warn('Failed to clean up restore temp directory:', cleanupError.message);
    }
    
    return {
      success: false,
      error: error.message,
      rollback: rollbackResult
    };
  }
}

/**
 * Calculate SHA-256 checksum of backup contents (same as backup service)
 */
async function calculateBackupChecksum(backupDir) {
  const hash = crypto.createHash('sha256');
  
  // Hash all files in deterministic order
  const files = [];
  
  async function collectFiles(dir, prefix = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.join(prefix, entry.name);
      
      if (entry.isDirectory()) {
        await collectFiles(fullPath, relativePath);
      } else {
        files.push({ path: fullPath, name: relativePath });
      }
    }
  }
  
  await collectFiles(backupDir);
  
  // Hash files in order
  for (const file of files) {
    hash.update(file.name);
    const content = await fs.readFile(file.path);
    hash.update(content);
  }
  
  return hash.digest('hex');
}

/**
 * Get restore preview information
 */
async function getRestorePreview(backupPath) {
  try {
    const validation = await validateBackup(backupPath);
    
    if (!validation.valid) {
      return {
        valid: false,
        error: validation.error
      };
    }
    
    const manifest = validation.manifest;
    
    return {
      valid: true,
      backupVersion: manifest.backupVersion,
      pocketcloudVersion: manifest.pocketcloudVersion,
      timestamp: manifest.timestamp,
      fileCount: manifest.fileCount,
      encryptedFileCount: validation.encryptedFileCount,
      totalSize: manifest.totalEncryptedSize,
      formattedSize: formatBytes(manifest.totalEncryptedSize),
      age: getBackupAge(manifest.timestamp)
    };
    
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

/**
 * Get human-readable backup age
 */
function getBackupAge(timestamp) {
  const backupDate = new Date(timestamp);
  const now = new Date();
  const diffMs = now - backupDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  
  if (diffDays > 0) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  } else {
    return 'Just now';
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = {
  validateBackup,
  performRestore,
  getRestorePreview
};