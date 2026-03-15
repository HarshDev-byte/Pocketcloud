import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import crypto from 'crypto';
import { db } from '../db';
import { LoggerService } from '../services/logger.service';

const router = Router();

interface SetupRequest {
  adminUsername: string;
  adminPassword: string;
  networkName: string;
  networkPassword: string;
}

/**
 * Check if setup is needed (no users exist)
 */
router.get('/api/setup/status', (req: Request, res: Response) => {
  try {
    const userCountStmt = db.prepare('SELECT COUNT(*) as count FROM users');
    const result = userCountStmt.get() as { count: number };
    
    const needsSetup = result.count === 0;
    
    res.json({
      needsSetup,
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Setup status check error:', error);
    res.status(500).json({ error: 'Failed to check setup status' });
  }
});

/**
 * Complete initial setup
 */
router.post('/api/setup/complete', async (req: Request, res: Response) => {
  try {
    // Check if setup is still needed
    const userCountStmt = db.prepare('SELECT COUNT(*) as count FROM users');
    const result = userCountStmt.get() as { count: number };
    
    if (result.count > 0) {
      return res.status(400).json({ error: 'Setup already completed' });
    }

    const { adminUsername, adminPassword, networkName, networkPassword }: SetupRequest = req.body;

    // Validate input
    if (!adminUsername || !adminPassword || !networkName || !networkPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (adminUsername.length < 3 || /\s/.test(adminUsername)) {
      return res.status(400).json({ error: 'Username must be at least 3 characters with no spaces' });
    }

    if (adminPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    if (networkName.length < 3 || networkName.length > 32) {
      return res.status(400).json({ error: 'Network name must be 3-32 characters' });
    }

    if (networkPassword.length < 8 || networkPassword.length > 63) {
      return res.status(400).json({ error: 'Network password must be 8-63 characters' });
    }

    // Create admin user
    const userId = crypto.randomUUID();
    const passwordHash = bcrypt.hashSync(adminPassword, 10);
    const timestamp = Date.now();

    const insertUserStmt = db.prepare(`
      INSERT INTO users (id, username, password_hash, role, quota_bytes, created_at, updated_at, is_active)
      VALUES (?, ?, ?, 'admin', NULL, ?, ?, 1)
    `);

    insertUserStmt.run(userId, adminUsername, passwordHash, timestamp, timestamp);

    // Initialize storage stats
    const initStorageStmt = db.prepare(`
      INSERT OR REPLACE INTO storage_stats (id, used_bytes, total_bytes, file_count, updated_at)
      VALUES (1, 0, ?, 0, ?)
    `);

    // Get total storage space (default to 1TB if can't determine)
    let totalBytes = 1024 * 1024 * 1024 * 1024; // 1TB default
    try {
      const dfOutput = execSync('df -B1 /mnt/pocketcloud 2>/dev/null || df -B1 /', { encoding: 'utf8' });
      const lines = dfOutput.trim().split('\n');
      const dataLine = lines[lines.length - 1];
      const columns = dataLine.split(/\s+/);
      totalBytes = parseInt(columns[1], 10) || totalBytes;
    } catch (error) {
      console.warn('Could not determine storage size, using default');
    }

    initStorageStmt.run(totalBytes, timestamp);

    // Update network configuration (only on Pi)
    if (process.platform === 'linux' && existsSync('/etc/hostapd/hostapd.conf')) {
      try {
        updateNetworkConfig(networkName, networkPassword);
        LoggerService.info('setup', `Network configured: ${networkName}`, userId);
      } catch (error) {
        console.error('Network configuration failed:', error);
        // Don't fail setup if network config fails
        LoggerService.warn('setup', 'Network configuration failed but setup continued', userId);
      }
    }

    // Log setup completion
    LoggerService.info('setup', `Initial setup completed by admin: ${adminUsername}`, userId);

    res.json({
      success: true,
      message: 'Setup completed successfully',
      admin: {
        username: adminUsername,
        id: userId
      },
      network: {
        name: networkName,
        ip: '192.168.4.1'
      }
    });

  } catch (error) {
    console.error('Setup completion error:', error);
    res.status(500).json({ error: 'Failed to complete setup' });
  }
});

/**
 * Update network configuration (hostapd)
 */
function updateNetworkConfig(networkName: string, networkPassword: string): void {
  const hostapdConfig = `
# Pocket Cloud Drive WiFi Configuration
interface=wlan0
driver=nl80211
ssid=${networkName}
hw_mode=g
channel=7
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=${networkPassword}
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
`.trim();

  // Write new hostapd configuration
  writeFileSync('/etc/hostapd/hostapd.conf', hostapdConfig);

  // Restart hostapd service
  try {
    execSync('systemctl restart hostapd', { stdio: 'inherit' });
    console.log('Network configuration updated and hostapd restarted');
  } catch (error) {
    console.error('Failed to restart hostapd:', error);
    throw new Error('Failed to apply network configuration');
  }
}

/**
 * Get current network configuration (for display)
 */
router.get('/api/setup/network-info', (req: Request, res: Response) => {
  try {
    let networkName = 'PocketCloud-XXXX';
    let ipAddress = '192.168.4.1';

    // Try to read current hostapd config
    if (existsSync('/etc/hostapd/hostapd.conf')) {
      try {
        const config = require('fs').readFileSync('/etc/hostapd/hostapd.conf', 'utf8');
        const ssidMatch = config.match(/^ssid=(.+)$/m);
        if (ssidMatch) {
          networkName = ssidMatch[1];
        }
      } catch (error) {
        console.warn('Could not read hostapd config');
      }
    }

    // Try to get actual IP address
    try {
      const ipOutput = execSync("ip addr show wlan0 | grep 'inet ' | awk '{print $2}' | cut -d/ -f1", { encoding: 'utf8' });
      if (ipOutput.trim()) {
        ipAddress = ipOutput.trim();
      }
    } catch (error) {
      console.warn('Could not determine IP address');
    }

    res.json({
      networkName,
      ipAddress,
      defaultGateway: '192.168.4.1',
      dhcpRange: '192.168.4.2-192.168.4.20'
    });

  } catch (error) {
    console.error('Network info error:', error);
    res.status(500).json({ error: 'Failed to get network info' });
  }
});

export default router;