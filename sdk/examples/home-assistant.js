/**
 * Home Assistant webhook receiver for Pocket Cloud Drive
 */

const express = require('express');
const crypto = require('crypto');
const app = express();

app.use(express.json());

// Webhook secret (set in Pocket Cloud Drive webhook config)
const WEBHOOK_SECRET = process.env.POCKETCLOUD_WEBHOOK_SECRET || 'your-secret-here';

/**
 * Verify webhook signature
 */
function verifySignature(payload, signature, secret) {
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Handle Pocket Cloud Drive webhooks
 */
app.post('/webhook/pocketcloud', (req, res) => {
  const signature = req.headers['x-pocketcloud-signature'];
  const payload = JSON.stringify(req.body);
  
  // Verify signature
  if (!verifySignature(payload, signature, WEBHOOK_SECRET)) {
    console.log('Invalid webhook signature');
    return res.status(401).send('Invalid signature');
  }
  
  const event = req.body;
  console.log('Received webhook:', event.type);
  
  // Handle different event types
  switch (event.type) {
    case 'file.created':
      handleFileCreated(event.data);
      break;
    case 'file.updated':
      handleFileUpdated(event.data);
      break;
    case 'upload.complete':
      handleUploadComplete(event.data);
      break;
    case 'storage.warning':
      handleStorageWarning(event.data);
      break;
    default:
      console.log('Unhandled event type:', event.type);
  }
  
  res.status(200).send('OK');
});

function handleFileCreated(data) {
  const file = data.file;
  console.log(`New file uploaded: ${file.name} (${file.size} bytes)`);
  
  // Send notification to Home Assistant
  // You can use Home Assistant's REST API or MQTT
}

function handleUploadComplete(data) {
  console.log(`Upload completed: ${data.filename}`);
}

function handleStorageWarning(data) {
  console.log(`Storage warning: ${data.storage.usagePercentage}% full`);
  
  // Send critical alert to Home Assistant
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Webhook receiver listening on port ${PORT}`);
});