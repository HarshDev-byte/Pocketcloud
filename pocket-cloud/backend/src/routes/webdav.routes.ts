import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { WebDAVService } from '../services/webdav.service.js';
import { parseIfHeader } from '../utils/webdav.xml.js';

// Import db and Buffer using eval to avoid TypeScript module resolution issues
const db = eval('require')('../db/index.js');
const Buffer = eval('require')('buffer').Buffer;

const router = Router();
const webdavService = new WebDAVService();

/**
 * WebDAV Routes for Network Drive Mounting
 * 
 * Implements RFC 4918 WebDAV protocol for mounting PocketCloud
 * as a network drive on any operating system
 */

// WebDAV Basic Authentication Middleware
async function webdavAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="PocketCloud WebDAV"');
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    if (!username || !password) {
      res.status(401).json({ error: 'Invalid credentials format' });
      return;
    }

    // Look up user in database
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
    
    if (!user) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    // Attach user info to request
    (req as any).user = {
      id: user.id,
      username: user.username,
      role: user.role
    };

    next();
  } catch (error: any) {
    console.error('WebDAV auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
    return;
  }
}

// Rate limiting for failed authentication attempts
const authAttempts = new Map<string, { count: number, resetTime: number }>();

function checkAuthRateLimit(req: Request, res: Response, next: NextFunction): void {
  const clientIP = req.ip || (req as any).connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const attempts = authAttempts.get(clientIP);
  
  if (attempts) {
    if (now > attempts.resetTime) {
      // Reset counter after 1 minute
      authAttempts.delete(clientIP);
    } else if (attempts.count >= 10) {
      res.status(429).json({ error: 'Too many authentication attempts' });
      return;
    }
  }
  
  next();
}

// Track failed authentication attempts
function trackFailedAuth(req: Request) {
  const clientIP = req.ip || (req as any).connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const attempts = authAttempts.get(clientIP) || { count: 0, resetTime: now + 60000 };
  
  attempts.count++;
  authAttempts.set(clientIP, attempts);
}

// WebDAV OPTIONS - Advertise supported methods and capabilities
router.options('/*', (_req: Request, res: Response) => {
  const headers = webdavService.handleOptions();
  
  Object.entries(headers).forEach(([key, value]) => {
    res.set(key, value);
  });
  
  res.status(200).send();
});

// Handle macOS Finder metadata requests
router.all('/.well-known/caldav', (_req: Request, res: Response) => {
  res.status(404).send();
});

router.all('/_DAV_NOT_FOUND_*', (_req: Request, res: Response) => {
  res.status(404).send();
});

// WebDAV PROPFIND - List directory contents or file properties
(router as any).propfind('/*', checkAuthRateLimit, webdavAuth, async (req: Request, res: Response) => {
  try {
    const requestPath = decodeURIComponent(req.path.replace('/webdav', ''));
    const depth = req.get('depth') || 'infinity';
    const user = (req as any).user;
    
    console.log(`WebDAV PROPFIND: ${requestPath} (depth: ${depth}) by ${user.username}`);
    
    const xml = await webdavService.handlePropfind(
      requestPath, 
      depth, 
      user.id, 
      user.role === 'admin'
    );
    
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('DAV', '1, 2');
    res.status(207).send(xml);
    
  } catch (error: any) {
    console.error('PROPFIND error:', error);
    if (error.message.includes('Not Found')) {
      res.status(404).send();
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// WebDAV GET - Download file or browse directory
router.get('/*', checkAuthRateLimit, webdavAuth, async (req: Request, res: Response) => {
  try {
    const requestPath = decodeURIComponent(req.path.replace('/webdav', ''));
    const user = (req as any).user;
    
    console.log(`WebDAV GET: ${requestPath} by ${user.username}`);
    
    const result = await webdavService.handleGet(
      requestPath, 
      user.id, 
      user.role === 'admin'
    );
    
    if (result.html) {
      // Directory listing
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.send(result.html);
    } else if (result.stream && result.stats) {
      // File download
      res.set('Content-Length', result.stats.size.toString());
      res.set('Content-Type', result.stats.contentType);
      res.set('ETag', result.stats.etag);
      res.set('Last-Modified', result.stats.lastModified.toUTCString());
      res.set('Accept-Ranges', 'bytes');
      
      result.stream.pipe(res);
      
      result.stream.on('error', (error: any) => {
        console.error('File stream error:', error);
        if (!res.headersSent) {
          res.status(500).send();
        }
      });
    }
    
  } catch (error: any) {
    console.error('GET error:', error);
    if (error.message.includes('Not Found')) {
      res.status(404).send();
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// WebDAV PUT - Upload file
router.put('/*', checkAuthRateLimit, webdavAuth, async (req: Request, res: Response) => {
  try {
    const requestPath = decodeURIComponent(req.path.replace('/webdav', ''));
    const user = (req as any).user;
    
    // Handle If header for conditional requests (Windows WebDAV client)
    let lockToken: string | undefined;
    if (req.get('if')) {
      const { tokens } = parseIfHeader(req.get('if') as string);
      lockToken = tokens[0];
    }
    
    console.log(`WebDAV PUT: ${requestPath} by ${user.username}`);
    
    await webdavService.handlePut(
      requestPath,
      req,
      user.id,
      user.role === 'admin',
      lockToken
    );
    
    res.status(201).send();
    
  } catch (error: any) {
    console.error('PUT error:', error);
    if (error.message.includes('Forbidden')) {
      res.status(403).send();
    } else if (error.message.includes('Locked')) {
      res.status(423).send();
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// WebDAV DELETE - Delete file or directory
router.delete('/*', checkAuthRateLimit, webdavAuth, async (req: Request, res: Response) => {
  try {
    const requestPath = decodeURIComponent(req.path.replace('/webdav', ''));
    const user = (req as any).user;
    
    // Handle If header for lock tokens
    let lockToken: string | undefined;
    if (req.get('if')) {
      const { tokens } = parseIfHeader(req.get('if') as string);
      lockToken = tokens[0];
    }
    
    console.log(`WebDAV DELETE: ${requestPath} by ${user.username}`);
    
    await webdavService.handleDelete(
      requestPath,
      user.id,
      user.role === 'admin',
      lockToken
    );
    
    res.status(204).send();
    
  } catch (error: any) {
    console.error('DELETE error:', error);
    if (error.message.includes('Not Found')) {
      res.status(404).send();
    } else if (error.message.includes('Locked')) {
      res.status(423).send();
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// WebDAV MKCOL - Create directory
(router as any).mkcol('/*', checkAuthRateLimit, webdavAuth, async (req: Request, res: Response) => {
  try {
    const requestPath = decodeURIComponent(req.path.replace('/webdav', ''));
    const user = (req as any).user;
    
    console.log(`WebDAV MKCOL: ${requestPath} by ${user.username}`);
    
    await webdavService.handleMkcol(
      requestPath,
      user.id,
      user.role === 'admin'
    );
    
    res.status(201).send();
    
  } catch (error: any) {
    console.error('MKCOL error:', error);
    res.status(500).json({ error: error.message });
  }
});

// WebDAV COPY - Copy file or directory
(router as any).copy('/*', checkAuthRateLimit, webdavAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const sourcePath = decodeURIComponent(req.path.replace('/webdav', ''));
    const destination = req.get('destination');
    const user = (req as any).user;
    
    if (!destination) {
      res.status(400).json({ error: 'Destination header required' });
      return;
    }
    
    const destPath = decodeURIComponent(destination.replace(/^.*\/webdav/, ''));
    const overwrite = req.get('overwrite') !== 'F';
    
    console.log(`WebDAV COPY: ${sourcePath} → ${destPath} by ${user.username}`);
    
    await webdavService.handleCopy(
      sourcePath,
      destPath,
      user.id,
      user.role === 'admin',
      overwrite
    );
    
    res.status(201).send();
    
  } catch (error: any) {
    console.error('COPY error:', error);
    if (error.message.includes('Not Found')) {
      res.status(404).send();
    } else if (error.message.includes('Exists')) {
      res.status(412).send(); // Precondition Failed
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// WebDAV MOVE - Move/rename file or directory
(router as any).move('/*', checkAuthRateLimit, webdavAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const sourcePath = decodeURIComponent(req.path.replace('/webdav', ''));
    const destination = req.get('destination');
    const user = (req as any).user;
    
    if (!destination) {
      res.status(400).json({ error: 'Destination header required' });
      return;
    }
    
    const destPath = decodeURIComponent(destination.replace(/^.*\/webdav/, ''));
    const overwrite = req.get('overwrite') !== 'F';
    
    console.log(`WebDAV MOVE: ${sourcePath} → ${destPath} by ${user.username}`);
    
    await webdavService.handleMove(
      sourcePath,
      destPath,
      user.id,
      user.role === 'admin',
      overwrite
    );
    
    res.status(201).send();
    
  } catch (error: any) {
    console.error('MOVE error:', error);
    if (error.message.includes('Not Found')) {
      res.status(404).send();
    } else if (error.message.includes('Exists')) {
      res.status(412).send(); // Precondition Failed
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// WebDAV LOCK - Lock resource (required for Windows WebDAV client)
(router as any).lock('/*', checkAuthRateLimit, webdavAuth, async (req: Request, res: Response) => {
  try {
    const requestPath = decodeURIComponent(req.path.replace('/webdav', ''));
    const user = (req as any).user;
    
    // Parse timeout from headers
    let timeout = 1800; // 30 minutes default
    if (req.get('timeout')) {
      const timeoutHeader = req.get('timeout') as string;
      const match = timeoutHeader.match(/Second-(\d+)/);
      if (match) {
        timeout = parseInt(match[1]);
      }
    }
    
    console.log(`WebDAV LOCK: ${requestPath} by ${user.username}`);
    
    // Read lock XML from request body
    let lockXml = '';
    (req as any).on('data', (chunk: any) => {
      lockXml += chunk.toString();
    });
    
    (req as any).on('end', () => {
      try {
        const { lockInfo, xml } = webdavService.handleLock(requestPath, lockXml, timeout);
        
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.set('Lock-Token', `<${lockInfo.token}>`);
        res.status(200).send(xml);
        
      } catch (error: any) {
        console.error('LOCK processing error:', error);
        res.status(500).json({ error: error.message });
      }
    });
    
  } catch (error: any) {
    console.error('LOCK error:', error);
    res.status(500).json({ error: error.message });
  }
});

// WebDAV UNLOCK - Unlock resource
(router as any).unlock('/*', checkAuthRateLimit, webdavAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const requestPath = decodeURIComponent(req.path.replace('/webdav', ''));
    const lockToken = req.get('lock-token');
    const user = (req as any).user;
    
    if (!lockToken) {
      res.status(400).json({ error: 'Lock-Token header required' });
      return;
    }
    
    // Remove angle brackets from token
    const cleanToken = lockToken.replace(/[<>]/g, '');
    
    console.log(`WebDAV UNLOCK: ${requestPath} by ${user.username}`);
    
    const success = webdavService.handleUnlock(requestPath, cleanToken);
    
    if (success) {
      res.status(204).send();
    } else {
      res.status(409).json({ error: 'Unlock failed' });
    }
    
  } catch (error: any) {
    console.error('UNLOCK error:', error);
    if (error.message.includes('Invalid Lock Token')) {
      res.status(409).send();
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// WebDAV PROPPATCH - Update properties (needed for macOS)
(router as any).proppatch('/*', checkAuthRateLimit, webdavAuth, async (req: Request, res: Response) => {
  try {
    const requestPath = decodeURIComponent(req.path.replace('/webdav', ''));
    const user = (req as any).user;
    
    console.log(`WebDAV PROPPATCH: ${requestPath} by ${user.username}`);
    
    // Read PROPPATCH XML from request body
    let proppatchXml = '';
    (req as any).on('data', (chunk: any) => {
      proppatchXml += chunk.toString();
    });
    
    (req as any).on('end', () => {
      try {
        const xml = webdavService.handleProppatch(requestPath, proppatchXml);
        
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.status(207).send(xml);
        
      } catch (error: any) {
        console.error('PROPPATCH processing error:', error);
        res.status(500).json({ error: error.message });
      }
    });
    
  } catch (error: any) {
    console.error('PROPPATCH error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Handle authentication failures
router.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.status === 401) {
    trackFailedAuth(req);
  }
  next(err);
});

export default router;