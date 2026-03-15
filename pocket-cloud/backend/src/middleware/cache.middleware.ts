import { Request, Response, NextFunction } from 'express';
import { LRUCache } from 'lru-cache';

// Cache configurations optimized for Pi 4B memory constraints
const folderCache = new LRUCache<string, any>({
  max: 100,
  ttl: 10 * 1000, // 10 seconds
  updateAgeOnGet: true,
  allowStale: false
});

const fileMetadataCache = new LRUCache<string, any>({
  max: 500,
  ttl: 30 * 1000, // 30 seconds
  updateAgeOnGet: true,
  allowStale: false
});

const storageStatsCache = new LRUCache<string, any>({
  max: 1,
  ttl: 60 * 1000, // 60 seconds
  updateAgeOnGet: true,
  allowStale: false
});

/**
 * Cache middleware for folder listings
 */
export const cacheFolderListing = (req: Request, res: Response, next: NextFunction): void => {
  const userId = req.user?.id;
  const folderId = req.params.id || 'root';
  const cacheKey = `folder:${userId}:${folderId}`;
  
  // Try to get from cache
  const cached = folderCache.get(cacheKey);
  if (cached) {
    res.set('X-Cache', 'HIT');
    res.set('Cache-Control', 'no-store'); // Sensitive data
    return res.json(cached);
  }
  
  // Store original json method
  const originalJson = res.json;
  
  // Override json method to cache response
  res.json = function(data: any) {
    if (res.statusCode === 200) {
      folderCache.set(cacheKey, data);
    }
    res.set('X-Cache', 'MISS');
    res.set('Cache-Control', 'no-store');
    return originalJson.call(this, data);
  };
  
  next();
};

/**
 * Cache middleware for file metadata
 */
export const cacheFileMetadata = (req: Request, res: Response, next: NextFunction): void => {
  const userId = req.user?.id;
  const fileId = req.params.id;
  const cacheKey = `file:${userId}:${fileId}`;
  
  // Try to get from cache
  const cached = fileMetadataCache.get(cacheKey);
  if (cached) {
    res.set('X-Cache', 'HIT');
    res.set('Cache-Control', 'no-store');
    return res.json(cached);
  }
  
  // Store original json method
  const originalJson = res.json;
  
  // Override json method to cache response
  res.json = function(data: any) {
    if (res.statusCode === 200) {
      fileMetadataCache.set(cacheKey, data);
    }
    res.set('X-Cache', 'MISS');
    res.set('Cache-Control', 'no-store');
    return originalJson.call(this, data);
  };
  
  next();
};

/**
 * Cache middleware for storage statistics
 */
export const cacheStorageStats = (req: Request, res: Response, next: NextFunction): void => {
  const userId = req.user?.id;
  const cacheKey = `stats:${userId}`;
  
  // Try to get from cache
  const cached = storageStatsCache.get(cacheKey);
  if (cached) {
    res.set('X-Cache', 'HIT');
    res.set('Cache-Control', 'no-store');
    return res.json(cached);
  }
  
  // Store original json method
  const originalJson = res.json;
  
  // Override json method to cache response
  res.json = function(data: any) {
    if (res.statusCode === 200) {
      storageStatsCache.set(cacheKey, data);
    }
    res.set('X-Cache', 'MISS');
    res.set('Cache-Control', 'no-store');
    return originalJson.call(this, data);
  };
  
  next();
};

/**
 * Static asset cache headers
 */
export const cacheStaticAssets = (req: Request, res: Response, next: NextFunction): void => {
  // Cache static assets for 1 year
  if (req.url.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  }
  next();
};

/**
 * Cache invalidation utilities
 */
export class CacheInvalidator {
  
  /**
   * Invalidate folder cache when contents change
   */
  public static invalidateFolderCache(userId: string, folderId?: string): void {
    if (folderId) {
      // Invalidate specific folder
      folderCache.delete(`folder:${userId}:${folderId}`);
      
      // Also invalidate parent folder (for file counts)
      const parentKey = `folder:${userId}:root`;
      folderCache.delete(parentKey);
    } else {
      // Invalidate all folders for user
      for (const key of folderCache.keys()) {
        if (key.startsWith(`folder:${userId}:`)) {
          folderCache.delete(key);
        }
      }
    }
  }
  
  /**
   * Invalidate file metadata cache
   */
  public static invalidateFileCache(userId: string, fileId?: string): void {
    if (fileId) {
      fileMetadataCache.delete(`file:${userId}:${fileId}`);
    } else {
      // Invalidate all files for user
      for (const key of fileMetadataCache.keys()) {
        if (key.startsWith(`file:${userId}:`)) {
          fileMetadataCache.delete(key);
        }
      }
    }
  }
  
  /**
   * Invalidate storage stats cache
   */
  public static invalidateStorageStats(userId: string): void {
    storageStatsCache.delete(`stats:${userId}`);
  }
  
  /**
   * Invalidate all caches for user (on major operations)
   */
  public static invalidateAllUserCaches(userId: string): void {
    this.invalidateFolderCache(userId);
    this.invalidateFileCache(userId);
    this.invalidateStorageStats(userId);
  }
  
  /**
   * Get cache statistics for monitoring
   */
  public static getCacheStats(): {
    folders: { size: number; max: number; hits: number; misses: number };
    files: { size: number; max: number; hits: number; misses: number };
    storage: { size: number; max: number; hits: number; misses: number };
  } {
    return {
      folders: {
        size: folderCache.size,
        max: folderCache.max,
        hits: folderCache.calculatedSize,
        misses: 0 // LRU cache doesn't track misses directly
      },
      files: {
        size: fileMetadataCache.size,
        max: fileMetadataCache.max,
        hits: fileMetadataCache.calculatedSize,
        misses: 0
      },
      storage: {
        size: storageStatsCache.size,
        max: storageStatsCache.max,
        hits: storageStatsCache.calculatedSize,
        misses: 0
      }
    };
  }
  
  /**
   * Clear all caches (for maintenance)
   */
  public static clearAllCaches(): void {
    folderCache.clear();
    fileMetadataCache.clear();
    storageStatsCache.clear();
  }
}

/**
 * Middleware to add cache invalidation to write operations
 */
export const invalidateCacheOnWrite = (req: Request, res: Response, next: NextFunction): void => {
  const userId = req.user?.id;
  if (!userId) return next();
  
  // Store original json method
  const originalJson = res.json;
  
  // Override json method to invalidate cache on successful writes
  res.json = function(data: any) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      // Determine what to invalidate based on the operation
      const method = req.method;
      const path = req.route?.path || req.path;
      
      if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
        if (path.includes('/folders') || path.includes('/files')) {
          // File/folder operations - invalidate folder cache
          const folderId = req.body?.folderId || req.body?.targetFolderId || req.params?.id;
          CacheInvalidator.invalidateFolderCache(userId, folderId);
          
          // Also invalidate file cache if it's a file operation
          if (path.includes('/files')) {
            const fileId = req.params?.id;
            CacheInvalidator.invalidateFileCache(userId, fileId);
          }
          
          // Invalidate storage stats on any write operation
          CacheInvalidator.invalidateStorageStats(userId);
        }
      }
    }
    
    return originalJson.call(this, data);
  };
  
  next();
};