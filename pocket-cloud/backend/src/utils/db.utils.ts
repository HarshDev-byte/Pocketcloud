import { db } from '../db';
import { Statement } from 'better-sqlite3';

/**
 * Database utilities optimized for Raspberry Pi 4B
 * Provides prepared statements, batch operations, and query optimization
 */

// Cache for prepared statements
const preparedStatements = new Map<string, Statement>();

/**
 * Get or create a prepared statement
 */
export function getPreparedStatement(sql: string): Statement {
  if (!preparedStatements.has(sql)) {
    preparedStatements.set(sql, db.prepare(sql));
  }
  return preparedStatements.get(sql)!;
}

/**
 * Common prepared statements for frequent operations
 */
export class PreparedQueries {
  
  // File operations
  private static readonly GET_FILE_BY_ID = getPreparedStatement(`
    SELECT * FROM files WHERE id = ? AND is_deleted = 0
  `);
  
  private static readonly GET_FILES_IN_FOLDER = getPreparedStatement(`
    SELECT id, name, original_name, mime_type, size, checksum, created_at, updated_at
    FROM files 
    WHERE folder_id = ? AND owner_id = ? AND is_deleted = 0
    ORDER BY name ASC
  `);
  
  private static readonly GET_ROOT_FILES = getPreparedStatement(`
    SELECT id, name, original_name, mime_type, size, checksum, created_at, updated_at
    FROM files 
    WHERE folder_id IS NULL AND owner_id = ? AND is_deleted = 0
    ORDER BY name ASC
  `);
  
  // Folder operations
  private static readonly GET_FOLDER_BY_ID = getPreparedStatement(`
    SELECT * FROM folders WHERE id = ? AND is_deleted = 0
  `);
  
  private static readonly GET_SUBFOLDERS = getPreparedStatement(`
    SELECT id, name, path, created_at, updated_at
    FROM folders 
    WHERE parent_id = ? AND owner_id = ? AND is_deleted = 0
    ORDER BY name ASC
  `);
  
  private static readonly GET_ROOT_FOLDERS = getPreparedStatement(`
    SELECT id, name, path, created_at, updated_at
    FROM folders 
    WHERE parent_id IS NULL AND owner_id = ? AND is_deleted = 0
    ORDER BY name ASC
  `);
  
  // User operations
  private static readonly GET_USER_BY_ID = getPreparedStatement(`
    SELECT * FROM users WHERE id = ?
  `);
  
  private static readonly GET_USER_BY_USERNAME = getPreparedStatement(`
    SELECT * FROM users WHERE username = ?
  `);
  
  // Session operations
  private static readonly GET_SESSION_BY_TOKEN = getPreparedStatement(`
    SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?
  `);
  
  private static readonly DELETE_EXPIRED_SESSIONS = getPreparedStatement(`
    DELETE FROM sessions WHERE expires_at < ?
  `);
  
  // Storage stats
  private static readonly GET_STORAGE_STATS = getPreparedStatement(`
    SELECT * FROM storage_stats WHERE id = 1
  `);
  
  private static readonly UPDATE_STORAGE_STATS = getPreparedStatement(`
    UPDATE storage_stats 
    SET used_bytes = used_bytes + ?, file_count = file_count + ?, updated_at = ?
    WHERE id = 1
  `);

  // Public accessors for the prepared statements
  public static getFileById(): any { return this.GET_FILE_BY_ID; }
  public static getFilesInFolder(): any { return this.GET_FILES_IN_FOLDER; }
  public static getRootFiles(): any { return this.GET_ROOT_FILES; }
  public static getFolderById(): any { return this.GET_FOLDER_BY_ID; }
  public static getSubfolders(): any { return this.GET_SUBFOLDERS; }
  public static getRootFolders(): any { return this.GET_ROOT_FOLDERS; }
  public static getUserById(): any { return this.GET_USER_BY_ID; }
  public static getUserByUsername(): any { return this.GET_USER_BY_USERNAME; }
  public static getSessionByToken(): any { return this.GET_SESSION_BY_TOKEN; }
  public static deleteExpiredSessions(): any { return this.DELETE_EXPIRED_SESSIONS; }
  public static getStorageStats(): any { return this.GET_STORAGE_STATS; }
  public static updateStorageStats(): any { return this.UPDATE_STORAGE_STATS; }
}

/**
 * Batch insert helper for bulk operations
 */
export class BatchOperations {
  
  /**
   * Batch insert files
   */
  public static insertFiles(files: Array<{
    id: string;
    owner_id: string;
    folder_id: string | null;
    name: string;
    original_name: string;
    mime_type: string;
    size: number;
    storage_path: string;
    checksum: string;
    created_at: number;
    updated_at: number;
  }>): void {
    const insertStmt = getPreparedStatement(`
      INSERT INTO files (
        id, owner_id, folder_id, name, original_name, mime_type, 
        size, storage_path, checksum, is_deleted, deleted_at, 
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)
    `);
    
    const transaction = db.transaction(() => {
      for (const file of files) {
        insertStmt.run(
          file.id, file.owner_id, file.folder_id, file.name, file.original_name,
          file.mime_type, file.size, file.storage_path, file.checksum,
          file.created_at, file.updated_at
        );
      }
    });
    
    transaction();
  }
  
  /**
   * Batch insert folders
   */
  public static insertFolders(folders: Array<{
    id: string;
    owner_id: string;
    parent_id: string | null;
    name: string;
    path: string;
    created_at: number;
    updated_at: number;
  }>): void {
    const insertStmt = getPreparedStatement(`
      INSERT INTO folders (
        id, owner_id, parent_id, name, path, is_deleted, deleted_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)
    `);
    
    const transaction = db.transaction(() => {
      for (const folder of folders) {
        insertStmt.run(
          folder.id, folder.owner_id, folder.parent_id, folder.name, folder.path,
          folder.created_at, folder.updated_at
        );
      }
    });
    
    transaction();
  }
  
  /**
   * Batch update file metadata
   */
  public static updateFileMetadata(updates: Array<{
    id: string;
    name?: string;
    folder_id?: string | null;
    updated_at: number;
  }>): void {
    const updateStmt = getPreparedStatement(`
      UPDATE files 
      SET name = COALESCE(?, name), 
          folder_id = COALESCE(?, folder_id),
          updated_at = ?
      WHERE id = ?
    `);
    
    const transaction = db.transaction(() => {
      for (const update of updates) {
        updateStmt.run(update.name, update.folder_id, update.updated_at, update.id);
      }
    });
    
    transaction();
  }
}

/**
 * Query optimization helpers
 */
export class QueryOptimizer {
  
  /**
   * Explain query plan for development
   */
  public static explainQuery(sql: string, params: any[] = []): any[] {
    const explainStmt = db.prepare(`EXPLAIN QUERY PLAN ${sql}`);
    return explainStmt.all(...params);
  }
  
  /**
   * Analyze table statistics
   */
  public static analyzeTable(tableName: string): void {
    const analyzeStmt = db.prepare(`ANALYZE ${tableName}`);
    analyzeStmt.run();
  }
  
  /**
   * Get table info and statistics
   */
  public static getTableStats(tableName: string): {
    rowCount: number;
    pageCount: number;
    pageSize: number;
    avgRowSize: number;
  } {
    const countStmt = getPreparedStatement(`SELECT COUNT(*) as count FROM ${tableName}`);
    const pageStmt = db.prepare(`PRAGMA page_count`);
    const pageSizeStmt = db.prepare(`PRAGMA page_size`);
    
    const rowCount = (countStmt.get() as any).count;
    const pageCount = (pageStmt.get() as any).page_count;
    const pageSize = (pageSizeStmt.get() as any).page_size;
    
    return {
      rowCount,
      pageCount,
      pageSize,
      avgRowSize: rowCount > 0 ? (pageCount * pageSize) / rowCount : 0
    };
  }
  
  /**
   * Optimize database (vacuum, analyze)
   */
  public static optimizeDatabase(): void {
    console.log('Starting database optimization...');
    
    // Update statistics
    db.exec('ANALYZE');
    
    // Vacuum to reclaim space and optimize
    db.exec('VACUUM');
    
    console.log('Database optimization completed');
  }
  
  /**
   * Get slow queries (requires query logging)
   */
  public static getSlowQueries(): Array<{
    sql: string;
    executionTime: number;
    callCount: number;
  }> {
    // This would require custom query logging implementation
    // For now, return empty array
    return [];
  }
}

/**
 * Database health monitoring
 */
export class DatabaseHealth {
  
  /**
   * Check database integrity
   */
  public static checkIntegrity(): boolean {
    try {
      const result = db.prepare('PRAGMA integrity_check').get() as any;
      return result.integrity_check === 'ok';
    } catch (error) {
      console.error('Database integrity check failed:', error);
      return false;
    }
  }
  
  /**
   * Get database size information
   */
  public static getDatabaseSize(): {
    totalPages: number;
    pageSize: number;
    totalSize: number;
    freePages: number;
    freeSize: number;
  } {
    const pageCountStmt = db.prepare('PRAGMA page_count');
    const pageSizeStmt = db.prepare('PRAGMA page_size');
    const freePagesStmt = db.prepare('PRAGMA freelist_count');
    
    const totalPages = (pageCountStmt.get() as any).page_count;
    const pageSize = (pageSizeStmt.get() as any).page_size;
    const freePages = (freePagesStmt.get() as any).freelist_count;
    
    return {
      totalPages,
      pageSize,
      totalSize: totalPages * pageSize,
      freePages,
      freeSize: freePages * pageSize
    };
  }
  
  /**
   * Get connection statistics
   */
  public static getConnectionStats(): {
    isOpen: boolean;
    inTransaction: boolean;
    journalMode: string;
    synchronous: string;
  } {
    const journalStmt = db.prepare('PRAGMA journal_mode');
    const syncStmt = db.prepare('PRAGMA synchronous');
    
    return {
      isOpen: db.open,
      inTransaction: db.inTransaction,
      journalMode: (journalStmt.get() as any).journal_mode,
      synchronous: (syncStmt.get() as any).synchronous
    };
  }
}

/**
 * Performance monitoring
 */
export class PerformanceMonitor {
  private static queryTimes = new Map<string, number[]>();
  
  /**
   * Time a query execution
   */
  public static timeQuery<T>(sql: string, executor: () => T): T {
    const start = Date.now();
    const result = executor();
    const end = Date.now();
    
    const executionTime = end - start;
    
    if (!this.queryTimes.has(sql)) {
      this.queryTimes.set(sql, []);
    }
    
    const times = this.queryTimes.get(sql)!;
    times.push(executionTime);
    
    // Keep only last 100 measurements
    if (times.length > 100) {
      times.shift();
    }
    
    return result;
  }
  
  /**
   * Get query performance statistics
   */
  public static getQueryStats(): Array<{
    sql: string;
    avgTime: number;
    minTime: number;
    maxTime: number;
    callCount: number;
  }> {
    const stats = [];
    
    for (const [sql, times] of this.queryTimes.entries()) {
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      
      stats.push({
        sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
        avgTime,
        minTime,
        maxTime,
        callCount: times.length
      });
    }
    
    return stats.sort((a, b) => b.avgTime - a.avgTime);
  }
  
  /**
   * Clear performance statistics
   */
  public static clearStats(): void {
    this.queryTimes.clear();
  }
}