/**
 * Startup cleanup task
 * Runs once when server starts
 * Cleans up orphaned temp files and validates system state
 * Integrated with failure detection and recovery system
 */

const fs = require('fs-extra');
const path = require('path');
const config = require('../config/config');
const { performStartupCleanup, validateSafeState } = require('../services/failureDrills');

async function startupCleanup() {
  console.log('Running startup cleanup...');
  
  try {
    // Perform automated cleanup using failure drills system
    const cleanupResults = await performStartupCleanup();
    
    // Log cleanup results
    if (cleanupResults.tempFilesRemoved > 0) {
      console.log(`✓ Cleaned up ${cleanupResults.tempFilesRemoved} temp file(s)`);
    }
    
    if (cleanupResults.orphanedEntriesRemoved > 0) {
      console.log(`✓ Cleaned up ${cleanupResults.orphanedEntriesRemoved} orphaned database entries`);
    }
    
    if (cleanupResults.errors.length > 0) {
      console.warn('Cleanup warnings:');
      cleanupResults.errors.forEach(error => console.warn(`  - ${error}`));
    }
    
    if (cleanupResults.tempFilesRemoved === 0 && cleanupResults.orphanedEntriesRemoved === 0) {
      console.log('✓ No cleanup needed');
    }
    
    // Validate system is in safe state
    const safeState = await validateSafeState();
    
    if (!safeState.safe) {
      console.error('System state validation failed:');
      safeState.issues.forEach(issue => {
        console.error(`  - ${issue.type}: ${issue.error || issue.reason || 'Unknown issue'}`);
      });
      
      if (safeState.summary.critical > 0) {
        console.error('CRITICAL: System has critical issues that require manual intervention');
        process.exit(1);
      }
    } else {
      console.log('✓ System state validated - all checks passed');
    }
    
    return {
      success: true,
      cleanupResults,
      safeState
    };
    
  } catch (error) {
    console.error('Startup cleanup failed:', error.message);
    // Don't fail startup if cleanup fails, but log the error
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = { startupCleanup };
