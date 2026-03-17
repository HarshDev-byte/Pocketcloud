import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { EncryptionService } from '../services/encryption.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/encryption/params/new
 * Generate fresh encryption parameters for client-side encryption
 */
router.get('/params/new', requireAuth, (req: Request, res: Response) => {
  try {
    const params = EncryptionService.generateEncryptionParams();
    
    res.json({
      success: true,
      data: params
    });
    
    logger.info('Encryption parameters generated', { 
      userId: req.user!.id,
      saltLength: params.salt.length,
      ivLength: params.iv.length
    });
    
  } catch (error: any) {
    logger.error('Failed to generate encryption parameters', { 
      userId: req.user!.id,
      error: error.message 
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'ENCRYPTION_PARAMS_FAILED',
        message: 'Failed to generate encryption parameters'
      }
    });
  }
});

/**
 * POST /api/encryption/files/:id/mark-encrypted
 * Mark an uploaded file as encrypted
 */
router.post('/files/:id/mark-encrypted', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id: fileId } = req.params;
    const { salt, iv, hint } = req.body;
    
    // Validate required parameters
    if (!salt || !iv) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'Salt and IV are required'
        }
      });
    }
    
    await EncryptionService.markFileEncrypted(fileId, req.user!.id, salt, iv, hint);
    
    res.json({
      success: true,
      message: 'File marked as encrypted successfully'
    });
    
  } catch (error: any) {
    logger.error('Failed to mark file as encrypted', { 
      fileId: req.params.id,
      userId: req.user!.id,
      error: error.message 
    });
    
    if (error.name === 'NotFoundError') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'File not found'
        }
      });
    }
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMETERS',
          message: error.message
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'ENCRYPTION_FAILED',
        message: 'Failed to mark file as encrypted'
      }
    });
  }
});
/**
 * GET /api/encryption/files/:id/params
 * Get encryption parameters for file decryption
 */
router.get('/files/:id/params', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id: fileId } = req.params;
    
    const params = await EncryptionService.getEncryptionParams(fileId, req.user!.id);
    
    res.json({
      success: true,
      data: params
    });
    
  } catch (error: any) {
    logger.error('Failed to get file encryption parameters', { 
      fileId: req.params.id,
      userId: req.user!.id,
      error: error.message 
    });
    
    if (error.name === 'NotFoundError') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'File not found'
        }
      });
    }
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'FILE_NOT_ENCRYPTED',
          message: error.message
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'ENCRYPTION_PARAMS_FAILED',
        message: 'Failed to get encryption parameters'
      }
    });
  }
});

/**
 * POST /api/encryption/vaults
 * Create an encrypted vault folder
 */
router.post('/vaults', requireAuth, async (req: Request, res: Response) => {
  try {
    const { folderId, salt, hint } = req.body;
    
    // Validate required parameters
    if (!folderId || !salt) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'Folder ID and salt are required'
        }
      });
    }
    
    const result = await EncryptionService.createVault(req.user!.id, folderId, salt, hint);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error: any) {
    logger.error('Failed to create vault', { 
      folderId: req.body.folderId,
      userId: req.user!.id,
      error: error.message 
    });
    
    if (error.name === 'NotFoundError') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FOLDER_NOT_FOUND',
          message: 'Folder not found'
        }
      });
    }
    
    if (error.name === 'ConflictError') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'VAULT_EXISTS',
          message: error.message
        }
      });
    }
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMETERS',
          message: error.message
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'VAULT_CREATION_FAILED',
        message: 'Failed to create vault'
      }
    });
  }
});

/**
 * GET /api/encryption/vaults/:folderId/params
 * Get vault parameters for folder decryption
 */
router.get('/vaults/:folderId/params', requireAuth, async (req: Request, res: Response) => {
  try {
    const { folderId } = req.params;
    
    const params = await EncryptionService.getVaultParams(folderId, req.user!.id);
    
    res.json({
      success: true,
      data: params
    });
    
  } catch (error: any) {
    logger.error('Failed to get vault parameters', { 
      folderId: req.params.folderId,
      userId: req.user!.id,
      error: error.message 
    });
    
    if (error.name === 'NotFoundError') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'VAULT_NOT_FOUND',
          message: 'Vault not found for this folder'
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'VAULT_PARAMS_FAILED',
        message: 'Failed to get vault parameters'
      }
    });
  }
});

/**
 * GET /api/encryption/vaults
 * List all vaults owned by the user
 */
router.get('/vaults', requireAuth, async (req: Request, res: Response) => {
  try {
    const vaults = await EncryptionService.listUserVaults(req.user!.id);
    
    res.json({
      success: true,
      data: vaults
    });
    
  } catch (error: any) {
    logger.error('Failed to list user vaults', { 
      userId: req.user!.id,
      error: error.message 
    });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'VAULT_LIST_FAILED',
        message: 'Failed to list vaults'
      }
    });
  }
});

/**
 * GET /api/encryption/stats
 * Get encryption statistics for the user
 */
router.get('/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const stats = await EncryptionService.getEncryptionStats(req.user!.id);
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error: any) {
    logger.error('Failed to get encryption statistics', { 
      userId: req.user!.id,
      error: error.message 
    });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'ENCRYPTION_STATS_FAILED',
        message: 'Failed to get encryption statistics'
      }
    });
  }
});

export default router;