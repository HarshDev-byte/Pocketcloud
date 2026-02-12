#!/usr/bin/env node

/**
 * File Integrity Checker for PocketCloud
 * Helps diagnose encryption/decryption issues
 */

const fs = require('fs-extra');
const path = require('path');
const { getDatabase } = require('../src/config/database');
const { getUserStoragePath } = require('../src/config/storage');

async function checkFileIntegrity() {
  console.log('🔍 PocketCloud File Integrity Check');
  console.log('=====================================');
  
  try {
    const db = getDatabase();
    
    // Get all files from database
    const result = db.exec('SELECT * FROM files ORDER BY uploaded_at DESC');
    
    if (result.length === 0 || result[0].values.length === 0) {
      console.log('ℹ️  No files found in database');
      return;
    }
    
    const files = result[0].values.map(row => ({
      id: row[0],
      user_id: row[1],
      filename: row[2],
      filepath: row[3],
      size: row[4],
      mimetype: row[5],
      uploaded_at: row[6],
      iv: row[7],
      auth_tag: row[8],
      encrypted: row[9]
    }));
    
    console.log(`📊 Found ${files.length} files in database\n`);
    
    let healthyFiles = 0;
    let corruptedFiles = 0;
    let missingFiles = 0;
    
    for (const file of files) {
      const userPath = getUserStoragePath(file.user_id);
      const filePath = path.join(userPath, file.filepath);
      
      console.log(`📄 Checking: ${file.filename}`);
      console.log(`   Database ID: ${file.id}`);
      console.log(`   File path: ${file.filepath}`);
      console.log(`   Expected size: ${file.size} bytes`);
      console.log(`   Encrypted: ${file.encrypted ? 'Yes' : 'No'}`);
      
      // Check if file exists on disk
      if (!await fs.pathExists(filePath)) {
        console.log(`   ❌ Status: MISSING - File not found on disk`);
        missingFiles++;
        console.log('');
        continue;
      }
      
      // Check file size on disk
      const stats = await fs.stat(filePath);
      console.log(`   Actual size: ${stats.size} bytes`);
      
      if (file.encrypted) {
        // For encrypted files, disk size will be larger due to encryption overhead
        const expectedMinSize = file.size; // Original size
        const expectedMaxSize = file.size + 1024; // Original + reasonable overhead
        
        if (stats.size < expectedMinSize) {
          console.log(`   ❌ Status: CORRUPTED - File too small (${stats.size} < ${expectedMinSize})`);
          corruptedFiles++;
        } else if (stats.size > expectedMaxSize) {
          console.log(`   ⚠️  Status: SUSPICIOUS - File larger than expected (${stats.size} > ${expectedMaxSize})`);
          console.log(`   ✅ Status: Present but size unusual`);
          healthyFiles++;
        } else {
          console.log(`   ✅ Status: HEALTHY - Size within expected range`);
          healthyFiles++;
        }
        
        // Check encryption metadata
        if (!file.iv || !file.auth_tag) {
          console.log(`   ❌ Encryption: Missing IV or AuthTag`);
          corruptedFiles++;
        } else {
          console.log(`   ✅ Encryption: IV and AuthTag present`);
          console.log(`   IV length: ${Buffer.from(file.iv, 'hex').length} bytes`);
          console.log(`   AuthTag length: ${Buffer.from(file.auth_tag, 'hex').length} bytes`);
        }
      } else {
        // Unencrypted file - size should match exactly
        if (stats.size === file.size) {
          console.log(`   ✅ Status: HEALTHY - Size matches exactly`);
          healthyFiles++;
        } else {
          console.log(`   ❌ Status: CORRUPTED - Size mismatch (${stats.size} != ${file.size})`);
          corruptedFiles++;
        }
      }
      
      console.log('');
    }
    
    // Summary
    console.log('📊 SUMMARY');
    console.log('==========');
    console.log(`Total files: ${files.length}`);
    console.log(`✅ Healthy: ${healthyFiles}`);
    console.log(`❌ Corrupted: ${corruptedFiles}`);
    console.log(`📁 Missing: ${missingFiles}`);
    
    if (corruptedFiles > 0 || missingFiles > 0) {
      console.log('\n⚠️  ISSUES DETECTED');
      console.log('Possible causes:');
      console.log('- USB drive disconnected during file operations');
      console.log('- File system corruption');
      console.log('- Incomplete uploads');
      console.log('- Hardware issues');
      console.log('\nRecommendations:');
      console.log('- Check USB drive health: sudo fsck /dev/sda1');
      console.log('- Create backup: sudo bash tools/backup-pocketcloud.sh');
      console.log('- Consider re-uploading corrupted files');
    } else {
      console.log('\n🎉 All files appear healthy!');
    }
    
  } catch (error) {
    console.error('❌ Error during integrity check:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  checkFileIntegrity().catch(console.error);
}

module.exports = { checkFileIntegrity };