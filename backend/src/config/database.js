const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/pocketcloud.db');

let db = null;

// Initialize database
async function initDatabase() {
  const SQL = await initSqlJs();
  
  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('✓ Database loaded');
  } else {
    db = new SQL.Database();
    console.log('✓ Database created');
  }
  
  // Create system_config table for first-run detection
  db.run(`
    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create users table with encryption salt and roles
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT UNIQUE,
      role TEXT DEFAULT 'viewer',
      encryption_salt TEXT,
      avatar TEXT,
      status TEXT DEFAULT 'active',
      last_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create files table with encryption metadata and new features
  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      folder_id INTEGER,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      size INTEGER NOT NULL,
      mimetype TEXT,
      description TEXT,
      tags TEXT,
      file_hash TEXT,
      status TEXT DEFAULT 'active',
      trashed_at DATETIME,
      thumbnail_small TEXT,
      thumbnail_medium TEXT,
      thumbnail_large TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      iv TEXT,
      auth_tag TEXT,
      encrypted BOOLEAN DEFAULT 0,
      is_public BOOLEAN DEFAULT 0,
      download_count INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (folder_id) REFERENCES folders(id)
    )
  `);
  
  // Create folders table
  db.run(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      parent_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT,
      is_public BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (parent_id) REFERENCES folders(id)
    )
  `);
  
  // Create shares table for file/folder sharing
  db.run(`
    CREATE TABLE IF NOT EXISTS shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      shared_with_user_id INTEGER,
      resource_type TEXT NOT NULL,
      resource_id INTEGER NOT NULL,
      permission TEXT DEFAULT 'view',
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (shared_with_user_id) REFERENCES users(id)
    )
  `);
  
  // Create comments table
  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id INTEGER NOT NULL,
      parent_id INTEGER,
      content TEXT NOT NULL,
      mentions TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (parent_id) REFERENCES comments(id)
    )
  `);
  
  // Create activity_log table
  db.run(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id INTEGER,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  
  // Create search_index table for full-text search
  db.run(`
    CREATE TABLE IF NOT EXISTS search_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_type TEXT NOT NULL,
      resource_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      title TEXT,
      content TEXT,
      tags TEXT,
      metadata TEXT,
      indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  
  // Create backup_jobs table
  db.run(`
    CREATE TABLE IF NOT EXISTS backup_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      provider TEXT,
      file_count INTEGER DEFAULT 0,
      total_size INTEGER DEFAULT 0,
      progress INTEGER DEFAULT 0,
      error TEXT,
      started_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  
  // Create backup_config table
  db.run(`
    CREATE TABLE IF NOT EXISTS backup_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      config TEXT NOT NULL,
      schedule TEXT,
      enabled BOOLEAN DEFAULT 1,
      last_backup DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  
  // Create indexes for better performance
  db.run('CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files(folder_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_shares_user_id ON shares(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_shares_shared_with ON shares(shared_with_user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_comments_resource ON comments(resource_type, resource_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_activity_user_id ON activity_log(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_search_user_id ON search_index(user_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_search_resource ON search_index(resource_type, resource_id)');
  
  // Save database to disk
  saveDatabase();
  console.log('✓ Users table ready');
  console.log('✓ Files table ready');
  console.log('✓ Folders table ready');
  console.log('✓ Shares table ready');
  console.log('✓ Comments table ready');
  console.log('✓ Activity log ready');
  console.log('✓ Search index ready');
  console.log('✓ Backup tables ready');
  console.log('✓ Indexes created');
  
  return db;
}

// Save database to disk
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// Get database instance
function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

module.exports = {
  initDatabase,
  getDatabase,
  saveDatabase
};

