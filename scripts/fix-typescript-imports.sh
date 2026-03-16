#!/bin/bash

# Fix TypeScript Import Issues
# This script fixes the .js import extensions in TypeScript files

set -e

echo "🔧 Fixing TypeScript import extensions..."

cd /opt/pocketcloud/pocket-cloud/backend

# Fix all .js imports in TypeScript files to use .ts extensions
echo "📝 Updating import statements..."

# Fix db/client.ts imports
find src -name "*.ts" -type f -exec sed -i "s|from './client\.js'|from './client.js'|g" {} \;
find src -name "*.ts" -type f -exec sed -i "s|from './migrate\.js'|from './migrate.js'|g" {} \;

# Fix all relative imports ending with .js to not have extension (tsx will resolve them)
find src -name "*.ts" -type f -exec sed -i "s|from '\./\([^']*\)\.js'|from './\1'|g" {} \;
find src -name "*.ts" -type f -exec sed -i "s|from '\.\./\([^']*\)\.js'|from '../\1'|g" {} \;

echo "✅ Import statements fixed!"

# Create a simple database initialization script that works
echo "🗄️ Creating simple database init..."

cat > init-db-simple.js << 'EOF'
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Create database directory
const dbDir = '/mnt/pocketcloud/data';
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize database
const dbPath = '/mnt/pocketcloud/data/storage.db';
console.log('Initializing database at:', dbPath);

const db = new Database(dbPath);

// Configure SQLite
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 1000');
db.pragma('foreign_keys = ON');
db.pragma('temp_store = MEMORY');

// Read and execute schema
const schemaPath = path.join(__dirname, 'src/db/schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf-8');

console.log('Executing schema...');
db.exec(schema);

// Check tables created
const tables = db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get();
console.log(`✅ Database initialized with ${tables.count} tables`);

db.close();
console.log('✅ Database initialization completed!');
EOF

# Run the simple database initialization
echo "🚀 Running database initialization..."
sudo -u pocketcloud node init-db-simple.js

# Clean up
rm init-db-simple.js

echo "✅ TypeScript imports and database fixed!"