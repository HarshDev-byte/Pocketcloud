#!/usr/bin/env node

/**
 * Corruption Scanner for PocketCloud
 * Scans all files for corruption and provides recovery options
 */

const { scanForCorruption, getCorruptedFiles, cleanupCorruptedFile } = require('../services/fileRecovery');
const { getDatabase } = require('../config/database');

async function scanAndReport() {
  console.log('🔍 PocketCloud Corruption Scanner');
  console.log('=================================');
  
  try {
    console.log('📊 Scanning all files for corruption...\n');
    
    const results = await scanForCorruption();
    
    console.log('📋 SCAN RESULTS');
    console.log('===============');
    console.log(`Total files scanned: ${results.scanned}`);
    console.log(`✅ Healthy files: ${results.healthy}`);
    console.log(`❌ Corrupted files: ${results.corrupted}`);
    
    if (results.corrupted > 0) {
      console.log('\n⚠️  CORRUPTED FILES DETECTED');
      console.log('============================');
      
      // Get all users to show corrupted files per user
      const db = getDatabase();
      const userResult = db.exec('SELECT DISTINCT user_id FROM files');
      
      if (userResult.length > 0 && userResult[0].values.length > 0) {
        const userIds = userResult[0].values.map(row => row[0]);
        
        for (const userId of userIds) {
          const corruptedFiles = getCorruptedFiles(userId);
          
          if (corruptedFiles.length > 0) {
            console.log(`\n👤 User ${userId} - ${corruptedFiles.length} corrupted files:`);
            
            corruptedFiles.forEach((file, index) => {
              console.log(`   ${index + 1}. ${file.filename}`);
              console.log(`      Reason: ${file.reason}`);
              console.log(`      Detected: ${file.detected_at}`);
              console.log(`      Size: ${file.size} bytes`);
            });
          }
        }
      }
      
      console.log('\n🔧 RECOVERY OPTIONS');
      console.log('===================');
      console.log('1. Clean up corrupted files:');
      console.log('   npm run cleanup:corrupted');
      console.log('');
      console.log('2. Manual cleanup via web interface:');
      console.log('   - Go to PocketCloud dashboard');
      console.log('   - Corrupted files will show with warning icons');
      console.log('   - Click "Remove Corrupted File" to clean up');
      console.log('');
      console.log('3. Re-upload original files:');
      console.log('   - After cleanup, re-upload the original files');
      console.log('   - Ensure stable USB connection during upload');
      console.log('');
      console.log('⚠️  PREVENTION TIPS');
      console.log('===================');
      console.log('- Use high-quality USB cable');
      console.log('- Ensure adequate power supply (official Pi adapter)');
      console.log('- Avoid moving Pi during file operations');
      console.log('- Create regular backups: sudo bash tools/backup-pocketcloud.sh');
      
    } else {
      console.log('\n🎉 All files are healthy!');
      console.log('No corruption detected. Your PocketCloud is in good shape.');
    }
    
  } catch (error) {
    console.error('❌ Scan failed:', error.message);
    process.exit(1);
  }
}

async function cleanupAllCorrupted() {
  console.log('🧹 Cleaning up all corrupted files...');
  
  try {
    const db = getDatabase();
    const userResult = db.exec('SELECT DISTINCT user_id FROM files');
    
    if (userResult.length === 0 || userResult[0].values.length === 0) {
      console.log('ℹ️  No users found');
      return;
    }
    
    const userIds = userResult[0].values.map(row => row[0]);
    let totalCleaned = 0;
    
    for (const userId of userIds) {
      const corruptedFiles = getCorruptedFiles(userId);
      
      for (const file of corruptedFiles) {
        console.log(`🗑️  Cleaning up: ${file.filename}`);
        const result = await cleanupCorruptedFile(file.id, userId);
        
        if (result.success) {
          totalCleaned++;
          console.log(`   ✅ Cleaned successfully`);
        } else {
          console.log(`   ❌ Failed: ${result.reason}`);
        }
      }
    }
    
    console.log(`\n✅ Cleanup complete! Removed ${totalCleaned} corrupted files.`);
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    process.exit(1);
  }
}

// Command line interface
const command = process.argv[2];

if (command === 'cleanup') {
  cleanupAllCorrupted().catch(console.error);
} else {
  scanAndReport().catch(console.error);
}