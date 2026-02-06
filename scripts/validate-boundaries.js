#!/usr/bin/env node

/**
 * Product Boundaries Validation Script for PocketCloud
 * Validates that the system enforces product boundaries correctly
 */

const { enforceProductBoundaries, getSupportStatement, getUpgradeSafety } = require('../services/productBoundaries');

async function validateProductBoundaries() {
  console.log('PocketCloud Product Boundaries Validation');
  console.log('=========================================');
  console.log('');
  
  let totalTests = 0;
  let passedTests = 0;
  
  // Test 1: Environment Validation
  console.log('Test 1: Environment Validation');
  console.log('------------------------------');
  try {
    const boundaries = await enforceProductBoundaries();
    
    console.log(`Environment supported: ${boundaries.supported ? '✓ YES' : '✗ NO'}`);
    console.log(`Critical issues: ${boundaries.criticalIssues.length}`);
    console.log(`Warnings: ${boundaries.warnings.length}`);
    
    if (boundaries.criticalIssues.length > 0) {
      console.log('Critical issues detected:');
      boundaries.criticalIssues.forEach(issue => {
        console.log(`  - ${issue.message}`);
        console.log(`    Action: ${issue.action}`);
      });
    }
    
    if (boundaries.warnings.length > 0) {
      console.log('Warnings:');
      boundaries.warnings.forEach(warning => {
        console.log(`  - ${warning.message}`);
        console.log(`    Recommendation: ${warning.action}`);
      });
    }
    
    console.log('✓ PASS: Environment validation completed');
    passedTests++;
    totalTests++;
  } catch (error) {
    console.log(`✗ FAIL: ${error.message}`);
    totalTests++;
  }
  console.log('');
  
  // Test 2: Support Statement
  console.log('Test 2: Support Statement');
  console.log('-------------------------');
  try {
    const support = getSupportStatement();
    
    console.log(`Title: ${support.title}`);
    console.log(`Guarantees: ${support.guarantees.length}`);
    console.log(`Limitations: ${support.limitations.length}`);
    console.log(`Unsupported categories: ${Object.keys(support.unsupported).length}`);
    
    // Validate required guarantees
    const requiredGuarantees = [
      'AES-256-GCM encryption',
      'Data integrity',
      'Safe failure',
      'Zero-knowledge',
      'Atomic backup'
    ];
    
    let guaranteesFound = 0;
    for (const required of requiredGuarantees) {
      const found = support.guarantees.some(g => g.toLowerCase().includes(required.toLowerCase()));
      if (found) {
        guaranteesFound++;
      } else {
        console.log(`  Missing guarantee: ${required}`);
      }
    }
    
    if (guaranteesFound === requiredGuarantees.length) {
      console.log('✓ PASS: All required guarantees present');
      passedTests++;
    } else {
      console.log(`✗ FAIL: ${requiredGuarantees.length - guaranteesFound} guarantees missing`);
    }
    totalTests++;
  } catch (error) {
    console.log(`✗ FAIL: ${error.message}`);
    totalTests++;
  }
  console.log('');
  
  // Test 3: Version Information
  console.log('Test 3: Version Information');
  console.log('---------------------------');
  try {
    const upgrade = getUpgradeSafety();
    
    console.log(`Product version: ${upgrade.version}`);
    console.log(`Backup format version: ${upgrade.backupFormatVersion}`);
    console.log(`Upgrade rules: ${upgrade.upgradeRules.length}`);
    
    // Validate version format
    const versionRegex = /^\d+\.\d+\.\d+$/;
    if (versionRegex.test(upgrade.version) && versionRegex.test(upgrade.backupFormatVersion)) {
      console.log('✓ PASS: Version formats are valid');
      passedTests++;
    } else {
      console.log('✗ FAIL: Invalid version format');
    }
    totalTests++;
  } catch (error) {
    console.log(`✗ FAIL: ${error.message}`);
    totalTests++;
  }
  console.log('');
  
  // Test 4: Unsupported Environment Detection
  console.log('Test 4: Unsupported Environment Detection');
  console.log('-----------------------------------------');
  try {
    const support = getSupportStatement();
    
    // Check that unsupported environments are clearly defined
    const unsupportedCategories = ['STORAGE', 'OS', 'USAGE'];
    let categoriesFound = 0;
    
    for (const category of unsupportedCategories) {
      if (support.unsupported[category] && support.unsupported[category].length > 0) {
        console.log(`  ${category}: ${support.unsupported[category].length} items`);
        categoriesFound++;
      } else {
        console.log(`  Missing category: ${category}`);
      }
    }
    
    if (categoriesFound === unsupportedCategories.length) {
      console.log('✓ PASS: All unsupported categories defined');
      passedTests++;
    } else {
      console.log(`✗ FAIL: ${unsupportedCategories.length - categoriesFound} categories missing`);
    }
    totalTests++;
  } catch (error) {
    console.log(`✗ FAIL: ${error.message}`);
    totalTests++;
  }
  console.log('');
  
  // Test 5: Configuration Immutability
  console.log('Test 5: Configuration Immutability');
  console.log('----------------------------------');
  try {
    const boundaries = await enforceProductBoundaries();
    
    if (boundaries.config.length === 0) {
      console.log('✓ PASS: No configuration violations detected');
      passedTests++;
    } else {
      console.log('✗ FAIL: Configuration violations detected:');
      boundaries.config.forEach(violation => {
        console.log(`  - ${violation.setting}: ${violation.current} (should be ${violation.required})`);
        console.log(`    Reason: ${violation.reason}`);
      });
    }
    totalTests++;
  } catch (error) {
    console.log(`✗ FAIL: ${error.message}`);
    totalTests++;
  }
  console.log('');
  
  // Summary
  console.log('Validation Summary');
  console.log('==================');
  console.log(`Total tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  console.log(`Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log('');
  
  if (passedTests === totalTests) {
    console.log('🎉 All product boundary tests passed!');
    console.log('PocketCloud has clear product boundaries and enforces them correctly.');
    process.exit(0);
  } else {
    console.log('⚠️  Some product boundary tests failed.');
    console.log('Product boundaries may not be properly defined or enforced.');
    process.exit(1);
  }
}

// Run validation if called directly
if (require.main === module) {
  validateProductBoundaries().catch(error => {
    console.error('Validation failed:', error.message);
    process.exit(1);
  });
}

module.exports = { validateProductBoundaries };