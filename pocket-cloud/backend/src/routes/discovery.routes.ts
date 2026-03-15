/**
 * Device Discovery Routes for PocketCloud
 * Provides endpoints for clients to discover and connect to the Pi
 */

import { Router, Request, Response } from 'express';
import { networkService } from '../services/network.service.js';
import { getAllInterfaces } from '../utils/ip.utils.js';
import { getDatabase } from '../db/client.js';

const router = Router();

/**
 * Device discovery endpoint - clients use this to find Pi on network
 * Returns service information and network status
 */
router.get('/api/ping', async (req: Request, res: Response) => {
  try {
    // Get network status
    const networkStatus = await networkService.getNetworkStatus();
    
    // Get all IP addresses the Pi is reachable at
    const interfaces = getAllInterfaces();
    const ips = interfaces
      .filter(iface => iface.family === 'IPv4' && !iface.internal)
      .map(iface => iface.address);
    
    // Add mDNS hostname if available
    const accessUrls = [...ips.map(ip => `http://${ip}`)];
    if (networkStatus.mdns?.active) {
      accessUrls.push('http://pocketcloud.local');
    }
    
    // Check if admin user exists
    const db = getDatabase();
    const adminExists = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin') as { count: number };
    
    res.json({
      service: 'pocketcloud',
      version: process.env.APP_VERSION || '1.0.0',
      name: networkStatus.hotspot?.ssid || 'PocketCloud',
      modes: {
        hotspot: networkStatus.hotspot?.active || false,
        wifi: networkStatus.client?.connected || false,
        ethernet: networkStatus.ethernet?.connected || false
      },
      ips: ips,
      accessUrls: accessUrls,
      requiresAuth: true,
      setupComplete: adminExists.count > 0
    });
  } catch (error) {
    console.error('Discovery ping error:', error);
    res.status(500).json({
      service: 'pocketcloud',
      version: process.env.APP_VERSION || '1.0.0',
      error: 'Service temporarily unavailable'
    });
  }
});

/**
 * Well-known endpoint for service discovery
 * Provides standardized service information
 */
router.get('/.well-known/pocketcloud.json', async (req: Request, res: Response) => {
  try {
    // Check if setup is complete
    const db = getDatabase();
    const adminExists = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin') as { count: number };
    
    res.json({
      name: 'PocketCloud Drive',
      version: process.env.APP_VERSION || '1.0.0',
      capabilities: [
        'files',
        'sharing', 
        'streaming',
        'webdav',
        'sync',
        'encryption'
      ],
      auth: 'session',
      setupComplete: adminExists.count > 0,
      endpoints: {
        api: '/api',
        auth: '/api/auth',
        files: '/api/files',
        webdav: '/webdav'
      }
    });
  } catch (error) {
    console.error('Well-known endpoint error:', error);
    res.status(500).json({
      name: 'PocketCloud Drive',
      version: process.env.APP_VERSION || '1.0.0',
      error: 'Service temporarily unavailable'
    });
  }
});

/**
 * Network status endpoint for discovery
 * Provides current network configuration and connectivity
 */
router.get('/api/discovery/network', async (req: Request, res: Response) => {
  try {
    const networkStatus = await networkService.getNetworkStatus();
    
    res.json({
      mode: networkStatus.mode,
      interfaces: {
        hotspot: {
          active: networkStatus.hotspot?.active || false,
          ssid: networkStatus.hotspot?.ssid,
          ip: networkStatus.hotspot?.ip,
          connectedDevices: networkStatus.hotspot?.connected_devices || 0
        },
        wifi: {
          connected: networkStatus.client?.connected || false,
          ssid: networkStatus.client?.ssid,
          ip: networkStatus.client?.ip
        },
        ethernet: {
          connected: networkStatus.ethernet?.connected || false,
          ip: networkStatus.ethernet?.ip
        }
      },
      mdns: {
        hostname: 'pocketcloud.local',
        active: networkStatus.mdns?.active || false
      },
      accessUrls: networkStatus.accessUrls || []
    });
  } catch (error) {
    console.error('Network discovery error:', error);
    res.status(500).json({
      error: 'Failed to get network status'
    });
  }
});

/**
 * Service capabilities endpoint
 * Returns detailed information about available services
 */
router.get('/api/discovery/capabilities', (req: Request, res: Response) => {
  res.json({
    storage: {
      available: true,
      features: ['upload', 'download', 'folders', 'search', 'thumbnails']
    },
    sharing: {
      available: true,
      features: ['public-links', 'password-protection', 'expiration']
    },
    streaming: {
      available: true,
      features: ['video-hls', 'audio-streaming', 'live-transcoding']
    },
    webdav: {
      available: true,
      endpoint: '/webdav',
      features: ['read', 'write', 'sync']
    },
    sync: {
      available: true,
      features: ['real-time', 'conflict-resolution', 'versioning']
    },
    encryption: {
      available: true,
      features: ['client-side', 'vault', 'secure-sharing']
    },
    admin: {
      available: true,
      features: ['user-management', 'system-monitoring', 'network-config']
    }
  });
});

export default router;