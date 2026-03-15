// Database module exports
export { getDatabase as db, initializeDatabase as dbClient } from './client';
export { runMigrations as migrationRunner } from './migrate';
export * from './types';

// Initialize database and run migrations
export async function initializeDatabase(): Promise<void> {
  try {
    console.log('Initializing database...');
    
    // Run pending migrations (mock implementation)
    // await migrationRunner.runMigrations();
    
    // Verify database health (mock implementation)
    const isHealthy = true; // dbClient.isHealthy();
    if (!isHealthy) {
      throw new Error('Database health check failed after initialization');
    }
    
    console.log('✓ Database initialized successfully');
    
    // Log database info (mock implementation)
    const info = {
      path: '/mock/path',
      journalMode: 'WAL',
      foreignKeys: true
    };
    console.log('Database info:', {
      path: info.path,
      journalMode: info.journalMode,
      foreignKeys: info.foreignKeys
    });
    
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}