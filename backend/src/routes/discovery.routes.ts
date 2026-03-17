import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { getDiskStatus } from '../utils/disk.utils';
import { db } from '../db/client';
import { logger } from '../utils/logger';

const router = Router();

// Primary discovery endpoint — clients scan this
router.get('/ping', (req: Request, res: Response) => {
  try {
    const diskStatus = getDiskStatus();
    
    // Get network status if available
    let networkStatus: any = {
      hotspot: { active: false, ssid: 'PocketCloud' },
      wifi: { connected: false },
      ethernet: { connected: false },
      accessUrls: ['http://192.168.4.1', 'http://pocketcloud.local']
    };
    
    try {
      const { NetworkService } = require('../services/network.service');
      networkStatus = NetworkService.getCachedStatus();
    } catch (error) {
      // Network service not available, use defaults
    }

    // Check if setup is complete (at least one user exists)
    let hasUsers = false;
    try {
      const result = db.prepare('SELECT COUNT(*) as count FROM users').get() as any;
      hasUsers = result.count > 0;
    } catch (error) {
      // Database might not be ready
    }

    res.json({
      service: 'pocketcloud',
      version: process.env.APP_VERSION ?? '1.0.0',
      name: networkStatus.hotspot?.ssid || 'PocketCloud',
      hostname: 'pocketcloud.local',
      features: [
        'files',
        'sharing',
        'streaming',
        'webdav',
        'encryption',
        'sync',
        'photo-backup',
        'webhooks',
        'api-keys',
        'analytics',
        'pipeline',
        'health-monitor'
      ],
      storage: {
        freeBytes: diskStatus.freeBytes,
        totalBytes: diskStatus.totalBytes,
        percentUsed: Math.round(diskStatus.percentUsed * 100)
      },
      network: {
        hotspotActive: networkStatus.hotspot?.active || false,
        wifiConnected: networkStatus.wifi?.connected || false,
        ethernetConnected: networkStatus.ethernet?.connected || false,
        accessUrls: networkStatus.accessUrls || ['http://192.168.4.1']
      },
      requiresAuth: true,
      setupComplete: hasUsers
    });
  } catch (error: any) {
    logger.error('Discovery ping failed', { error: error.message });
    res.status(500).json({
      service: 'pocketcloud',
      error: 'Discovery failed'
    });
  }
});

// Well-known file for client auto-discovery
router.get('/.well-known/pocketcloud.json', (req: Request, res: Response) => {
  res.json({
    name: 'PocketCloud Drive',
    version: process.env.APP_VERSION ?? '1.0.0',
    api: '/api',
    webdav: '/webdav',
    websocket: '/ws',
    docs: 'https://github.com/pocketcloud/docs'
  });
});

// QR code data endpoint — clients use this for QR display
router.get('/connect-info', requireAuth, (req: Request, res: Response) => {
  try {
    let networkStatus: any = {
      hotspot: { ssid: 'PocketCloud' },
      accessUrls: ['http://192.168.4.1', 'http://pocketcloud.local']
    };
    
    try {
      const { NetworkService } = require('../services/network.service');
      networkStatus = NetworkService.getCachedStatus();
    } catch (error) {
      // Network service not available, use defaults
    }

    res.json({
      accessUrls: networkStatus.accessUrls || ['http://192.168.4.1'],
      hotspot: {
        ssid: networkStatus.hotspot?.ssid || 'PocketCloud'
        // Never return password via API for security
      },
      qrContent: networkStatus.accessUrls?.[0] || 'http://192.168.4.1',
      // WiFi connection QR (without password for security)
      wifiQr: `WIFI:T:WPA;S:${networkStatus.hotspot?.ssid || 'PocketCloud'};P:;;;`
    });
  } catch (error: any) {
    logger.error('Failed to get connect info', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;
