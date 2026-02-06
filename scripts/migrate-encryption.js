/**
 * Migration script: Add encryption support to existing PocketCloud installation
 * 
 * This script:
 * 1. Adds encryption_salt column to users table
 * 2. Adds iv, auth_tag, encrypted columns to files table
 * 3. Generates encryption salts for existing users
 * 4. Marks existing files as unencrypted (backward compatibility)
 * 
 * Run with: node scripts/migrate-encryption.js
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '../data/pocketcloud.db');

async function migrate() {
  console.log('🔄 Starting encryption migration...\n');
  
  if (!fs.existsSync(DB_PATH)) {
    console.log('❌ Database not found. Nothing to migrate.');
    console.log('   If this is a fresh install, just start the server normally.');
    return;
  }
  
  // Load database
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);
  
  console.log('✓ Database loaded\n');
  
  // Check if migration already done
  try {
    const result = db.exec('SELECT encryption_salt FROM users LIMIT 1');
    console.log('ℹ️  Encryption columns already exist.');
    console.log('   Checking for users without encryption salts...\n');
  } catch (error) {
    // Column doesn't exist, need to add it
    console.log('📝 Adding encryption_salt column to users table...');
    db.run('ALTER TABLE users ADD COLUMN encryption_salt TEXT');
    console.log('✓ Column added\n');
  }
  
  // Check files table
  try {
    const result = db.exec('SELECT iv, auth_tag, encrypted FROM files LIMIT 1');
    console.log('ℹ️  Files encryption columns already exist.\n');
  } catch (error) {
    console.log('📝 Adding encryption columns to files table...');
    db.run('ALTER TABLE files ADD COLUMN iv TEXT');
    db.run('ALTER TABLE files ADD COLUMN auth_tag TEXT');
    db.run('ALTER TABLE files ADD COLUMN encrypted BOOLEAN DEFAULT 0');
    console.log('✓ Columns added\n');
  }
  
  // Generate salts for users without them
  const usersResult = db.exec('SELECT id, username, encryption_salt FROM users');
  
  if (usersResult.length > 0 && usersResult[0].values.length > 0) {
    let updatedCount = 0;
    
    for (const row of usersResult[0].values) {
      const userId = row[0];
      const username = row[1];
      const existingSalt = row[2];
      
      if (!existingSalt) {
        const newSalt = crypto.randomBytes(32).toString('hex');
        db.run('UPDATE users SET encryption_salt = ? WHERE id = ?', [newSalt, userId]);
        console.log(`✓ Generated encryption salt for user: ${username}`);
        updatedCount++;
      }
    }
    
    if (updatedCount > 0) {
      console.log(`\n✓ Updated ${updatedCount} user(s) with encryption salts`);
    } else {
      console.log('✓ All users already have encryption salts');
    }
  } else {
    console.log('ℹ️  No users found in database');
  }
  
  // Mark existing files as unencrypted (backward compatibility)
  const filesResult = db.exec('SELECT COUNT(*) FROM files WHERE encrypted IS NULL OR encrypted = 0');
  
  if (filesResult.length > 0 && filesResult[0].values.length > 0) {
    const unencryptedCount = filesResult[0].values[0][0];
    
    if (unencryptedCount > 0) {
      db.run('UPDATE files SET encrypted = 0 WHERE encrypted IS NULL');
      console.log(`\n✓ Marked ${unencryptedCount} existing file(s) as unencrypted (backward compatible)`);
    }
  }
  
  // Save database
  const data = db.export();
  const outputBuffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, outputBuffer);
  
  console.log('\n✅ Migration complete!');
  console.log('\nNext steps:');
  console.log('1. Existing users can log in normally');
  console.log('2. Old files will download without decryption');
  console.log('3. New uploads will be encrypted automatically');
  console.log('4. New users will have encryption enabled by default\n');
}

migrate().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
