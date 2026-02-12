const path = require('path');
const fs = require('fs-extra');
const config = require('./config');

// Storage configuration - use centralized config
const STORAGE_BASE = config.STORAGE_ROOT;

// Note: Storage directory creation is deferred until first use
// This prevents errors during module import when USB is not mounted

function getUserStoragePath(userId) {
  // Ensure storage base exists when first accessed
  if (!fs.existsSync(STORAGE_BASE)) {
    fs.ensureDirSync(STORAGE_BASE);
  }
  
  const userPath = path.join(STORAGE_BASE, `user_${userId}`);
  fs.ensureDirSync(userPath);
  return userPath;
}

function getStorageStats(userPath) {
  let totalSize = 0;
  let fileCount = 0;
  
  function calculateSize(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        calculateSize(filePath);
      } else {
        totalSize += stats.size;
        fileCount++;
      }
    });
  }
  
  calculateSize(userPath);
  
  return {
    used: totalSize,
    usedMB: (totalSize / (1024 * 1024)).toFixed(2),
    usedGB: (totalSize / (1024 * 1024 * 1024)).toFixed(2),
    fileCount
  };
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

module.exports = {
  STORAGE_BASE,
  getUserStoragePath,
  getStorageStats,
  formatFileSize
};
