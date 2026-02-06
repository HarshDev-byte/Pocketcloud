const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { requireAuth } = require('../middleware/auth');
const { uploadLimiter, downloadLimiter } = require('../middleware/rateLimiter');
const { requireReady } = require('../middleware/readiness');
const { getUserStoragePath, getStorageStats, formatFileSize } = require('../config/storage');
const { getDatabase, saveDatabase } = require('../config/database');
const config = require('../config/config');
const { ensureInside, isAllowedFileType } = require('../utils/security');
const { encryptFile, decryptFile, encryptFileStream, decryptFileStream } = require('../services/cryptoService');
const { CryptoIntegrityError } = require('../services/cryptoErrors');
const { getUserStatus } = require('../services/healthService');
const { getIdentity, markSetupCompleted, updateHealthCheck, getTimeSinceHealthCheck } = require('../services/identityService');
const { getStorageInfo, canUpload } = require('../services/storageService');
const { shouldShowBackupReminder } = require('../services/backupService');
const { UploadFailureHandler, DownloadFailureHandler, SessionFailureHandler } = require('../services/failureDetection');
const { hasUploadedFiles, hasShownFirstSuccess, markFirstSuccessShown, hasBackupNudgeBeenDismissed, dismissBackupNudge } = require('../services/setupVerification');

// Sanitize filename for cross-platform safety
function safeFilename(originalName) {
  const ext = path.extname(originalName);
  const base = path.basename(originalName, ext)
    .replace(/[^a-zA-Z0-9-_]/g, '_');
  return `${Date.now()}-${base}${ext}.enc`; // .enc extension for encrypted files
}

// Configure multer for streaming uploads (no memory buffering)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userPath = getUserStoragePath(req.session.userId);
    cb(null, userPath);
  },
  filename: (req, file, cb) => {
    // Temporary filename - will be encrypted and renamed
    cb(null, `temp-${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: config.MAX_UPLOAD_SIZE },
  fileFilter: (req, file, cb) => {
    if (!isAllowedFileType(file.mimetype)) {
      return cb(new Error('File type not allowed. Allowed types: images, PDFs, documents, and archives.'));
    }
    cb(null, true);
  }
});

// Error handler for multer
function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: `File too large. Maximum size is ${(config.MAX_UPLOAD_SIZE / (1024 * 1024)).toFixed(0)}MB` 
      });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
}

// Dashboard - Main files view
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const db = getDatabase();
    const userPath = getUserStoragePath(req.session.userId);
    
    // Get real storage info from USB drive
    const storageInfo = await getStorageInfo();
    
    // Get all files for this user
    const result = db.exec('SELECT * FROM files WHERE user_id = ? ORDER BY uploaded_at DESC', [req.session.userId]);
    
    let files = [];
    if (result.length > 0 && result[0].values.length > 0) {
      files = result[0].values.map(row => ({
        id: row[0],
        user_id: row[1],
        filename: row[2],
        filepath: row[3],
        size: row[4],
        mimetype: row[5],
        uploaded_at: row[6],
        iv: row[7],
        auth_tag: row[8],
        encrypted: row[9],
        formattedSize: formatFileSize(row[4])
      }));
    }
    
    // Get recent files (last 5)
    const recentFiles = files.slice(0, 5);
    
    // Security status
    const encryptedFileCount = files.filter(f => f.encrypted === 1).length;
    const securityStatus = {
      encryptionEnabled: req.session.encryptionSalt ? true : false,
      encryptedFileCount: encryptedFileCount,
      totalFileCount: files.length
    };
    
    // System status
    const systemStatus = await getUserStatus();
    
    // System identity
    const identity = await getIdentity();
    
    // Update health check timestamp (passive, weekly)
    const lastCheck = new Date(identity.lastHealthCheck);
    const now = new Date();
    const daysSinceCheck = (now - lastCheck) / 86400000;
    if (daysSinceCheck >= 7) {
      await updateHealthCheck();
      identity.lastHealthCheck = now.toISOString();
    }
    
    // Show setup completion if first time after setup
    const showSetupComplete = !identity.setupCompleted && files.length === 0;
    
    // Check if backup reminder should be shown
    const backupReminder = await shouldShowBackupReminder();
    
    // Check if we should show first success screen
    const showFirstSuccess = files.length > 0 && !await hasShownFirstSuccess(req.session.userId);
    
    // Check if we should show backup nudge (soft, dismissible)
    const hasFiles = await hasUploadedFiles(req.session.userId);
    const backupNudgeDismissed = await hasBackupNudgeBeenDismissed(req.session.userId);
    const showBackupNudge = hasFiles && !identity.lastBackup && !backupNudgeDismissed;
    
    // Determine if user is in "day-1" mode (hide advanced features)
    const isDay1User = files.length === 0 || !await hasShownFirstSuccess(req.session.userId);
    
    res.render('dashboard', { 
      title: 'Dashboard',
      username: req.session.username,
      files,
      recentFiles,
      storageInfo,
      totalFiles: files.length,
      securityStatus,
      systemStatus,
      identity,
      showSetupComplete,
      backupReminder,
      showFirstSuccess,
      showBackupNudge,
      isDay1User,
      timeSinceHealthCheck: getTimeSinceHealthCheck(identity.lastHealthCheck)
    });
  } catch (error) {
    console.error('Dashboard error:', error.message);
    next(error);
  }
});

// Upload file with streaming encryption
router.post('/upload', requireAuth, requireReady, uploadLimiter, upload.single('file'), handleUploadError, async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  // Check if storage allows uploads
  const uploadCheck = await canUpload();
  if (!uploadCheck.allowed) {
    // Clean up temp file
    await fs.remove(req.file.path);
    return res.status(507).render('error', {
      message: `Upload blocked: ${uploadCheck.reason}`
    });
  }
  
  // Check if user has encryption enabled
  if (!req.session.password || !req.session.encryptionSalt) {
    // Clean up temp file
    await fs.remove(req.file.path);
    return res.status(500).json({ 
      error: 'Encryption not available. Please log out and log back in.' 
    });
  }
  
  const tempFilePath = req.file.path;
  let encryptedFilePath = null;
  
  try {
    const db = getDatabase();
    
    // Generate unique file ID BEFORE encryption (needed for key derivation)
    const fileIdResult = db.exec('SELECT MAX(id) as max_id FROM files');
    const nextFileId = (fileIdResult[0].values[0][0] || 0) + 1;
    const fileId = `${req.session.userId}-${nextFileId}`;
    
    console.log(`🔐 Encrypting file (streaming): ${req.file.originalname} (${formatFileSize(req.file.size)})`);
    
    // Generate safe filename for encrypted file
    const encryptedFilename = safeFilename(req.file.originalname);
    const userPath = getUserStoragePath(req.session.userId);
    encryptedFilePath = path.join(userPath, encryptedFilename);
    
    // Encrypt file using streaming (constant memory usage)
    const encryptionSalt = Buffer.from(req.session.encryptionSalt, 'hex');
    const inputStream = fs.createReadStream(tempFilePath);
    
    const { iv, authTag } = await encryptFileStream(
      inputStream,
      encryptedFilePath,
      req.session.password,
      encryptionSalt,
      fileId
    );
    
    // Delete temp file after successful encryption
    await fs.remove(tempFilePath);
    
    // Store metadata in database
    db.run(
      `INSERT INTO files (user_id, filename, filepath, size, mimetype, iv, auth_tag, encrypted) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.session.userId,
        req.file.originalname,
        encryptedFilename,
        req.file.size, // Store ORIGINAL size (before encryption)
        req.file.mimetype,
        iv,
        authTag,
        1 // encrypted = true
      ]
    );
    saveDatabase();
    
    console.log(`✓ File encrypted and uploaded (streaming): ${req.file.originalname} by ${req.session.username}`);
    res.redirect('/files');
  } catch (error) {
    console.error('Upload error:', error.message);
    
    // Use failure handler for proper cleanup and user messaging
    const fileId = req.body.fileId; // If we got far enough to create a DB entry
    await UploadFailureHandler.handleUploadFailure(tempFilePath, fileId, error);
    
    // Also clean encrypted file if it was created
    if (encryptedFilePath && await fs.pathExists(encryptedFilePath)) {
      try {
        await fs.remove(encryptedFilePath);
      } catch (cleanupError) {
        console.warn('Failed to remove encrypted file after upload failure:', cleanupError.message);
      }
    }
    
    // Get user-friendly error message
    const failureMessage = UploadFailureHandler.getUploadErrorMessage(error);
    
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({
        error: failureMessage.message,
        action: failureMessage.action,
        technical: failureMessage.technical
      });
    } else {
      return res.status(500).render('error', {
        message: failureMessage.message,
        action: failureMessage.action
      });
    }
  }
});

// Download file with streaming decryption
router.get('/download/:id', requireAuth, downloadLimiter, async (req, res, next) => {
  try {
    const db = getDatabase();
    const result = db.exec('SELECT * FROM files WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(404).send('File not found');
    }
    
    const file = {
      id: result[0].values[0][0],
      filename: result[0].values[0][2],
      filepath: result[0].values[0][3],
      size: result[0].values[0][4],
      mimetype: result[0].values[0][5],
      iv: result[0].values[0][7],
      authTag: result[0].values[0][8],
      encrypted: result[0].values[0][9]
    };
    
    const userPath = getUserStoragePath(req.session.userId);
    const filePath = path.join(userPath, file.filepath);
    
    // Path traversal protection
    ensureInside(userPath, filePath);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File not found on disk');
    }
    
    // If file is encrypted, decrypt it using streaming
    if (file.encrypted) {
      if (!req.session.password || !req.session.encryptionSalt) {
        return res.status(500).send('Decryption not available. Please log out and log back in.');
      }
      
      console.log(`🔓 Decrypting file (streaming): ${file.filename}`);
      
      // Set response headers BEFORE streaming starts
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');
      res.setHeader('Content-Length', file.size); // Original size (before encryption)
      
      // Stream decrypt directly to response (constant memory usage)
      const encryptionSalt = Buffer.from(req.session.encryptionSalt, 'hex');
      const fileId = `${req.session.userId}-${file.id}`;
      
      try {
        await decryptFileStream(
          filePath,
          res,
          req.session.password,
          encryptionSalt,
          fileId,
          file.iv,
          file.authTag
        );
        
        console.log(`✓ File decrypted and downloaded (streaming): ${file.filename}`);
      } catch (error) {
        // If stream already started, client will see incomplete download
        // This is acceptable - incomplete file is unusable anyway
        if (error.name === 'CryptoIntegrityError') {
          console.error(`✗ Integrity check failed: ${file.filename}`);
          // Response already started, can't send error page
          // Client will see network error
        } else {
          throw error;
        }
      }
    } else {
      // Legacy: Unencrypted file (for backward compatibility)
      res.download(filePath, file.filename);
    }
  } catch (error) {
    console.error('Download error:', error.message);
    
    // Use failure handler for proper error messaging
    await DownloadFailureHandler.handleDownloadFailure(filePath, error);
    const failureMessage = DownloadFailureHandler.getDownloadErrorMessage(error);
    
    if (!res.headersSent) {
      return res.status(500).render('error', {
        message: failureMessage.message,
        action: failureMessage.action
      });
    }
    // If headers already sent, client will see incomplete download
  }
});

// Dismiss setup completion screen
router.post('/dismiss-setup', requireAuth, async (req, res) => {
  await markSetupCompleted();
  res.redirect('/files');
});

// Mark first success as shown
router.post('/first-success-shown', requireAuth, async (req, res) => {
  await markFirstSuccessShown(req.session.userId);
  res.json({ success: true });
});

// Dismiss backup nudge
router.post('/dismiss-backup-nudge', requireAuth, async (req, res) => {
  await dismissBackupNudge(req.session.userId);
  res.json({ success: true });
});

// Delete file
router.post('/delete/:id', requireAuth, async (req, res, next) => {
  try {
    const db = getDatabase();
    const result = db.exec('SELECT * FROM files WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const file = {
      filename: result[0].values[0][2],
      filepath: result[0].values[0][3]
    };
    
    const userPath = getUserStoragePath(req.session.userId);
    const filePath = path.join(userPath, file.filepath);
    
    // Path traversal protection
    ensureInside(userPath, filePath);
    
    // Check if file exists on disk (filesystem = source of truth)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }
    
    // Delete encrypted file from disk FIRST
    await fs.remove(filePath);
    
    // Then delete from database (only if filesystem delete succeeded)
    db.run('DELETE FROM files WHERE id = ?', [req.params.id]);
    saveDatabase();
    
    console.log(`✓ Encrypted file deleted: ${file.filename} by ${req.session.username}`);
    res.redirect('/files');
  } catch (error) {
    console.error('Delete error:', error.message);
    next(error);
  }
});

module.exports = router;
