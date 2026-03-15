import { beforeAll, afterAll } from 'vitest';
import { db } from '../db';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Setup test database and directories
beforeAll(async () => {
  // Ensure test directories exist
  const testDirs = [
    join(process.cwd(), 'test-uploads'),
    join(process.cwd(), 'test-files'),
    join(process.cwd(), 'uploads', 'temp')
  ];

  testDirs.forEach(dir => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  });

  // Initialize database tables if needed
  try {
    db.exec('PRAGMA foreign_keys = ON');
  } catch (error) {
    console.warn('Database setup warning:', error);
  }
});

afterAll(async () => {
  // Clean up test data
  try {
    db.exec('DELETE FROM sessions WHERE 1=1');
    db.exec('DELETE FROM files WHERE 1=1');
    db.exec('DELETE FROM folders WHERE 1=1');
    db.exec('DELETE FROM users WHERE username LIKE "%test%"');
  } catch (error) {
    console.warn('Database cleanup warning:', error);
  }
});

// Extend global types for testing
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        role: string;
      };
    }
  }
}