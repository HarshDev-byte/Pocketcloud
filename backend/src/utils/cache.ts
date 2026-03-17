import { LRUCache } from 'lru-cache';
import { logger } from './logger';

// Cache for folder listings (most-read endpoint)
export const folderCache = new LRUCache<string, any>({
  max: 200,           // 200 folder listings cached
  ttl: 10 * 1000,     // 10 second TTL
  ttlAutopurge: true,
});

// Cache for file metadata
export const fileMetaCache = new LRUCache<string, any>({
  max: 1000,          // 1000 file records cached
  ttl: 30 * 1000,     // 30 second TTL
  ttlAutopurge: true,
});

// Cache for storage stats (expensive aggregation query)
export const storageStatsCache = new LRUCache<string, any>({
  max: 50,            // 50 user stats cached
  ttl: 60 * 1000,     // 1 minute TTL
  ttlAutopurge: true,
});

// Cache for user sessions (avoid DB lookup on every request)
export const sessionCache = new LRUCache<string, any>({
  max: 100,           // 100 cached sessions
  ttl: 60 * 1000,     // 1 minute TTL
  ttlAutopurge: true,
});

// Cache invalidation functions
export function invalidateFolderCache(folderId?: string, userId?: string): void {
  if (folderId) {
    folderCache.delete(`folder:${folderId}`);
    if (userId) {
      folderCache.delete(`folder:root:${userId}`);
    }
  } else {
    // Nuclear option: clear all
    folderCache.clear();
    logger.debug('Folder cache cleared');
  }
}

export function invalidateFileCache(fileId: string): void {
  fileMetaCache.delete(`file:${fileId}`);
}

export function invalidateStorageCache(userId: string): void {
  storageStatsCache.delete(`stats:${userId}`);
}

export function invalidateSessionCache(tokenHash: string): void {
  sessionCache.delete(`session:${tokenHash}`);
}

// Get cache statistics
export function getCacheStats() {
  return {
    folder: {
      size: folderCache.size,
      max: folderCache.max,
      hitRate: folderCache.size > 0 ? 'active' : 'empty'
    },
    fileMeta: {
      size: fileMetaCache.size,
      max: fileMetaCache.max,
      hitRate: fileMetaCache.size > 0 ? 'active' : 'empty'
    },
    storageStats: {
      size: storageStatsCache.size,
      max: storageStatsCache.max,
      hitRate: storageStatsCache.size > 0 ? 'active' : 'empty'
    },
    session: {
      size: sessionCache.size,
      max: sessionCache.max,
      hitRate: sessionCache.size > 0 ? 'active' : 'empty'
    }
  };
}
