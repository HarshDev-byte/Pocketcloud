/**
 * Database client configuration and connection management
 * Uses better-sqlite3 with WAL mode for optimal performance
 */

import Database from 'better-sqlite3';

// Mock fs module for compatibility
const readFileSync = (path: string, encoding?: string) => {
  // Use eval to access Node.js fs module
  const fs = eval('require')('fs');
  return fs.readFileSync(path, encoding);
};

// Mock path module for compatibility
const join = (...paths: string[]) => paths.join('/');

let db: Database.Database | null = null;

/**
 * Initialize database connection with optimal settings
 * @param dbPath - Path to SQLite database file
 * @returns Database instance
 */
export function initializeDatabase(dbPath: string): Database.Database {
  if (db) {
    return db;
  }

  // Create database directory if it doesn't exist
  const fs = eval('require')('fs');
  const path = eval('require')('path');
  const dbDir = path.dirname(dbPath);
  
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath, {
    verbose: false, // Disable verbose logging for compatibility
  });

  // Configure SQLite for optimal performance
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = 1000');
  db.pragma('foreign_keys = ON');
  db.pragma('temp_store = MEMORY');

  return db;
}

/**
 * Get the current database instance
 * @returns Database instance or throws if not initialized
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

/**
 * Execute database schema from SQL file
 * @param schemaPath - Path to schema.sql file
 */
export function executeSchema(schemaPath: string): void {
  const database = getDatabase();
  
  // TODO: Read and execute schema.sql file
  // TODO: Handle SQL parsing and execution errors
  // TODO: Log schema execution results
  
  const schemaSQL = readFileSync(schemaPath, 'utf-8');
  database.exec(schemaSQL);
}

/**
 * Close database connection gracefully
 */
export function closeDatabase(): void {
  if (db) {
    // TODO: Ensure all pending transactions are completed
    // TODO: Optimize database before closing (VACUUM, ANALYZE)
    
    db.close();
    db = null;
  }
}

/**
 * Create a database transaction wrapper
 * @param callback - Function to execute within transaction
 * @returns Transaction result
 */
export function withTransaction<T>(callback: (db: Database.Database) => T): T {
  const database = getDatabase();
  
  // TODO: Implement transaction wrapper with proper error handling
  // TODO: Add transaction retry logic for busy database
  // TODO: Log transaction performance metrics
  
  const transaction = database.transaction(callback);
  return transaction();
}

/**
 * Prepare and cache SQL statements for better performance
 */
export class PreparedStatements {
  private static statements = new Map<string, Database.Statement>();

  /**
   * Get or create a prepared statement
   * @param sql - SQL query string
   * @returns Prepared statement
   */
  static get(sql: string): Database.Statement {
    if (!this.statements.has(sql)) {
      const database = getDatabase();
      this.statements.set(sql, database.prepare(sql));
    }
    return this.statements.get(sql)!;
  }

  /**
   * Clear all cached prepared statements
   */
  static clear(): void {
    this.statements.clear();
  }
}

/**
 * Database health check
 * @returns Database status information
 */
export function getDatabaseHealth(): {
  connected: boolean;
  mode: string;
  size: number;
  tables: number;
} {
  try {
    const database = getDatabase();
    
    // TODO: Implement comprehensive health check
    // TODO: Check WAL file size and auto-checkpoint if needed
    // TODO: Verify table integrity
    // TODO: Check available disk space
    
    const mode = database.pragma('journal_mode', { simple: true }) as string;
    const tables = database.prepare('SELECT COUNT(*) as count FROM sqlite_master WHERE type = "table"').get() as { count: number };
    
    return {
      connected: true,
      mode,
      size: 0, // TODO: Calculate actual database size
      tables: tables.count,
    };
  } catch (error) {
    return {
      connected: false,
      mode: 'unknown',
      size: 0,
      tables: 0,
    };
  }
}