#!/usr/bin/env node
/**
 * PocketCloud status checker
 * Usage: node scripts/status.js
 * Returns human-readable status
 */

const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

function checkHealth() {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${HOST}:${PORT}/health`, { timeout: 5000 }, (res) => {
      let data = '';
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const health = JSON.parse(data);
          resolve({ statusCode: res.statusCode, health });
        } catch (error) {
          reject(new Error('Invalid JSON response'));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Health check timeout'));
    });
  });
}

async function main() {
  console.log('Checking PocketCloud status...');
  console.log('');
  
  try {
    const { statusCode, health } = await checkHealth();
    
    if (statusCode === 200 && health.status === 'healthy') {
      console.log('✓ PocketCloud is HEALTHY');
      console.log('');
      console.log('Components:');
      console.log(`  Database:   ${health.checks.database ? '✓' : '✗'}`);
      console.log(`  Storage:    ${health.checks.storage ? '✓' : '✗'}`);
      console.log(`  Encryption: ${health.checks.encryption ? '✓' : '✗'}`);
      console.log('');
      console.log(`Checked at: ${health.timestamp}`);
      process.exit(0);
    } else {
      console.log('✗ PocketCloud is UNHEALTHY');
      console.log('');
      console.log('Components:');
      console.log(`  Database:   ${health.checks.database ? '✓' : '✗'}`);
      console.log(`  Storage:    ${health.checks.storage ? '✓' : '✗'}`);
      console.log(`  Encryption: ${health.checks.encryption ? '✓' : '✗'}`);
      console.log('');
      
      if (health.failures && health.failures.length > 0) {
        console.log('Failures:');
        health.failures.forEach(f => {
          console.log(`  ${f.component}: ${f.reason}`);
        });
        console.log('');
      }
      
      console.log('Action: Restart PocketCloud');
      console.log('  sudo systemctl restart pocketcloud');
      process.exit(1);
    }
  } catch (error) {
    console.log('✗ PocketCloud is NOT RESPONDING');
    console.log('');
    console.log('Error:', error.message);
    console.log('');
    console.log('Possible causes:');
    console.log('  - PocketCloud is not running');
    console.log('  - Port is blocked');
    console.log('  - Server is starting up');
    console.log('');
    console.log('Check status:');
    console.log('  sudo systemctl status pocketcloud');
    console.log('');
    console.log('Check logs:');
    console.log('  sudo journalctl -u pocketcloud -n 50');
    process.exit(1);
  }
}

main();
