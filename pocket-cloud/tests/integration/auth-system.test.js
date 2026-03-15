#!/usr/bin/env node

/**
 * Test script for the authentication system
 * Verifies all components work together
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

async function testAuthSystem() {
  console.log('🔐 Testing PocketCloud Authentication System');
  console.log('==========================================\n');

  try {
    // Test 1: Login with invalid credentials
    console.log('1. Testing login with invalid credentials...');
    const invalidLogin = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'invalid', password: 'wrong' })
    });
    
    const invalidResult = await invalidLogin.json();
    if (invalidLogin.status === 401 && invalidResult.error === 'Invalid credentials') {
      console.log('✅ Invalid login correctly rejected\n');
    } else {
      console.log('❌ Invalid login test failed\n');
    }

    // Test 2: Test rate limiting
    console.log('2. Testing rate limiting (5 requests per minute)...');
    let rateLimitHit = false;
    for (let i = 0; i < 6; i++) {
      const response = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'test', password: 'test' })
      });
      
      if (response.status === 429) {
        rateLimitHit = true;
        break;
      }
    }
    
    if (rateLimitHit) {
      console.log('✅ Rate limiting working correctly\n');
    } else {
      console.log('❌ Rate limiting not working\n');
    }

    // Test 3: Test /me endpoint without authentication
    console.log('3. Testing /me endpoint without authentication...');
    const meWithoutAuth = await fetch(`${BASE_URL}/api/auth/me`);
    
    if (meWithoutAuth.status === 401) {
      console.log('✅ /me endpoint correctly requires authentication\n');
    } else {
      console.log('❌ /me endpoint should require authentication\n');
    }

    // Test 4: Test logout without session
    console.log('4. Testing logout without session...');
    const logoutWithoutSession = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST'
    });
    
    const logoutResult = await logoutWithoutSession.json();
    if (logoutWithoutSession.status === 200 && logoutResult.success) {
      console.log('✅ Logout works without session\n');
    } else {
      console.log('❌ Logout should work without session\n');
    }

    console.log('🎉 Authentication system tests completed!');
    console.log('\nTo test with a real admin user:');
    console.log('1. Run: npx tsx scripts/create-admin.ts');
    console.log('2. Create an admin user');
    console.log('3. Visit http://localhost:3000/login');
    console.log('4. Login with your admin credentials');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\nMake sure the PocketCloud server is running:');
    console.log('cd pocket-cloud/backend && npm run dev');
  }
}

// Run tests
testAuthSystem();