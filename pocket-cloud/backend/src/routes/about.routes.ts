import { Router } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';

const router = Router();

// Serve the landing page at /about
router.get('/about', (req, res) => {
  try {
    // Read the landing page HTML file
    const htmlPath = join(__dirname, '../../../../docs/website/index.html');
    const html = readFileSync(htmlPath, 'utf8');
    
    // Set appropriate headers
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    // Send the HTML
    res.send(html);
    
  } catch (error) {
    console.error('Failed to serve landing page:', error);
    
    // Fallback HTML if file not found
    const fallbackHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PocketCloud Drive</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
            background: #0a0f1e; 
            color: white; 
            text-align: center; 
            padding: 2rem; 
        }
        .container { max-width: 600px; margin: 0 auto; }
        h1 { font-size: 2.5rem; margin-bottom: 1rem; }
        p { font-size: 1.125rem; color: #94a3b8; margin-bottom: 2rem; }
        .btn { 
            display: inline-block; 
            padding: 1rem 2rem; 
            background: #3b82f6; 
            color: white; 
            text-decoration: none; 
            border-radius: 0.5rem; 
            margin: 0.5rem; 
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🥧 PocketCloud Drive</h1>
        <p>Your own cloud. In your pocket. Offline forever.</p>
        <p>A Raspberry Pi 4B running a full personal cloud server.</p>
        <a href="/" class="btn">Open PocketCloud</a>
        <a href="https://github.com/pocketcloud/pocketcloud" class="btn">View on GitHub</a>
    </div>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(fallbackHtml);
  }
});

// Serve the OG image
router.get('/og-image.svg', (req, res) => {
  try {
    const svgPath = join(__dirname, '../../../../docs/website/og-image.svg');
    const svg = readFileSync(svgPath, 'utf8');
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.send(svg);
    
  } catch (error) {
    console.error('Failed to serve OG image:', error);
    res.status(404).send('Image not found');
  }
});

export default router;