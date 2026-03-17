import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { migrate } from './migrate';

// Export Statement type for use in other modules
export type Statement = Database.Statement;

const DB_PATH = process.env.DB_PATH || '/mnt/pocketcloud/db/pocketcloud.db';

// Ensure database directory exists
const dbDir = join(DB_PATH, '..');
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Create database connection
export let db: Database.Database;

// Initialize database connection
export function initializeDatabase(): void {
  // Close existing connection if any
  if (db) {
    try {
      db.close();
    } catch (error) {
      // Ignore errors when closing
    }
  }

  // Create new connection
  db = new Database(DB_PATH);

  // CRITICAL PRAGMAS — set these in exact order for production performance
  db.pragma('journal_mode = WAL');        // Write-Ahead Log: readers don't block writers
  db.pragma('synchronous = NORMAL');      // Safe + fast (not FULL which is slow)
  db.pragma('cache_size = -64000');       // 64MB page cache (Pi has 4GB RAM)
  db.pragma('temp_store = MEMORY');       // Temp tables in RAM not disk
  db.pragma('mmap_size = 268435456');     // 256MB memory-mapped I/O
  db.pragma('foreign_keys = ON');         // Enforce FK constraints
  db.pragma('busy_timeout = 10000');      // 10 second timeout before "locked" error
  db.pragma('wal_autocheckpoint = 1000'); // Checkpoint every 1000 WAL pages

  // Verify WAL mode actually set
  const walMode = db.pragma('journal_mode', { simple: true });
  if (walMode !== 'wal') {
    console.error('CRITICAL: WAL mode not set! DB performance will suffer.');
  }
}

// Initialize database on import
initializeDatabase();

// Prepared statement cache for frequently used queries
// Note: These are initialized after db is created
interface StatementCache {
  readonly getFile: Statement;
  readonly getFileIncDeleted: Statement;
  readonly listFolderFiles: Statement;
  readonly getFolder: Statement;
  readonly listSubfolders: Statement;
  readonly getSession: Statement;
  readonly getUploadSession: Statement;
  readonly updateUploadChunks: Statement;
}

export const statements: StatementCache = {
  get getFile(): Statement { return db.prepare('SELECT * FROM files WHERE id = ? AND is_deleted = 0'); },
  get getFileIncDeleted(): Statement { return db.prepare('SELECT * FROM files WHERE id = ?'); },
  get listFolderFiles(): Statement { return db.prepare('SELECT * FROM files WHERE owner_id = ? AND folder_id IS ? AND is_deleted = 0 ORDER BY name ASC'); },
  get getFolder(): Statement { return db.prepare('SELECT * FROM folders WHERE id = ? AND is_deleted = 0'); },
  get listSubfolders(): Statement { return db.prepare('SELECT * FROM folders WHERE owner_id = ? AND parent_id IS ? AND is_deleted = 0 ORDER BY name ASC'); },
  get getSession(): Statement { return db.prepare(`
    SELECT s.*, u.id as u_id, u.username, u.role, u.is_active, u.quota_bytes, u.created_at, u.last_login
    FROM sessions s 
    JOIN users u ON s.user_id = u.id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `); },
  get getUploadSession(): Statement { return db.prepare('SELECT * FROM upload_sessions WHERE id = ?'); },
  get updateUploadChunks(): Statement { return db.prepare('UPDATE upload_sessions SET received_chunks = ? WHERE id = ?'); },
};

// Run migrations on startup (integrity check will be called from backup service)
try {
  migrate();
} catch (error: any) {
  console.error('Database initialization failed:', error.message);
  process.exit(1);
}

// Note: Graceful shutdown is now handled by shutdown.ts
// These handlers are kept for backward compatibility but will be overridden
process.on('SIGINT', () => {
  if (db) {
    db.close();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (db) {
    db.close();
  }
  process.exit(0);
});

// Export DB_PATH for backup service
export { DB_PATH };