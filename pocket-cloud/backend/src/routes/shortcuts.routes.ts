import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.middleware.js';
import { uploadService } from '../services/upload.service.js';
import { ShareService } from '../services/share.service.js';
import { fileService } from '../services/file.service.js';

// Import fs using require to avoid TypeScript module resolution issues
const fs = eval('require')('fs');

const router = Router();
const upload = multer({ dest: 'uploads/temp/' });

// iOS Shortcuts x-callback-url endpoints

// Upload file from iOS Shortcuts
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No file provided',
        'x-callback-url': req.query['x-error'] 
      });
    }

    const { originalname, path: tempPath, mimetype, size } = req.file;
    const userId = req.user!.id;
    
    // Initialize upload session
    const uploadSession = await uploadService.initUpload(userId, {
      filename: originalname,
      size,
      mimeType: mimetype,
      folderId: undefined,
      checksum: 'temp-checksum' // Will be updated during completion
    });

    // Save the file data as a single chunk
    const fileBuffer = fs.readFileSync(tempPath);
    await uploadService.saveChunk(uploadSession.uploadId, 0, fileBuffer);
    
    // Complete the upload
    const fileRecord = await uploadService.completeUpload(uploadSession.uploadId);

    // Create share link for Shortcuts
    const shareResult = ShareService.createShare(userId.toString(), {
      fileId: fileRecord.id.toString(),
      expiresIn: 168, // 7 days in hours
      password: undefined
    });

    if (!shareResult.success) {
      return res.status(500).json({ error: 'Failed to create share link' });
    }

    const shareUrl = shareResult.shareUrl!;

    // Return x-callback-url response for iOS Shortcuts
    const successCallback = req.query['x-success'] as string;
    if (successCallback) {
      const callbackUrl = new URL(successCallback);
      callbackUrl.searchParams.set('shareUrl', shareUrl);
      callbackUrl.searchParams.set('filename', originalname);
      
      return res.redirect(callbackUrl.toString());
    }

    res.json({
      success: true,
      file: {
        id: fileRecord.id,
        filename: originalname,
        size,
        shareUrl
      },
      shareUrl
    });

  } catch (error) {
    console.error('Shortcuts upload error:', error);
    
    const errorCallback = req.query['x-error'] as string;
    if (errorCallback) {
      const callbackUrl = new URL(errorCallback);
      callbackUrl.searchParams.set('error', 'Upload failed');
      return res.redirect(callbackUrl.toString());
    }

    res.status(500).json({ error: 'Upload failed' });
  }
});

// Get latest uploaded file
router.get('/latest', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    // Get most recent file for user by listing root folder and sorting
    const folderContents = await fileService.listFolder(userId);
    
    if (!folderContents.files || folderContents.files.length === 0) {
      return res.status(404).json({ error: 'No files found' });
    }

    // Sort files by creation date (most recent first)
    const sortedFiles = folderContents.files.sort((a: any, b: any) => b.created_at - a.created_at);
    const latestFile = sortedFiles[0];
    
    const fileUrl = `${req.protocol}://${req.get('host')}/api/files/download/${latestFile.id}`;

    // x-callback-url response
    const successCallback = req.query['x-success'] as string;
    if (successCallback) {
      const callbackUrl = new URL(successCallback);
      callbackUrl.searchParams.set('fileUrl', fileUrl);
      callbackUrl.searchParams.set('filename', latestFile.name);
      
      return res.redirect(callbackUrl.toString());
    }

    res.json({
      file: {
        id: latestFile.id,
        filename: latestFile.name,
        size: latestFile.size,
        uploadedAt: latestFile.created_at,
        url: fileUrl
      }
    });

  } catch (error) {
    console.error('Get latest file error:', error);
    res.status(500).json({ error: 'Failed to get latest file' });
  }
});

// Create share link for file
router.get('/share/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user!.id;

    // Verify file ownership using fileService
    const file = await fileService.getFile(parseInt(fileId), userId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Create share link
    const shareResult = ShareService.createShare(userId.toString(), {
      fileId: fileId,
      expiresIn: 168, // 7 days in hours
      password: undefined
    });

    if (!shareResult.success) {
      return res.status(500).json({ error: 'Failed to create share link' });
    }

    const shareUrl = shareResult.shareUrl!;

    // x-callback-url response
    const successCallback = req.query['x-success'] as string;
    if (successCallback) {
      const callbackUrl = new URL(successCallback);
      callbackUrl.searchParams.set('shareUrl', shareUrl);
      callbackUrl.searchParams.set('filename', file.name);
      
      return res.redirect(callbackUrl.toString());
    }

    res.json({
      shareUrl,
      file: {
        id: file.id,
        filename: file.name
      }
    });

  } catch (error) {
    console.error('Create share link error:', error);
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

export { router as shortcutsRoutes };