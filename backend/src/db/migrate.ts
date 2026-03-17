import { db } from './client';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger';

// Create migrations tracking table
db.exec(`
  CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version INTEGER UNIQUE NOT NULL,
    filename TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )
`);

export function migrate(): void {
  const migrationsDir = join(__dirname, 'migrations');
  
  try {
    // Get all SQL files sorted by filename
    const migrationFiles = readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    // Get already applied migrations
    const appliedMigrations = db.prepare('SELECT filename FROM migrations').all() as { filename: string }[];
    const appliedSet = new Set(appliedMigrations.map(m => m.filename));

    // Apply unapplied migrations
    for (const filename of migrationFiles) {
      if (appliedSet.has(filename)) {
        continue;
      }

      const migrationPath = join(migrationsDir, filename);
      const sql = readFileSync(migrationPath, 'utf8');

      // Extract version number from filename (e.g., 001_initial.sql -> 1)
      const versionMatch = filename.match(/^(\d+)_/);
      const version = versionMatch ? parseInt(versionMatch[1], 10) : 0;

      // Run migration in transaction
      const transaction = db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT INTO migrations (version, filename, applied_at) VALUES (?, ?, ?)').run(
          version,
          filename,
          Date.now()
        );
      });

      transaction();
      logger.info(`Applied migration: ${filename}`);
    }

    logger.info('Database migrations completed');
  } catch (error) {
    logger.error('Migration failed', { error: error instanceof Error ? error.message : error });
    throw error;
  }
}

// Alias for backup service compatibility
export const runMigrations = migrate;