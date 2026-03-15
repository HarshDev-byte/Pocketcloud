import { Router } from 'express';
import { hybridAuth, apiKeyRateLimit } from '../../../middleware/apikey.middleware';
import filesRoutes from './files.routes';
import foldersRoutes from './folders.routes';
import uploadRoutes from './upload.routes';
import searchRoutes from './search.routes';
import sharesRoutes from './shares.routes';
import userRoutes from './user.routes';
import storageRoutes from './storage.routes';

const router = Router();

// Apply authentication and rate limiting to all v1 API routes
router.use(hybridAuth);
router.use(apiKeyRateLimit);

// Mount route modules
router.use('/files', filesRoutes);
router.use('/folders', foldersRoutes);
router.use('/upload', uploadRoutes);
router.use('/search', searchRoutes);
router.use('/shares', sharesRoutes);
router.use('/user', userRoutes);
router.use('/storage', storageRoutes);

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'Pocket Cloud Drive API',
      version: '1.0',
      description: 'REST API for Pocket Cloud Drive',
      documentation: '/api/v1/docs',
      endpoints: [
        '/api/v1/files',
        '/api/v1/folders', 
        '/api/v1/upload',
        '/api/v1/search',
        '/api/v1/shares',
        '/api/v1/user',
        '/api/v1/storage'
      ]
    },
    meta: {
      requestId: require('crypto').randomBytes(8).toString('hex'),
      timestamp: Date.now(),
      version: '1.0'
    }
  });
});

export default router;