/**
 * Deno example using Pocket Cloud SDK
 */

import { PocketCloudClient } from 'npm:pocketcloud-sdk';

// Deno-specific file operations
async function uploadFileFromDeno() {
  const client = new PocketCloudClient({
    baseUrl: 'http://192.168.4.1:3000',
    apiKey: Deno.env.get('POCKETCLOUD_API_KEY')!
  });

  try {
    // Read file using Deno APIs
    const fileData = await Deno.readFile('./example.txt');
    
    // Upload using SDK
    const file = await client.upload.file(fileData, {
      onProgress: ({ percent, speed }) => {
        const speedMB = (speed / 1024 / 1024).toFixed(1);
        console.log(`Upload progress: ${percent}% @ ${speedMB} MB/s`);
      }
    });

    console.log('File uploaded:', file.name);

    // List files
    const files = await client.files.list();
    console.log(`Total files: ${files.files.length}`);

    // Search for files
    const searchResults = await client.search.query('example');
    console.log(`Search results: ${searchResults.total}`);

    // Real-time events
    const rt = client.realtime.connect();
    rt.on('file:created', (event) => {
      console.log('New file created:', event.data.file.name);
    });

    // Keep connection alive for 30 seconds
    setTimeout(() => {
      rt.disconnect();
      console.log('Disconnected from real-time events');
    }, 30000);

  } catch (error) {
    console.error('Error:', error);
  }
}

// Run example
if (import.meta.main) {
  await uploadFileFromDeno();
}