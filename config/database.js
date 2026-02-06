const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/pocketcloud.db');

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
  
  // Create users table with encryption salt
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      encryption_salt TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create files table with encryption metadata
  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      size INTEGER NOT NULL,
      mimetype TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      iv TEXT,
      auth_tag TEXT,
      encrypted BOOLEAN DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  
  // Save database to disk
  saveDatabase();
  console.log('✓ Users table ready');
  console.log('✓ Files table ready');
  
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

