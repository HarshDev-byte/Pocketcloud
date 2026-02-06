/**
 * Backup Service for PocketCloud
 * Creates portable, encrypted backups that preserve zero-knowledge guarantees
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
const { BackupRestoreFailureHandler } = require('./failureDetection');
const { PRODUCT_VERSION, BACKUP_FORMAT_VERSION } = require('./productBoundaries');

// Backup format version
const BACKUP_VERSION = BACKUP_FORMAT_VERSION;

/**
 * Get backup manifest information
 */
async function getBackupManifest() {
  try {
    // Count encrypted files
    let fileCount = 0;
    let totalSize = 0;
    
    const userDirs = await fs.readdir(STORAGE_ROOT);
    for (const userDir of userDirs) {
      const userPath = path.join(STORAGE_ROOT, userDir);
      const stat = await fs.stat(userPath);
      
      if (stat.isDirectory()) {
        const files = await fs.readdir(userPath);
        for (const file of files) {
          if (file.endsWith('.enc')) {
            fileCount++;
            const filePath = path.join(userPath, file);
            const fileStat = await fs.stat(filePath);
            totalSize += fileStat.size;
          }
        }
      }
    }
    
    // Get database size
    const dbStat = await fs.stat(config.DB_PATH);
    totalSize += dbStat.size;
    
    // Get identity file size if exists
    const identityPath = path.join(process.cwd(), 'data', '.pocketcloud-identity');
    if (await fs.pathExists(identityPath)) {
      const identityStat = await fs.stat(identityPath);
      totalSize += identityStat.size;
    }
    
    return {
      backupVersion: BACKUP_FORMAT_VERSION,
      pocketcloudVersion: PRODUCT_VERSION,
      timestamp: new Date().toISOString(),
      fileCount,
      totalEncryptedSize: totalSize,
      estimatedBackupSize: Math.ceil(totalSize * 1.1) // Add 10% overhead for TAR
    };
  } catch (error) {
    throw new Error(`Failed to generate backup manifest: ${error.message}`);
  }
}

/**
 * Create backup stream
 * Returns a readable stream of the .pcbackup file
 */
async function createBackupStream() {
  const tempDir = path.join(process.cwd(), 'temp', `backup-${Date.now()}`);
  
  try {
    // Create temp directory
    await fs.ensureDir(tempDir);
    
    // Generate manifest
    const manifest = await getBackupManifest();
    
    // Copy database
    const dbBackupPath = path.join(tempDir, 'database.db');
    await fs.copy(config.DB_PATH, dbBackupPath);
    
    // Copy identity file if exists
    const identityPath = path.join(process.cwd(), 'data', '.pocketcloud-identity');
    if (await fs.pathExists(identityPath)) {
      const identityBackupPath = path.join(tempDir, 'identity.json');
      await fs.copy(identityPath, identityBackupPath);
    }
    
    // Copy encrypted files
    const filesDir = path.join(tempDir, 'files');
    await fs.ensureDir(filesDir);
    
    const userDirs = await fs.readdir(STORAGE_ROOT);
    for (const userDir of userDirs) {
      const userPath = path.join(STORAGE_ROOT, userDir);
      const stat = await fs.stat(userPath);
      
      if (stat.isDirectory()) {
        const userBackupPath = path.join(filesDir, userDir);
        await fs.ensureDir(userBackupPath);
        
        const files = await fs.readdir(userPath);
        for (const file of files) {
          if (file.endsWith('.enc')) {
            const srcPath = path.join(userPath, file);
            const destPath = path.join(userBackupPath, file);
            await fs.copy(srcPath, destPath);
          }
        }
      }
    }
    
    // Calculate checksum of all files
    const checksum = await calculateBackupChecksum(tempDir);
    manifest.checksum = checksum;
    
    // Write manifest
    const manifestPath = path.join(tempDir, 'manifest.json');
    await fs.writeJson(manifestPath, manifest, { spaces: 2 });
    
    // Create TAR stream
    const tarStream = tar.create({
      gzip: false, // No compression to avoid hiding corruption
      cwd: tempDir
    }, ['.']);
    
    // Clean up temp directory when stream ends
    tarStream.on('end', async () => {
      try {
        await fs.remove(tempDir);
      } catch (error) {
        console.warn('Failed to clean up backup temp directory:', error.message);
      }
    });
    
    tarStream.on('error', async (error) => {
      try {
        await BackupRestoreFailureHandler.handleBackupFailure(tempDir, error);
      } catch (cleanupError) {
        console.warn('Failed to clean up backup temp directory after error:', cleanupError.message);
      }
    });
    
    return {
      stream: tarStream,
      manifest
    };
    
  } catch (error) {
    // Clean up on error using failure handler
    await BackupRestoreFailureHandler.handleBackupFailure(tempDir, error);
    throw new Error(`Backup creation failed: ${error.message}`);
  }
}

/**
 * Calculate SHA-256 checksum of backup contents
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
 * Get backup statistics for UI
 */
async function getBackupStats() {
  try {
    const manifest = await getBackupManifest();
    
    return {
      fileCount: manifest.fileCount,
      totalSize: manifest.totalEncryptedSize,
      estimatedBackupSize: manifest.estimatedBackupSize,
      formattedSize: formatBytes(manifest.estimatedBackupSize)
    };
  } catch (error) {
    return {
      fileCount: 0,
      totalSize: 0,
      estimatedBackupSize: 0,
      formattedSize: '0 B',
      error: error.message
    };
  }
}

/**
 * Check if backup reminder should be shown
 */
async function shouldShowBackupReminder() {
  try {
    // Check if we have files to backup
    const stats = await getBackupStats();
    if (stats.fileCount < 10) {
      return { show: false, reason: 'insufficient_files' };
    }
    
    // Check last backup time (stored in identity file)
    const identityPath = path.join(process.cwd(), 'data', '.pocketcloud-identity');
    if (await fs.pathExists(identityPath)) {
      const identity = await fs.readJson(identityPath);
      
      if (!identity.lastBackup) {
        return { 
          show: true, 
          reason: 'never_backed_up',
          message: 'Backup recommended — protect against disk failure.'
        };
      }
      
      const lastBackup = new Date(identity.lastBackup);
      const daysSinceBackup = (Date.now() - lastBackup.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceBackup > 30) {
        return {
          show: true,
          reason: 'backup_old',
          message: `Last backup was ${Math.floor(daysSinceBackup)} days ago — consider creating a new one.`
        };
      }
    }
    
    return { show: false, reason: 'recent_backup' };
  } catch (error) {
    return { show: false, reason: 'error', error: error.message };
  }
}

/**
 * Record backup creation
 */
async function recordBackupCreated() {
  try {
    const identityPath = path.join(process.cwd(), 'data', '.pocketcloud-identity');
    let identity = {};
    
    if (await fs.pathExists(identityPath)) {
      identity = await fs.readJson(identityPath);
    }
    
    identity.lastBackup = new Date().toISOString();
    await fs.writeJson(identityPath, identity, { spaces: 2 });
    
    // Log security event
    console.log(`Security event: Backup created at ${identity.lastBackup}`);
  } catch (error) {
    console.warn('Failed to record backup creation:', error.message);
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
  createBackupStream,
  getBackupStats,
  shouldShowBackupReminder,
  recordBackupCreated,
  BACKUP_VERSION
};