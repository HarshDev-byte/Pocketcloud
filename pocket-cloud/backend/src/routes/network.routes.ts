/**
 * Network management routes
 * Handles WiFi scanning, connection, hotspot control, and network mode switching
 * All routes require authentication except GET /api/network/status (for captive portal)
 */

import { Router, Request, Response } from 'express';
// Mock express-validator functions
const body = (field: string) => ({ run: () => Promise.resolve() });
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authMiddleware, requireAdmin } from '../middleware/auth.middleware.js';
import { networkService } from '../services/network.service.js';
import { auditService } from '../services/audit.service.js';
import { getDatabase } from '../db/client.js';

const router = Router();

// Rate limiter for WiFi connect attempts (3 attempts per 5 minutes per IP)
const wifiConnectLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // 3 attempts per window
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many WiFi connection attempts. Try again in 5 minutes.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation schemas
const wifiConnectSchema = z.object({
  ssid: z.string().min(1).max(32),
  password: z.string().min(8).max(63)
});

const hotspotConfigSchema = z.object({
  ssid: z.string().min(1).max(32).optional(),
  password: z.string().min(8).max(63).optional()
});

const networkModeSchema = z.object({
  mode: z.enum(['hotspot', 'client', 'ethernet']),
  keepHotspot: z.boolean().optional()
});

// Helper function for consistent error responses
function errorResponse(code: string, message: string) {
  return {
    success: false,
    error: { code, message }
  };
}

// Helper function for SSE streaming
function setupSSE(res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });
  
  const sendEvent = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  
  return { sendEvent };
}

/**
 * GET /api/network/status
 * Public endpoint - no authentication required (for captive portal)
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = await networkService.getNetworkStatus();
    res.json(status);
  } catch (error) {
    console.error('Network status error:', error);
    res.status(500).json(errorResponse('NETWORK_ERROR', 'Failed to get network status'));
  }
});

// Apply authentication to all other routes
router.use(authMiddleware);
router.use(requireAdmin);

/**
 * GET /api/network/wifi/scan
 * Requires auth. Admin only.
 * Uses SSE to stream scan progress
 */
router.get('/wifi/scan', async (req: Request, res: Response) => {
  const { sendEvent } = setupSSE(res);
  
  try {
    // Log audit event
    await auditService.log({
      user_id: req.userId!,
      action: 'wifi_scan',
      resource_type: 'network',
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      success: 1
    });
    
    sendEvent({ status: 'scanning' });
    
    const networks = await networkService.scanWifiNetworks();
    
    sendEvent({ 
      status: 'complete', 
      networks: networks.map(network => ({
        ssid: network.ssid,
        signal: network.signal,
        secured: network.secured,
        frequency: network.frequency
      }))
    });
    
    res.end();
  } catch (error) {
    console.error('WiFi scan error:', error);
    
    await auditService.log({
      user_id: req.userId!,
      action: 'wifi_scan',
      resource_type: 'network',
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      success: 0,
      error_message: error instanceof Error ? error.message : 'Unknown error'
    });
    
    sendEvent({ 
      status: 'error', 
      message: error instanceof Error ? error.message : 'WiFi scan failed' 
    });
    res.end();
  }
});

/**
 * POST /api/network/wifi/connect
 * Requires auth. Admin only.
 * Rate limited to 3 attempts per 5 minutes per IP
 * Uses SSE to stream connection progress
 */
router.post('/wifi/connect', wifiConnectLimiter, async (req: Request, res: Response) => {
  const { sendEvent } = setupSSE(res);
  
  try {
    // Validate input
    const { ssid, password } = wifiConnectSchema.parse(req.body);
    
    // Log audit event
    await auditService.log({
      user_id: req.userId!,
      action: 'wifi_connect',
      resource_type: 'network',
      resource_id: ssid,
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      success: 1
    });
    
    sendEvent({ status: 'connecting', message: 'Stopping hotspot...' });
    
    // Disable hotspot first
    try {
      await networkService.disableHotspot();
    } catch (error) {
      // Continue even if hotspot stop fails
    }
    
    sendEvent({ status: 'connecting', message: `Connecting to ${ssid}...` });
    
    sendEvent({ status: 'connecting', message: 'Waiting for IP address...' });
    
    const result = await networkService.connectToWifi(ssid, password);
    
    if (result.success) {
      sendEvent({ 
        status: 'success', 
        ip: result.ip,
        ssid: result.ssid
      });
      
      // Restart mDNS service
      try {
        await networkService.startMdns();
      } catch (error) {
        console.warn('Failed to restart mDNS:', error);
      }
    } else {
      sendEvent({ 
        status: 'error', 
        message: result.error || 'Connection failed'
      });
      sendEvent({ 
        status: 'fallback', 
        message: 'Restored hotspot mode'
      });
    }
    
    res.end();
  } catch (error) {
    console.error('WiFi connect error:', error);
    
    await auditService.log({
      user_id: req.userId!,
      action: 'wifi_connect',
      resource_type: 'network',
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      success: 0,
      error_message: error instanceof Error ? error.message : 'Unknown error'
    });
    
    if (error instanceof z.ZodError) {
      sendEvent({ 
        status: 'error', 
        message: 'Invalid input: ' + error.errors.map(e => e.message).join(', ')
      });
    } else {
      sendEvent({ 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Connection failed'
      });
      sendEvent({ 
        status: 'fallback', 
        message: 'Restored hotspot mode'
      });
    }
    
    res.end();
  }
});

/**
 * POST /api/network/wifi/disconnect
 * Requires auth. Admin only.
 */
router.post('/wifi/disconnect', async (req: Request, res: Response) => {
  try {
    await auditService.log({
      user_id: req.userId!,
      action: 'wifi_disconnect',
      resource_type: 'network',
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      success: 1
    });
    
    await networkService.disconnectWifi();
    
    res.json({ 
      success: true, 
      mode: 'hotspot' 
    });
  } catch (error) {
    console.error('WiFi disconnect error:', error);
    
    await auditService.log({
      user_id: req.userId!,
      action: 'wifi_disconnect',
      resource_type: 'network',
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      success: 0,
      error_message: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json(errorResponse('DISCONNECT_FAILED', 'Failed to disconnect from WiFi'));
  }
});

/**
 * GET /api/network/hotspot/config
 * Requires auth.
 * Returns hotspot config (never returns password in plain text)
 */
router.get('/hotspot/config', async (req: Request, res: Response) => {
  try {
    const config = await networkService.getNetworkConfig();
    const status = await networkService.getNetworkStatus();
    
    res.json({
      ssid: config.hotspot_ssid,
      passwordSet: !!config.hotspot_password,
      channel: 6, // Default channel
      active: status.hotspot.active
    });
  } catch (error) {
    console.error('Get hotspot config error:', error);
    res.status(500).json(errorResponse('CONFIG_ERROR', 'Failed to get hotspot configuration'));
  }
});

/**
 * PATCH /api/network/hotspot/config
 * Requires auth. Admin only.
 * Updates hotspot configuration and restarts hostapd
 */
router.patch('/hotspot/config', async (req: Request, res: Response) => {
  try {
    const { ssid, password } = hotspotConfigSchema.parse(req.body);
    
    const currentConfig = await networkService.getNetworkConfig();
    
    // Update configuration
    const updates: any = {};
    if (ssid) updates.hotspot_ssid = ssid;
    if (password) updates.hotspot_password = password;
    
    if (Object.keys(updates).length > 0) {
      await networkService.updateNetworkConfig(updates);
      
      // Log audit event
      await auditService.log({
        user_id: req.userId!,
        action: 'hotspot_config_update',
        resource_type: 'network',
        details: JSON.stringify({ ssid: ssid || currentConfig.hotspot_ssid }),
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        success: 1
      });
      
      // Restart hotspot with new config if currently active
      const status = await networkService.getNetworkStatus();
      if (status.hotspot.active) {
        await networkService.enableHotspot(
          ssid || currentConfig.hotspot_ssid,
          password || currentConfig.hotspot_password
        );
      }
    }
    
    res.json({ 
      success: true, 
      ssid: ssid || currentConfig.hotspot_ssid,
      reconnectIn: 5 // seconds until hotspot is back
    });
  } catch (error) {
    console.error('Update hotspot config error:', error);
    
    await auditService.log({
      user_id: req.userId!,
      action: 'hotspot_config_update',
      resource_type: 'network',
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      success: 0,
      error_message: error instanceof Error ? error.message : 'Unknown error'
    });
    
    if (error instanceof z.ZodError) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 
        'Invalid input: ' + error.errors.map(e => e.message).join(', ')));
    } else {
      res.status(500).json(errorResponse('CONFIG_UPDATE_FAILED', 'Failed to update hotspot configuration'));
    }
  }
});

/**
 * POST /api/network/mode
 * Requires auth. Admin only.
 * Switches network mode
 */
router.post('/mode', async (req: Request, res: Response) => {
  try {
    const { mode, keepHotspot } = networkModeSchema.parse(req.body);
    
    await auditService.log({
      user_id: req.userId!,
      action: 'network_mode_change',
      resource_type: 'network',
      details: JSON.stringify({ mode, keepHotspot }),
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      success: 1
    });
    
    // Update network configuration
    await networkService.updateNetworkConfig({ 
      mode,
      hotspot_also_on: keepHotspot ? 1 : 0
    });
    
    res.json({ 
      success: true, 
      mode 
    });
  } catch (error) {
    console.error('Network mode change error:', error);
    
    await auditService.log({
      user_id: req.userId!,
      action: 'network_mode_change',
      resource_type: 'network',
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      success: 0,
      error_message: error instanceof Error ? error.message : 'Unknown error'
    });
    
    if (error instanceof z.ZodError) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 
        'Invalid input: ' + error.errors.map(e => e.message).join(', ')));
    } else {
      res.status(500).json(errorResponse('MODE_CHANGE_FAILED', 'Failed to change network mode'));
    }
  }
});

export default router;