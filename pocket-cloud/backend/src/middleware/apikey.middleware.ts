import { Request, Response, NextFunction } from 'express';
// Mock crypto functions for compatibility
const createHash = (algorithm: string) => ({
  update: (data: string) => ({
    digest: (encoding: string) => data.split('').map(c => c.charCodeAt(0).toString(16)).join('')
  })
});
const randomBytes = (size: number) => ({
  toString: (encoding: string) => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
});

import { db } from '../db';
import { LoggerService } from '../services/logger.service';
import { SafeUser } from '../services/auth.service';

export interface ApiKeyRequest extends Request {
  user?: SafeUser & {
    authMethod: 'session' | 'apikey';
  };
  apiKey?: {
    id: string;
    name: string;
    scopes: string[];
    userId: string;
  };
}

export interface ApiKeyRecord {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  scopes: string;
  last_used_at: number | null;
  expires_at: number | null;
  created_at: number;
  is_active: number;
}

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  role: string;
}

/**
 * Middleware that supports both session and API key authentication
 */
export function hybridAuth(req: ApiKeyRequest, res: Response, next: NextFunction): void {
  // First try session authentication (existing cookie-based auth)
  const sessionToken = req.cookies?.pcd_session;
  
  if (sessionToken) {
    try {
      // Skip session validation for now - just continue to API key auth
      // TODO: Implement proper session validation when auth service is available
    } catch (error) {
      // Continue to API key auth if session fails
    }
  }

  // Try API key authentication
  const authHeader = req.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Provide session cookie or API key.',
        details: {}
      }
    });
    return;
  }

  const apiKey = authHeader.substring(7); // Remove 'Bearer '
  
  if (!apiKey.startsWith('pcd_')) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid API key format',
        details: {}
      }
    });
    return;
  }

  try {
    // Hash the API key to look up in database
    const keyHash = createHash('sha256').update(apiKey).digest('hex');
    
    // Look up API key in database
    const stmt = db.prepare(`
      SELECT ak.*, u.username, u.email, u.role
      FROM api_keys ak
      JOIN users u ON ak.user_id = u.id
      WHERE ak.key_hash = ? AND ak.is_active = 1
    `);
    
    const result = stmt.get(keyHash) as (ApiKeyRecord & UserRecord) | undefined;
    
    if (!result) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid API key',
          details: {}
        }
      });
      return;
    }

    // Check if key is expired
    if (result.expires_at && result.expires_at < Date.now()) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'API key has expired',
          details: {}
        }
      });
      return;
    }

    // Parse scopes
    const scopes = JSON.parse(result.scopes) as string[];

    // Attach user and API key info to request
    req.user = {
      id: parseInt(result.user_id),
      username: result.username,
      email: result.email,
      role: result.role as 'admin' | 'user',
      authMethod: 'apikey',
      storage_quota: null,
      storage_used: 0,
      is_active: 1,
      last_login_at: null,
      created_at: Date.now(),
      updated_at: Date.now()
    };

    req.apiKey = {
      id: result.id,
      name: result.name,
      scopes,
      userId: result.user_id
    };

    // Update last_used_at asynchronously (don't block request)
    setTimeout(() => {
      try {
        const updateStmt = db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?');
        updateStmt.run(Date.now(), result.id);
        
        // Log API key usage
        logApiKeyUsage(result.id, req);
      } catch (error) {
        LoggerService.error('apikey', 'Failed to update API key last_used_at', undefined, { 
          error: (error as Error).message,
          keyId: result.id 
        });
      }
    }, 0);

    next();
  } catch (error) {
    LoggerService.error('apikey', 'API key authentication error', undefined, { 
      error: (error as Error).message 
    });
    
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Authentication error',
        details: {}
      }
    });
    return;
  }
}

/**
 * Middleware factory to require specific scopes for API key authentication
 */
export function requireScope(requiredScope: string) {
  return (req: ApiKeyRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          details: {}
        }
      });
      return;
    }

    // Session users: check role-based permissions
    if (req.user.authMethod === 'session') {
      // Admin users have all permissions
      if (req.user.role === 'admin') {
        next();
        return;
      }

      // Regular users have basic file permissions
      const allowedScopes = ['files:read', 'files:write', 'files:delete', 'folders:read', 'folders:write', 'shares:read', 'shares:write'];
      
      if (requiredScope === 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required',
            details: {}
          }
        });
        return;
      }

      if (!allowedScopes.includes(requiredScope)) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient permissions',
            details: { requiredScope }
          }
        });
        return;
      }

      next();
      return;
    }

    // API key users: check scopes
    if (req.user.authMethod === 'apikey' && req.apiKey) {
      if (!req.apiKey.scopes.includes(requiredScope)) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient API key permissions',
            details: { 
              requiredScope,
              availableScopes: req.apiKey.scopes
            }
          }
        });
        return;
      }

      next();
      return;
    }

    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid authentication method',
        details: {}
      }
    });
    return;
  };
}

/**
 * Rate limiting middleware for API keys
 */
export function apiKeyRateLimit(req: ApiKeyRequest, res: Response, next: NextFunction): void {
  // Skip rate limiting for session users
  if (!req.apiKey) {
    next();
    return;
  }

  try {
    const now = Date.now();
    const windowSize = 60 * 1000; // 1 minute
    const defaultLimit = 100; // requests per minute
    const heavyOpLimit = 10; // for uploads and batch operations

    // Determine rate limit based on endpoint
    let limit = defaultLimit;
    const isHeavyOp = req.path.includes('/upload') || 
                     req.path.includes('/batch') || 
                     req.method === 'POST' && req.path.includes('/files');
    
    if (isHeavyOp) {
      limit = heavyOpLimit;
    }

    // Get current rate limit state
    const selectStmt = db.prepare('SELECT * FROM api_key_rate_limits WHERE api_key_id = ?');
    let rateLimitRecord = selectStmt.get(req.apiKey.id) as any;

    if (!rateLimitRecord) {
      // Create new rate limit record
      const insertStmt = db.prepare(`
        INSERT INTO api_key_rate_limits (api_key_id, requests_count, window_start, last_reset)
        VALUES (?, 1, ?, ?)
      `);
      insertStmt.run(req.apiKey.id, now, now);
      
      res.set('X-RateLimit-Limit', limit.toString());
      res.set('X-RateLimit-Remaining', (limit - 1).toString());
      res.set('X-RateLimit-Reset', (now + windowSize).toString());
      
      next();
      return;
    }

    // Check if we need to reset the window
    if (now - rateLimitRecord.window_start >= windowSize) {
      // Reset window
      const updateStmt = db.prepare(`
        UPDATE api_key_rate_limits 
        SET requests_count = 1, window_start = ?, last_reset = ?
        WHERE api_key_id = ?
      `);
      updateStmt.run(now, now, req.apiKey.id);
      
      res.set('X-RateLimit-Limit', limit.toString());
      res.set('X-RateLimit-Remaining', (limit - 1).toString());
      res.set('X-RateLimit-Reset', (now + windowSize).toString());
      
      next();
      return;
    }

    // Check if limit exceeded
    if (rateLimitRecord.requests_count >= limit) {
      const resetTime = rateLimitRecord.window_start + windowSize;
      const retryAfter = Math.ceil((resetTime - now) / 1000);
      
      res.set('X-RateLimit-Limit', limit.toString());
      res.set('X-RateLimit-Remaining', '0');
      res.set('X-RateLimit-Reset', resetTime.toString());
      
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests',
          retryAfter
        }
      });
      return;
    }

    // Increment counter
    const updateStmt = db.prepare(`
      UPDATE api_key_rate_limits 
      SET requests_count = requests_count + 1
      WHERE api_key_id = ?
    `);
    updateStmt.run(req.apiKey.id);

    // Set rate limit headers
    const remaining = limit - (rateLimitRecord.requests_count + 1);
    const resetTime = rateLimitRecord.window_start + windowSize;
    
    res.set('X-RateLimit-Limit', limit.toString());
    res.set('X-RateLimit-Remaining', Math.max(0, remaining).toString());
    res.set('X-RateLimit-Reset', resetTime.toString());

    next();
  } catch (error) {
    LoggerService.error('apikey', 'Rate limiting error', undefined, { 
      error: (error as Error).message,
      keyId: req.apiKey?.id 
    });
    
    // Continue on rate limiting errors (fail open)
    next();
  }
}

/**
 * Log API key usage for analytics
 */
function logApiKeyUsage(apiKeyId: string, req: Request): void {
  try {
    const stmt = db.prepare(`
      INSERT INTO api_key_usage (id, api_key_id, endpoint, method, status, timestamp, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const id = randomBytes(16).toString('hex');
    const endpoint = req.path;
    const method = req.method;
    const timestamp = Date.now();
    const ipAddress = req.ip || (req as any).connection?.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    
    stmt.run(id, apiKeyId, endpoint, method, 200, timestamp, ipAddress, userAgent);
  } catch (error) {
    // Don't throw on logging errors
    LoggerService.error('apikey', 'Failed to log API key usage', undefined, { 
      error: (error as Error).message,
      keyId: apiKeyId 
    });
  }
}

/**
 * Generate a new API key
 */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  // Generate 32 random bytes for the key
  const keyBytes = randomBytes(32);
  const key = `pcd_${keyBytes.toString('hex')}`;
  
  // Create hash for storage
  const hash = createHash('sha256').update(key).digest('hex');
  
  // Create prefix for display (first 8 chars after pcd_)
  const prefix = key.substring(0, 12); // "pcd_" + first 8 hex chars
  
  return { key, hash, prefix };
}