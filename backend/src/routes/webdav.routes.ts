import { Router, Request, Response } from 'express';
import { WebDAVService } from '../services/webdav.service';
import { createActivityLogger } from '../middleware/activity.middleware';
import { Actions } from '../services/activity.service';
import { logger } from '../utils/logger';

const router = Router();

// WebDAV authentication middleware
const webdavAuth = async (req: Request, res: Response, next: Function) => {
  try {
    const user = await WebDAVService.authenticateRequest(req);
    
    if (!user) {
      res.setHeader('WWW-Authenticate', 'Basic realm="PocketCloud Drive"');
      res.status(401).end();
      return;
    }

    // Attach user to request
    (req as any).webdavUser = user;
    next();
  } catch (error: any) {
    logger.error('WebDAV authentication error', { error: error.message });
    res.status(500).end();
  }
};

// Add WebDAV headers to all responses
router.use((req: Request, res: Response, next: Function) => {
  // CORS headers for WebDAV
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, HEAD, POST, PUT, DELETE, TRACE, COPY, MOVE, MKCOL, PROPFIND, PROPPATCH, LOCK, UNLOCK');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Depth, User-Agent, X-File-Size, X-Requested-With, If-Modified-Since, X-File-Name, Cache-Control, Authorization, Destination, Lock-Token, Timeout');
  res.setHeader('Access-Control-Expose-Headers', 'DAV, content-length, Allow');
  
  // WebDAV compliance headers
  res.setHeader('DAV', '1, 2');
  res.setHeader('MS-Author-Via', 'DAV');
  
  next();
});

// OPTIONS - WebDAV capability discovery
router.options('*', (req: Request, res: Response) => {
  WebDAVService.handleOptions(req, res);
});

// PROPFIND - List directory contents / get file properties
router.all('*', (req: Request, res: Response, next: Function) => {
  if (req.method === 'PROPFIND') {
    return webdavAuth(req, res, () => {
      const user = (req as any).webdavUser;
      WebDAVService.handlePropfind(req, res, user);
    });
  }
  next();
});

// GET - Download files
router.get('*', 
  webdavAuth,
  createActivityLogger(Actions.FILE_DOWNLOAD, (req) => ({
    resourceType: 'file',
    resourceName: decodeURIComponent(req.path.replace('/webdav', '') || '/'),
    details: {
      protocol: 'webdav',
      userAgent: req.get('User-Agent')
    }
  })),
  (req: Request, res: Response) => {
    const user = (req as any).webdavUser;
    WebDAVService.handleGet(req, res, user);
  }
);

// HEAD - Get file metadata (same as GET but no body)
router.head('*', webdavAuth, (req: Request, res: Response) => {
  const user = (req as any).webdavUser;
  // For HEAD requests, we can use GET handler but Express won't send body
  WebDAVService.handleGet(req, res, user);
});

// PUT - Upload files
router.all('*', (req: Request, res: Response, next: Function) => {
  if (req.method === 'PUT') {
    return webdavAuth(req, res, () => {
      const user = (req as any).webdavUser;
      
      // Skip activity logging for .DS_Store and other Mac metadata
      const filename = decodeURIComponent(req.path.replace('/webdav', '') || '/');
      if (filename.includes('.DS_Store') || filename.includes('/._')) {
        return WebDAVService.handlePut(req, res, user);
      }

      // Log upload activity
      const activityLogger = createActivityLogger(Actions.FILE_UPLOAD, (req) => ({
        resourceType: 'file',
        resourceName: filename,
        details: {
          protocol: 'webdav',
          size: parseInt(req.headers['content-length'] || '0'),
          userAgent: req.get('User-Agent')
        }
      }));

      activityLogger(req, res, () => {
        WebDAVService.handlePut(req, res, user);
      });
    });
  }
  next();
});

// DELETE - Delete files/folders
router.all('*', (req: Request, res: Response, next: Function) => {
  if (req.method === 'DELETE') {
    return webdavAuth(req, res, () => {
      const user = (req as any).webdavUser;
      
      const activityLogger = createActivityLogger(Actions.FILE_DELETE, (req) => ({
        resourceType: 'file',
        resourceName: decodeURIComponent(req.path.replace('/webdav', '') || '/'),
        details: {
          protocol: 'webdav',
          userAgent: req.get('User-Agent')
        }
      }));

      activityLogger(req, res, () => {
        WebDAVService.handleDelete(req, res, user);
      });
    });
  }
  next();
});

// MKCOL - Create directories
router.all('*', (req: Request, res: Response, next: Function) => {
  if (req.method === 'MKCOL') {
    return webdavAuth(req, res, () => {
      const user = (req as any).webdavUser;
      
      const activityLogger = createActivityLogger(Actions.FOLDER_CREATE, (req) => ({
        resourceType: 'folder',
        resourceName: decodeURIComponent(req.path.replace('/webdav', '') || '/'),
        details: {
          protocol: 'webdav',
          userAgent: req.get('User-Agent')
        }
      }));

      activityLogger(req, res, () => {
        WebDAVService.handleMkcol(req, res, user);
      });
    });
  }
  next();
});

// MOVE - Move/rename files and folders
router.all('*', (req: Request, res: Response, next: Function) => {
  if (req.method === 'MOVE') {
    return webdavAuth(req, res, () => {
      const user = (req as any).webdavUser;
      
      const activityLogger = createActivityLogger(Actions.FILE_MOVE, (req) => ({
        resourceType: 'file',
        resourceName: decodeURIComponent(req.path.replace('/webdav', '') || '/'),
        details: {
          protocol: 'webdav',
          destination: req.headers.destination,
          userAgent: req.get('User-Agent')
        }
      }));

      activityLogger(req, res, () => {
        WebDAVService.handleMove(req, res, user);
      });
    });
  }
  next();
});

// COPY - Copy files (not implemented, return 501)
router.all('*', (req: Request, res: Response, next: Function) => {
  if (req.method === 'COPY') {
    res.status(501).end(); // Not Implemented
    return;
  }
  next();
});

// LOCK - Lock files (basic implementation for Windows compatibility)
router.all('*', (req: Request, res: Response, next: Function) => {
  if (req.method === 'LOCK') {
    return webdavAuth(req, res, () => {
      WebDAVService.handleLock(req, res);
    });
  }
  next();
});

// UNLOCK - Unlock files
router.all('*', (req: Request, res: Response, next: Function) => {
  if (req.method === 'UNLOCK') {
    return webdavAuth(req, res, () => {
      WebDAVService.handleUnlock(req, res);
    });
  }
  next();
});

// PROPPATCH - Modify properties (not implemented)
router.all('*', (req: Request, res: Response, next: Function) => {
  if (req.method === 'PROPPATCH') {
    res.status(501).end(); // Not Implemented
    return;
  }
  next();
});

// Catch any unhandled methods
router.all('*', (req: Request, res: Response) => {
  logger.warn('Unhandled WebDAV method', { method: req.method, path: req.path });
  res.status(405).end(); // Method Not Allowed
});

export default router;