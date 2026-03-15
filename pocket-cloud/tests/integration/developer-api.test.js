#!/usr/bin/env node

/**
 * Test script for Developer API endpoints
 * Tests the core functionality without TypeScript compilation
 */

const http = require('http');
const querystring = require('querystring');

const BASE_URL = 'http://localhost:3000';
let sessionCookie = '';
let testApiKey = '';

// Helper function to make HTTP requests
function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Developer-API-Test/1.0',
        ...headers
      }
    };

    if (sessionCookie) {
      options.headers['Cookie'] = sessionCookie;
    }

    const req = http.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        // Capture session cookie from login
        if (res.headers['set-cookie']) {
          const cookies = res.headers['set-cookie'];
          const sessionCookieHeader = cookies.find(cookie => cookie.startsWith('pcd_session='));
          if (sessionCookieHeader) {
            sessionCookie = sessionCookieHeader.split(';')[0];
          }
        }

        try {
          const jsonBody = body ? JSON.parse(body) : {};
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: jsonBody
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Test functions
async function testLogin() {
  console.log('🔐 Testing login...');
  
  const response = await makeRequest('POST', '/api/auth/login', {
    username: 'admin',
    password: 'admin123'
  });

  if (response.statusCode === 200 && response.body.success) {
    console.log('✅ Login successful');
    return true;
  } else {
    console.log('❌ Login failed:', response.body);
    return false;
  }
}

async function testCreateApiKey() {
  console.log('🔑 Testing API key creation...');
  
  const response = await makeRequest('POST', '/api/developer/keys', {
    name: 'Test API Key',
    scopes: ['files:read', 'files:write'],
    expiresInDays: 30
  });

  if (response.statusCode === 200 && response.body.success) {
    testApiKey = response.body.data.key;
    console.log('✅ API key created:', response.body.data.prefix + '...');
    return true;
  } else {
    console.log('❌ API key creation failed:', response.body);
    return false;
  }
}

async function testApiKeyAuth() {
  console.log('🔓 Testing API key authentication...');
  
  const response = await makeRequest('GET', '/api/v1/user', null, {
    'Authorization': `Bearer ${testApiKey}`
  });

  if (response.statusCode === 200 && response.body.success) {
    console.log('✅ API key authentication successful');
    console.log('   User:', response.body.data.username);
    return true;
  } else {
    console.log('❌ API key authentication failed:', response.body);
    return false;
  }
}

async function testFilesEndpoint() {
  console.log('📁 Testing files endpoint...');
  
  const response = await makeRequest('GET', '/api/v1/files', null, {
    'Authorization': `Bearer ${testApiKey}`
  });

  if (response.statusCode === 200 && response.body.success) {
    console.log('✅ Files endpoint working');
    console.log('   Files count:', response.body.data.files.length);
    return true;
  } else {
    console.log('❌ Files endpoint failed:', response.body);
    return false;
  }
}

async function testStorageEndpoint() {
  console.log('💾 Testing storage endpoint...');
  
  const response = await makeRequest('GET', '/api/v1/storage', null, {
    'Authorization': `Bearer ${testApiKey}`
  });

  if (response.statusCode === 200 && response.body.success) {
    console.log('✅ Storage endpoint working');
    console.log('   Used space:', Math.round(response.body.data.usedBytes / 1024 / 1024) + ' MB');
    return true;
  } else {
    console.log('❌ Storage endpoint failed:', response.body);
    return false;
  }
}

async function testRateLimit() {
  console.log('⏱️ Testing rate limiting...');
  
  // Make multiple rapid requests to test rate limiting
  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(makeRequest('GET', '/api/v1/user', null, {
      'Authorization': `Bearer ${testApiKey}`
    }));
  }

  const responses = await Promise.all(promises);
  const hasRateLimitHeaders = responses.every(r => 
    r.headers['x-ratelimit-limit'] && r.headers['x-ratelimit-remaining']
  );

  if (hasRateLimitHeaders) {
    console.log('✅ Rate limiting headers present');
    console.log('   Limit:', responses[0].headers['x-ratelimit-limit']);
    console.log('   Remaining:', responses[0].headers['x-ratelimit-remaining']);
    return true;
  } else {
    console.log('❌ Rate limiting headers missing');
    return false;
  }
}

async function testApiKeyList() {
  console.log('📋 Testing API key listing...');
  
  const response = await makeRequest('GET', '/api/developer/keys');

  if (response.statusCode === 200 && response.body.success) {
    console.log('✅ API key listing working');
    console.log('   Keys count:', response.body.data.length);
    return true;
  } else {
    console.log('❌ API key listing failed:', response.body);
    return false;
  }
}

async function testApiScopes() {
  console.log('🔒 Testing API scopes endpoint...');
  
  const response = await makeRequest('GET', '/api/developer/scopes');

  if (response.statusCode === 200 && response.body.success) {
    console.log('✅ API scopes endpoint working');
    console.log('   Available scopes:', response.body.data.length);
    return true;
  } else {
    console.log('❌ API scopes endpoint failed:', response.body);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting Developer API Tests\n');
  
  const tests = [
    testLogin,
    testApiScopes,
    testCreateApiKey,
    testApiKeyAuth,
    testFilesEndpoint,
    testStorageEndpoint,
    testRateLimit,
    testApiKeyList
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await test();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.log('❌ Test error:', error.message);
      failed++;
    }
    console.log(''); // Empty line between tests
  }

  console.log('📊 Test Results:');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Success Rate: ${Math.round(passed / (passed + failed) * 100)}%`);

  if (failed === 0) {
    console.log('\n🎉 All Developer API tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️ Some tests failed. Check the backend server status.');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Test interrupted');
  process.exit(1);
});

// Run tests
runTests().catch(error => {
  console.error('💥 Test runner error:', error);
  process.exit(1);
});