import { Router, Request, Response } from 'express';
import { NetworkService } from '../services/network.service';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import { networkLimiter } from '../middleware/ratelimit.middleware';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/network/status - Get current network status (PUBLIC - no auth required)
router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = await NetworkService.getNetworkStatus();
    res.json(status);
  } catch (err: any) {
    logger.error('Failed to get network status', { error: err.message });
    res.status(500).json({ 
      error: 'NETWORK_STATUS_FAILED', 
      message: 'Failed to get network status' 
    });
  }
});

// GET /api/network/wifi/scan - Scan for WiFi networks (SSE stream)
router.get('/wifi/scan', requireAdmin, networkLimiter, async (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    send({ status: 'scanning', message: 'Scanning for WiFi networks...' });
    
    const networks = await NetworkService.scanWifiNetworks();
    
    send({ status: 'success', networks });
  } catch (err: any) {
    logger.error('WiFi scan failed', { error: err.message });
    send({ status: 'error', message: err.message || 'WiFi scan failed' });
  }

  res.end();
});

// POST /api/network/wifi/connect - Connect to WiFi network (SSE stream)
router.post('/wifi/connect', requireAdmin, networkLimiter, async (req: Request, res: Response) => {
  const { ssid, password } = req.body;

  if (!ssid || !password) {
    res.status(400).json({ 
      error: 'MISSING_PARAMS', 
      message: 'SSID and password are required' 
    });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    send({ status: 'connecting', step: 'Preparing connection...' });

    // Write wpa config
    send({ status: 'connecting', step: `Connecting to "${ssid}"...` });
    
    // Attempt connection (this handles all steps internally)
    const result = await NetworkService.connectToWifi(ssid, password);

    if (result.success) {
      const port = process.env.PORT || 3000;
      send({ 
        status: 'success', 
        ip: result.ip, 
        ssid: result.ssid,
        accessUrls: [
          `http://${result.ip}:${port}`,
          `http://pocketcloud.local:${port}`
        ]
      });
    }
  } catch (err: any) {
    logger.error('WiFi connection failed', { error: err.message, ssid });
    send({ status: 'error', message: err.message || 'Connection failed' });
    
    // Hotspot is already restored by connectToWifi on failure
    send({ status: 'fallback', message: 'Hotspot restored. You are still connected.' });
  }

  res.end();
});

// POST /api/network/wifi/disconnect - Disconnect from WiFi and restore hotspot
router.post('/wifi/disconnect', requireAdmin, networkLimiter, async (req: Request, res: Response) => {
  try {
    await NetworkService.disconnectWifi();
    res.json({ 
      success: true, 
      message: 'Disconnected from WiFi. Hotspot restored.' 
    });
  } catch (err: any) {
    logger.error('WiFi disconnect failed', { error: err.message });
    res.status(500).json({ 
      error: 'DISCONNECT_FAILED', 
      message: err.message || 'Failed to disconnect from WiFi' 
    });
  }
});

// GET /api/network/hotspot - Get hotspot configuration (no password)
router.get('/hotspot', requireAuth, async (req: Request, res: Response) => {
  try {
    const config = NetworkService.getHotspotConfig();
    res.json(config);
  } catch (err: any) {
    logger.error('Failed to get hotspot config', { error: err.message });
    res.status(500).json({ 
      error: 'CONFIG_FAILED', 
      message: 'Failed to get hotspot configuration' 
    });
  }
});

// PATCH /api/network/hotspot - Update hotspot configuration
router.patch('/hotspot', requireAdmin, networkLimiter, async (req: Request, res: Response) => {
  const { ssid, password, channel, keepHotspot } = req.body;

  try {
    await NetworkService.updateHotspotConfig(ssid, password, channel, keepHotspot);
    res.json({ 
      success: true, 
      message: 'Hotspot configuration updated' 
    });
  } catch (err: any) {
    logger.error('Failed to update hotspot config', { error: err.message });
    
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ 
        error: err.code, 
        message: err.message 
      });
    } else {
      res.status(500).json({ 
        error: 'CONFIG_UPDATE_FAILED', 
        message: 'Failed to update hotspot configuration' 
      });
    }
  }
});

// POST /api/network/hotspot/restore - Force restore to hotspot mode
router.post('/hotspot/restore', requireAdmin, networkLimiter, async (req: Request, res: Response) => {
  try {
    await NetworkService.restoreHotspot();
    res.json({ 
      success: true, 
      message: 'Hotspot mode restored' 
    });
  } catch (err: any) {
    logger.error('Failed to restore hotspot', { error: err.message });
    res.status(500).json({ 
      error: 'RESTORE_FAILED', 
      message: err.message || 'Failed to restore hotspot mode' 
    });
  }
});

export default router;
