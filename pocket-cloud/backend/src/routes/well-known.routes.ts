import { Router, Request, Response } from 'express';
import { SystemService } from '../services/system.service';
import { db } from '../db';

const router = Router();

/**
 * Well-Known Routes for Device Identity and Standards Compliance
 * These routes provide standardized endpoints for device identification
 */

/**
 * PocketCloud device identity endpoint
 * GET /.well-known/pocketcloud.json
 * 
 * This endpoint provides comprehensive device information in a standardized format
 * Used by companion apps to identify genuine PocketCloud devices
 */
router.get('/pocketcloud.json', async (req: Request, res: Response) => {
  try {
    // Get system information
    const systemStats = await SystemService.getSystemStats();
    
    // Get user count
    const userCountStmt = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1');
    const userCount = (userCountStmt.get() as { count: number }).count;
    
    // Get storage stats
    const storageStmt = db.prepare('SELECT * FROM storage_stats WHERE id = 1');
    const storageStats = storageStmt.get() as any;
    
    // Get file count
    const fileCountStmt = db.prepare('SELECT COUNT(*) as count FROM files WHERE is_deleted = 0');
    const fileCount = (fileCountStmt.get() as { count: number }).count;
    
    // Get WiFi SSID
    let ssid = 'PocketCloud-XXXX';
    try {
      const { execSync } = require('child_process');
      const hostapd = execSync('grep "^ssid=" /etc/hostapd/hostapd.conf 2>/dev/null || echo "ssid=PocketCloud-XXXX"', { encoding: 'utf8' });
      ssid = hostapd.split('=')[1]?.trim() || ssid;
    } catch (error) {
      // Fallback to default SSID
    }

    // Get hardware information if available
    let hardwareInfo = {};
    try {
      const { hardwareService } = require('../services/hardware.service');
      const stats = hardwareService.getCurrentStats();
      if (stats) {
        hardwareInfo = {
          cpuTemp: stats.cpuTemp,
          cpuUsage: stats.cpuUsage,
          memoryUsed: stats.memInfo.used,
          memoryTotal: stats.memInfo.total,
          wifiClients: stats.wifiClients.length
        };
      }
    } catch (error) {
      // Hardware service not available
    }

    const deviceIdentity = {
      // Device identification
      name: process.env.DEVICE_NAME || 'PocketCloud Drive',
      type: 'pocketcloud',
      version: '1.0.0',
      model: 'Raspberry Pi 4B',
      
      // Network information
      ip: '192.168.4.1',
      hostname: 'pocketcloud.local',
      ssid: ssid,
      port: 3000,
      
      // Storage information
      storage: {
        total: storageStats?.total_bytes || 0,
        used: storageStats?.used_bytes || 0,
        free: (storageStats?.total_bytes || 0) - (storageStats?.used_bytes || 0),
        files: fileCount
      },
      
      // User information
      users: userCount,
      setupRequired: userCount === 0,
      
      // System information
      system: {
        platform: systemStats.platform,
        arch: systemStats.arch,
        nodeVersion: systemStats.nodeVersion,
        uptime: systemStats.uptime,
        ...hardwareInfo
      },
      
      // Capabilities
      features: [
        'file_storage',
        'media_streaming', 
        'real_time_sync',
        'web_interface',
        'mobile_pwa',
        'admin_panel',
        'sharing',
        'thumbnails',
        'search'
      ],
      
      // API endpoints
      endpoints: {
        web: 'http://192.168.4.1',
        api: 'http://192.168.4.1/api',
        websocket: 'ws://192.168.4.1/ws',
        setup: 'http://192.168.4.1/setup',
        admin: 'http://192.168.4.1/admin'
      },
      
      // Security information
      security: {
        authRequired: userCount > 0,
        httpsEnabled: false,
        corsEnabled: true
      },
      
      // Metadata
      generatedAt: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };

    // Set appropriate headers
    res.header('Content-Type', 'application/json');
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    
    res.json(deviceIdentity);

  } catch (error) {
    console.error('Well-known pocketcloud.json error:', error);
    res.status(500).json({
      error: 'Failed to generate device identity',
      type: 'pocketcloud',
      status: 'error'
    });
  }
});

/**
 * Security.txt for security researchers
 * GET /.well-known/security.txt
 */
router.get('/security.txt', (req: Request, res: Response) => {
  const securityTxt = `Contact: mailto:security@pocketcloud.local
Expires: 2025-12-31T23:59:59.000Z
Acknowledgments: https://github.com/pocketcloud/security
Preferred-Languages: en
Canonical: http://192.168.4.1/.well-known/security.txt

# PocketCloud Drive Security Information
# This is a personal cloud storage device running on a local network.
# Please report security issues responsibly.
`;

  res.header('Content-Type', 'text/plain');
  res.send(securityTxt);
});

/**
 * Robots.txt for web crawlers
 * GET /.well-known/robots.txt
 */
router.get('/robots.txt', (req: Request, res: Response) => {
  const robotsTxt = `# PocketCloud Drive - Personal Cloud Storage
# This is a private device on a local network

User-agent: *
Disallow: /api/
Disallow: /admin/
Disallow: /.well-known/
Allow: /

# Sitemap (if needed)
# Sitemap: http://192.168.4.1/sitemap.xml
`;

  res.header('Content-Type', 'text/plain');
  res.send(robotsTxt);
});

/**
 * Change password endpoint reference
 * GET /.well-known/change-password
 */
router.get('/change-password', (req: Request, res: Response) => {
  res.redirect(302, '/admin/settings');
});

/**
 * Apple app site association (for iOS deep linking)
 * GET /.well-known/apple-app-site-association
 */
router.get('/apple-app-site-association', (req: Request, res: Response) => {
  const appleAssociation = {
    applinks: {
      apps: [],
      details: [
        {
          appID: "TEAMID.com.pocketcloud.app",
          paths: ["/share/*", "/file/*", "/folder/*"]
        }
      ]
    }
  };

  res.header('Content-Type', 'application/json');
  res.json(appleAssociation);
});

/**
 * Android asset links (for Android deep linking)
 * GET /.well-known/assetlinks.json
 */
router.get('/assetlinks.json', (req: Request, res: Response) => {
  const assetLinks = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.pocketcloud.app",
        sha256_cert_fingerprints: [
          "XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX:XX"
        ]
      }
    }
  ];

  res.header('Content-Type', 'application/json');
  res.json(assetLinks);
});

/**
 * OpenID configuration (for future OAuth integration)
 * GET /.well-known/openid_configuration
 */
router.get('/openid_configuration', (req: Request, res: Response) => {
  const openidConfig = {
    issuer: "http://192.168.4.1",
    authorization_endpoint: "http://192.168.4.1/auth/authorize",
    token_endpoint: "http://192.168.4.1/api/auth/token",
    userinfo_endpoint: "http://192.168.4.1/api/auth/userinfo",
    jwks_uri: "http://192.168.4.1/.well-known/jwks.json",
    response_types_supported: ["code", "token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"]
  };

  res.header('Content-Type', 'application/json');
  res.json(openidConfig);
});

/**
 * WebFinger protocol support (for federated identity)
 * GET /.well-known/webfinger
 */
router.get('/webfinger', (req: Request, res: Response) => {
  const resource = req.query.resource as string;
  
  if (!resource) {
    return res.status(400).json({ error: 'Missing resource parameter' });
  }

  const webfinger = {
    subject: resource,
    links: [
      {
        rel: "self",
        type: "application/activity+json",
        href: `http://192.168.4.1/users/${resource}`
      },
      {
        rel: "http://webfinger.net/rel/profile-page",
        type: "text/html",
        href: `http://192.168.4.1/profile/${resource}`
      }
    ]
  };

  res.header('Content-Type', 'application/jrd+json');
  res.json(webfinger);
});

/**
 * Host metadata (for federated protocols)
 * GET /.well-known/host-meta
 */
router.get('/host-meta', (req: Request, res: Response) => {
  const hostMeta = `<?xml version="1.0" encoding="UTF-8"?>
<XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0">
  <Link rel="lrdd" type="application/xrd+xml" template="http://192.168.4.1/.well-known/webfinger?resource={uri}"/>
</XRD>`;

  res.header('Content-Type', 'application/xrd+xml');
  res.send(hostMeta);
});

export default router;