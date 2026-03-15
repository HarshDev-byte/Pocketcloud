#!/usr/bin/env node

/**
 * Test script for Webhook and Automation System
 * Tests webhook creation, event delivery, and integration
 */

const http = require('http');
const crypto = require('crypto');

const BASE_URL = 'http://localhost:3000';
let sessionCookie = '';
let testWebhookId = '';
let testWebhookSecret = '';

// Simple webhook receiver server
let webhookServer;
let receivedWebhooks = [];

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
        'User-Agent': 'Webhook-Test/1.0',
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

// Start webhook receiver server
function startWebhookReceiver() {
  return new Promise((resolve) => {
    webhookServer = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/webhook') {
        let body = '';
        
        req.on('data', (chunk) => {
          body += chunk;
        });
        
        req.on('end', () => {
          try {
            const signature = req.headers['x-pocketcloud-signature'];
            const eventType = req.headers['x-pocketcloud-event'];
            const deliveryId = req.headers['x-pocketcloud-delivery'];
            
            // Verify signature if we have a secret
            if (testWebhookSecret && signature) {
              const expectedSignature = 'sha256=' + crypto
                .createHmac('sha256', testWebhookSecret)
                .update(body)
                .digest('hex');
              
              if (signature !== expectedSignature) {
                console.log('❌ Invalid webhook signature');
                res.writeHead(401);
                res.end('Invalid signature');
                return;
              }
            }
            
            const payload = JSON.parse(body);
            receivedWebhooks.push({
              signature,
              eventType,
              deliveryId,
              payload,
              timestamp: Date.now()
            });
            
            console.log(`📨 Received webhook: ${eventType} (${deliveryId})`);
            
            res.writeHead(200);
            res.end('OK');
          } catch (error) {
            console.log('❌ Webhook parsing error:', error.message);
            res.writeHead(400);
            res.end('Bad Request');
          }
        });
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    webhookServer.listen(3001, () => {
      console.log('🎣 Webhook receiver listening on port 3001');
      resolve();
    });
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

async function testCreateWebhook() {
  console.log('🪝 Testing webhook creation...');
  
  const response = await makeRequest('POST', '/api/developer/webhooks', {
    name: 'Test Webhook',
    url: 'http://localhost:3001/webhook',
    events: ['file.created', 'upload.complete', 'upload.failed']
  });

  if (response.statusCode === 201 && response.body.success) {
    testWebhookId = response.body.data.id;
    testWebhookSecret = response.body.data.secret;
    console.log('✅ Webhook created:', response.body.data.name);
    console.log('   ID:', testWebhookId);
    console.log('   Secret:', testWebhookSecret.substring(0, 16) + '...');
    return true;
  } else {
    console.log('❌ Webhook creation failed:', response.body);
    return false;
  }
}

async function testListWebhooks() {
  console.log('📋 Testing webhook listing...');
  
  const response = await makeRequest('GET', '/api/developer/webhooks');

  if (response.statusCode === 200 && response.body.success) {
    console.log('✅ Webhooks listed successfully');
    console.log('   Count:', response.body.data.length);
    return true;
  } else {
    console.log('❌ Webhook listing failed:', response.body);
    return false;
  }
}

async function testWebhookEvents() {
  console.log('📅 Testing webhook events endpoint...');
  
  const response = await makeRequest('GET', '/api/developer/webhooks/events');

  if (response.statusCode === 200 && response.body.success) {
    console.log('✅ Webhook events listed successfully');
    console.log('   Available events:', response.body.data.length);
    return true;
  } else {
    console.log('❌ Webhook events failed:', response.body);
    return false;
  }
}

async function testWebhookTest() {
  console.log('🧪 Testing webhook test endpoint...');
  
  const response = await makeRequest('POST', `/api/developer/webhooks/${testWebhookId}/test`);

  if (response.statusCode === 200 && response.body.success) {
    console.log('✅ Test webhook sent successfully');
    
    // Wait a moment for webhook delivery
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if we received the test webhook
    const testWebhook = receivedWebhooks.find(wh => wh.eventType === 'test.ping');
    if (testWebhook) {
      console.log('✅ Test webhook received and verified');
      return true;
    } else {
      console.log('❌ Test webhook not received');
      return false;
    }
  } else {
    console.log('❌ Test webhook failed:', response.body);
    return false;
  }
}

async function testWebhookDeliveries() {
  console.log('📊 Testing webhook deliveries endpoint...');
  
  const response = await makeRequest('GET', `/api/developer/webhooks/${testWebhookId}/deliveries`);

  if (response.statusCode === 200 && response.body.success) {
    console.log('✅ Webhook deliveries retrieved successfully');
    console.log('   Deliveries count:', response.body.data.length);
    return true;
  } else {
    console.log('❌ Webhook deliveries failed:', response.body);
    return false;
  }
}

async function testFileUploadWebhook() {
  console.log('📤 Testing file upload webhook trigger...');
  
  // Create a simple test file upload
  const testContent = 'Hello, webhook world!';
  const testChecksum = crypto.createHash('sha256').update(testContent).digest('hex');
  
  // Initialize upload
  const initResponse = await makeRequest('POST', '/api/upload/init', {
    filename: 'webhook-test.txt',
    size: testContent.length,
    mimeType: 'text/plain',
    checksum: testChecksum
  });

  if (initResponse.statusCode !== 200) {
    console.log('❌ Upload init failed:', initResponse.body);
    return false;
  }

  const uploadId = initResponse.body.uploadId;
  console.log('   Upload initialized:', uploadId);

  // Wait for upload.started webhook
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const startedWebhook = receivedWebhooks.find(wh => 
    wh.eventType === 'upload.started' && 
    wh.payload.data.upload.id === uploadId
  );
  
  if (startedWebhook) {
    console.log('✅ upload.started webhook received');
  } else {
    console.log('⚠️ upload.started webhook not received');
  }

  // Upload single chunk (small file)
  const chunkResponse = await makeRequest('PUT', `/api/upload/${uploadId}/chunk/0`, testContent, {
    'Content-Type': 'application/octet-stream'
  });

  if (chunkResponse.statusCode !== 200) {
    console.log('❌ Chunk upload failed:', chunkResponse.body);
    return false;
  }

  // Complete upload
  const completeResponse = await makeRequest('POST', `/api/upload/${uploadId}/complete`);

  if (completeResponse.statusCode !== 200) {
    console.log('❌ Upload complete failed:', completeResponse.body);
    return false;
  }

  console.log('   Upload completed successfully');

  // Wait for webhooks
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Check for upload.complete webhook
  const completeWebhook = receivedWebhooks.find(wh => 
    wh.eventType === 'upload.complete' && 
    wh.payload.data.upload.id === uploadId
  );

  // Check for file.created webhook
  const createdWebhook = receivedWebhooks.find(wh => 
    wh.eventType === 'file.created' && 
    wh.payload.data.file.name === 'webhook-test.txt'
  );

  if (completeWebhook && createdWebhook) {
    console.log('✅ upload.complete and file.created webhooks received');
    return true;
  } else {
    console.log('❌ Expected webhooks not received');
    console.log('   upload.complete:', !!completeWebhook);
    console.log('   file.created:', !!createdWebhook);
    return false;
  }
}

async function testWebhookUpdate() {
  console.log('✏️ Testing webhook update...');
  
  const response = await makeRequest('PATCH', `/api/developer/webhooks/${testWebhookId}`, {
    name: 'Updated Test Webhook'
  });

  if (response.statusCode === 200 && response.body.success) {
    console.log('✅ Webhook updated successfully');
    return true;
  } else {
    console.log('❌ Webhook update failed:', response.body);
    return false;
  }
}

async function testWebhookDelete() {
  console.log('🗑️ Testing webhook deletion...');
  
  const response = await makeRequest('DELETE', `/api/developer/webhooks/${testWebhookId}`);

  if (response.statusCode === 200 && response.body.success) {
    console.log('✅ Webhook deleted successfully');
    return true;
  } else {
    console.log('❌ Webhook deletion failed:', response.body);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting Webhook System Tests\n');
  
  // Start webhook receiver
  await startWebhookReceiver();
  
  const tests = [
    testLogin,
    testWebhookEvents,
    testCreateWebhook,
    testListWebhooks,
    testWebhookTest,
    testWebhookDeliveries,
    testFileUploadWebhook,
    testWebhookUpdate,
    testWebhookDelete
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

  console.log('\n📨 Received Webhooks Summary:');
  const eventCounts = {};
  receivedWebhooks.forEach(wh => {
    eventCounts[wh.eventType] = (eventCounts[wh.eventType] || 0) + 1;
  });
  
  Object.entries(eventCounts).forEach(([event, count]) => {
    console.log(`   ${event}: ${count}`);
  });

  // Cleanup
  if (webhookServer) {
    webhookServer.close();
    console.log('\n🧹 Webhook receiver stopped');
  }

  if (failed === 0) {
    console.log('\n🎉 All webhook system tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️ Some tests failed. Check the backend server status.');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Test interrupted');
  if (webhookServer) {
    webhookServer.close();
  }
  process.exit(1);
});

// Run tests
runTests().catch(error => {
  console.error('💥 Test runner error:', error);
  if (webhookServer) {
    webhookServer.close();
  }
  process.exit(1);
});