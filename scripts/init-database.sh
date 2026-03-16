#!/bin/bash

# Initialize PocketCloud Database
# This script initializes the database with the schema

set -e

echo "🗄️ Initializing PocketCloud Database..."

# Navigate to backend directory
cd /opt/pocketcloud/pocket-cloud/backend

# Create database directories
echo "📁 Creating database directories..."
sudo mkdir -p /mnt/pocketcloud/data
sudo mkdir -p /mnt/pocketcloud/backups
sudo chown -R pocketcloud:pocketcloud /mnt/pocketcloud/

# Initialize database with schema
echo "🔧 Running database initialization..."
sudo -u pocketcloud tsx -e "
import { initializeDatabase } from './src/db/client.js';
import { executeSchema } from './src/db/client.js';

const dbPath = '/mnt/pocketcloud/data/storage.db';
const schemaPath = './src/db/schema.sql';

console.log('Initializing database at:', dbPath);
initializeDatabase(dbPath);

console.log('Executing schema from:', schemaPath);
executeSchema(schemaPath);

console.log('✅ Database initialized successfully!');
"

echo "✅ Database initialization completed!"
echo ""
echo "📊 Database info:"
sudo -u pocketcloud sqlite3 /mnt/pocketcloud/data/storage.db "SELECT COUNT(*) as table_count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
echo "Tables created successfully!"