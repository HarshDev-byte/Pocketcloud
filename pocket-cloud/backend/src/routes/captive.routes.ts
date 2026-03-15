/**
 * Captive Portal Routes for PocketCloud
 * Handles all OS captive portal detection probes and redirects to app
 * Supports iOS, macOS, Android, Windows, Firefox, and Linux
 */

import { Router, Request, Response } from 'express';
import { networkService } from '../services/network.service.js';

const router = Router();

/**
 * Apple iOS/macOS/tvOS Captive Portal Detection
 * These endpoints are checked by Apple devices to detect captive portals
 */
router.get('/hotspot-detect.html', (req: Request, res: Response) => {
  const userAgent = req.get('User-Agent') || '';
  
  // If it's CaptiveNetworkSupport, they're checking connectivity
  if (userAgent.includes('CaptiveNetworkSupport')) {
    // Return success page that redirects to app
    res.send(`<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success<script>if(window.location.hostname !== '192.168.4.1') {window.location.href = 'http://192.168.4.1';}</script></BODY></HTML>`);
  } else {
    // Regular browser - show captive portal page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>PocketCloud Drive</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
            text-align: center; 
            padding: 20px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container { 
            max-width: 400px; 
            background: rgba(255,255,255,0.1);
            padding: 40px;
            border-radius: 20px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.2);
          }
          .logo { font-size: 64px; margin-bottom: 20px; }
          .title { font-size: 28px; font-weight: bold; margin-bottom: 10px; }
          .subtitle { font-size: 16px; opacity: 0.9; margin-bottom: 30px; }
          .button {
            display: inline-block;
            padding: 16px 32px;
            background: rgba(255,255,255,0.2);
            color: white;
            text-decoration: none;
            border-radius: 12px;
            font-weight: bold;
            border: 1px solid rgba(255,255,255,0.3);
            font-size: 18px;
            transition: all 0.3s ease;
          }
          .button:hover {
            background: rgba(255,255,255,0.3);
            transform: translateY(-2px);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">☁️</div>
          <div class="title">Welcome to PocketCloud</div>
          <div class="subtitle">Your personal portable cloud storage</div>
          <a href="http://192.168.4.1" class="button">Open PocketCloud →</a>
        </div>
      </body>
      </html>
    `);
  }
});

router.get('/library/test/success.html', (req: Request, res: Response) => {
  res.send(`<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success<script>if(window.location.hostname !== '192.168.4.1') {window.location.href = 'http://192.168.4.1';}</script></BODY></HTML>`);
});

router.get('/success.txt', (req: Request, res: Response) => {
  res.send('200 OK');
});

/**
 * Android (AOSP, Google) Captive Portal Detection
 * Android expects 204 status for no captive portal
 */
router.get('/generate_204', (req: Request, res: Response) => {
  res.status(204).end();
});

router.get('/connectivitycheck.gstatic.com/generate_204', (req: Request, res: Response) => {
  res.status(204).end();
});

router.get('/connectivitycheck.android.com/generate_204', (req: Request, res: Response) => {
  res.status(204).end();
});

/**
 * Windows (NCSI) Captive Portal Detection
 * Windows Network Connectivity Status Indicator
 */
router.get('/ncsi.txt', (req: Request, res: Response) => {
  res.send('Microsoft NCSI');
});

router.get('/redirect', (req: Request, res: Response) => {
  res.redirect('http://192.168.4.1');
});

router.get('/connecttest.txt', (req: Request, res: Response) => {
  res.send('Microsoft Connect Test');
});

/**
 * Firefox Captive Portal Detection
 */
router.get('/canonical.html', (req: Request, res: Response) => {
  res.redirect('http://192.168.4.1');
});

/**
 * Fallback: Handle requests to known connectivity check domains
 * dnsmasq routes all domains to 192.168.4.1, so these will hit us
 */
router.use((req: Request, res: Response, next) => {
  const host = req.hostname;
  const captiveHosts = [
    'captive.apple.com',
    'www.apple.com',
    'connectivitycheck.gstatic.com',
    'connectivitycheck.android.com',
    'www.msftconnecttest.com',
    'www.msftncsi.com'
  ];
  
  if (captiveHosts.includes(host)) {
    return res.redirect('http://192.168.4.1');
  }
  
  next();
});

export default router;