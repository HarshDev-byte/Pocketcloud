/**
 * Downloads routes - serve client binaries and installer scripts
 * Allows PocketCloud to serve its own client applications
 */

import { Router } from 'express';
import { join } from 'path';
import { existsSync, statSync, createReadStream } from 'fs';
import { logger } from '../services/logger.service';

const router = Router();

// Base directory for client downloads (would be populated during build)
const DOWNLOADS_DIR = join(__dirname, '../../downloads');

/**
 * Get download page (redirect to frontend)
 */
router.get('/get', (req, res) => {
  res.redirect('/');
});

/**
 * Get versions and metadata for all available downloads
 */
router.get('/info', (req, res) => {
  try {
    const versionsPath = join(DOWNLOADS_DIR, 'versions.json');
    
    if (existsSync(versionsPath)) {
      const versions = require(versionsPath);
      res.json(versions);
    } else {
      // Fallback - scan directory and generate basic info
      const downloads = {};
      const files = [
        { key: 'mac-arm64', file: 'mac-arm64.dmg' },
        { key: 'mac-x64', file: 'mac-x64.dmg' },
        { key: 'win-x64', file: 'win-x64-setup.exe' },
        { key: 'linux-x64', file: 'linux-x64.tar.gz' },
        { key: 'linux-arm64', file: 'linux-arm64.tar.gz' }
      ];

      for (const { key, file } of files) {
        const filePath = join(DOWNLOADS_DIR, file);
        if (existsSync(filePath)) {
          const stats = statSync(filePath);
          downloads[key] = {
            version: '1.0.0',
            size: stats.size,
            sha256: 'unknown'
          };
        }
      }

      res.json(downloads);
    }
  } catch (error) {
    logger.error('Failed to get download info:', error);
    res.status(500).json({ error: 'Failed to get download information' });
  }
});

/**
 * Serve macOS DMG (Apple Silicon)
 */
router.get('/mac-arm64.dmg', (req, res) => {
  serveDownload(req, res, 'mac-arm64.dmg', 'application/x-apple-diskimage', 'PocketCloud-macOS-ARM64.dmg');
});

/**
 * Serve macOS DMG (Intel)
 */
router.get('/mac-x64.dmg', (req, res) => {
  serveDownload(req, res, 'mac-x64.dmg', 'application/x-apple-diskimage', 'PocketCloud-macOS-x64.dmg');
});

/**
 * Serve Windows installer
 */
router.get('/win-x64-setup.exe', (req, res) => {
  serveDownload(req, res, 'win-x64-setup.exe', 'application/x-msdownload', 'PocketCloud-Windows-Setup.exe');
});

/**
 * Serve Linux bundle (x64)
 */
router.get('/linux-x64.tar.gz', (req, res) => {
  serveDownload(req, res, 'linux-x64.tar.gz', 'application/gzip', 'PocketCloud-Linux-x64.tar.gz');
});

/**
 * Serve Linux bundle (ARM64)
 */
router.get('/linux-arm64.tar.gz', (req, res) => {
  serveDownload(req, res, 'linux-arm64.tar.gz', 'application/gzip', 'PocketCloud-Linux-ARM64.tar.gz');
});

/**
 * Generic download handler with range support
 */
function serveDownload(req: any, res: any, filename: string, contentType: string, downloadName: string) {
  const filePath = join(DOWNLOADS_DIR, filename);
  
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const stats = statSync(filePath);
  const fileSize = stats.size;
  
  // Handle range requests for resumable downloads
  const range = req.headers.range;
  
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', chunksize);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    
    const stream = createReadStream(filePath, { start, end });
    stream.pipe(res);
  } else {
    // Full file download
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Accept-Ranges', 'bytes');
    
    // Add checksum header if available
    try {
      const versionsPath = join(DOWNLOADS_DIR, 'versions.json');
      if (existsSync(versionsPath)) {
        const versions = require(versionsPath);
        const key = filename.replace(/\.(dmg|exe|tar\.gz)$/, '');
        if (versions[key] && versions[key].sha256) {
          res.setHeader('X-Checksum-SHA256', versions[key].sha256);
        }
      }
    } catch (error) {
      // Ignore checksum errors
    }
    
    const stream = createReadStream(filePath);
    stream.pipe(res);
  }
  
  logger.info(`Served ${filename} to ${req.ip} (${range ? 'partial' : 'full'} download)`);
}
/**
 * Serve Linux CLI binary (x64)
 */
router.get('/pcd-linux-x64', (req, res) => {
  const filePath = join(DOWNLOADS_DIR, 'pcd-linux-x64');
  
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'Binary not found' });
  }

  const stats = statSync(filePath);
  
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', stats.size);
  res.setHeader('Content-Disposition', 'attachment; filename="pcd"');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Accept-Ranges', 'bytes');
  
  const stream = createReadStream(filePath);
  stream.pipe(res);
  
  logger.info(`Served Linux CLI binary (x64) to ${req.ip}`);
});

/**
 * Serve Linux CLI binary (ARM64)
 */
router.get('/pcd-linux-arm64', (req, res) => {
  const filePath = join(DOWNLOADS_DIR, 'pcd-linux-arm64');
  
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'Binary not found' });
  }

  const stats = statSync(filePath);
  
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', stats.size);
  res.setHeader('Content-Disposition', 'attachment; filename="pcd"');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  
  const stream = createReadStream(filePath);
  stream.pipe(res);
  
  logger.info(`Served Linux CLI binary (ARM64) to ${req.ip}`);
});

/**
 * Serve Windows CLI binary (x64)
 */
router.get('/pcd-win-x64.exe', (req, res) => {
  const filePath = join(DOWNLOADS_DIR, 'pcd-win-x64.exe');
  
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'Binary not found' });
  }

  const stats = statSync(filePath);
  
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', stats.size);
  res.setHeader('Content-Disposition', 'attachment; filename="pcd.exe"');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  
  const stream = createReadStream(filePath);
  stream.pipe(res);
  
  logger.info(`Served Windows CLI binary to ${req.ip}`);
});

/**
 * Serve macOS CLI binary (ARM64)
 */
router.get('/pcd-mac-arm64', (req, res) => {
  const filePath = join(DOWNLOADS_DIR, 'pcd-mac-arm64');
  
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'Binary not found' });
  }

  const stats = statSync(filePath);
  
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', stats.size);
  res.setHeader('Content-Disposition', 'attachment; filename="pcd"');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  
  const stream = createReadStream(filePath);
  stream.pipe(res);
  
  logger.info(`Served macOS CLI binary to ${req.ip}`);
});

/**
 * Serve GTK tray application
 */
router.get('/pocketcloud-tray.py', (req, res) => {
  const filePath = join(DOWNLOADS_DIR, 'pocketcloud-tray.py');
  
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'GTK app not found' });
  }

  const stats = statSync(filePath);
  
  res.setHeader('Content-Type', 'text/x-python');
  res.setHeader('Content-Length', stats.size);
  res.setHeader('Content-Disposition', 'attachment; filename="pocketcloud-tray.py"');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  
  const stream = createReadStream(filePath);
  stream.pipe(res);
  
  logger.info(`Served GTK tray app to ${req.ip}`);
});

/**
 * Serve universal installer script
 */
router.get('/install.sh', (req, res) => {
  const filePath = join(DOWNLOADS_DIR, 'install-linux.sh');
  
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'Installer not found' });
  }

  const stats = statSync(filePath);
  
  res.setHeader('Content-Type', 'text/x-shellscript');
  res.setHeader('Content-Length', stats.size);
  res.setHeader('Content-Disposition', 'attachment; filename="install.sh"');
  res.setHeader('Cache-Control', 'public, max-age=1800'); // Cache for 30 minutes
  
  const stream = createReadStream(filePath);
  stream.pipe(res);
  
  logger.info(`Served installer script to ${req.ip}`);
});

/**
 * Serve iOS Shortcut file for PocketCloud upload
 */
router.get('/pocketcloud-upload.shortcut', (req, res) => {
  const serverUrl = `${req.protocol}://${req.get('host')}`;
  
  // iOS Shortcut file content (base64 encoded plist)
  const shortcutContent = {
    WFWorkflowActions: [
      {
        WFWorkflowActionIdentifier: 'is.workflow.actions.detect.text',
        WFWorkflowActionParameters: {}
      },
      {
        WFWorkflowActionIdentifier: 'is.workflow.actions.uploadfile',
        WFWorkflowActionParameters: {
          WFInput: 'Clipboard',
          WFDestination: `${serverUrl}/api/shortcuts/upload`,
          WFHTTPMethod: 'POST',
          WFFormValues: {
            'x-success': 'shortcuts://x-callback-url/run-shortcut?name=PocketCloud%20Success',
            'x-error': 'shortcuts://x-callback-url/run-shortcut?name=PocketCloud%20Error'
          }
        }
      }
    ],
    WFWorkflowName: 'Upload to PocketCloud',
    WFWorkflowIcon: {
      WFWorkflowIconStartColor: 37,
      WFWorkflowIconGlyphNumber: 59
    }
  };

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>WFWorkflowActions</key>
  <array>
    <dict>
      <key>WFWorkflowActionIdentifier</key>
      <string>is.workflow.actions.getclipboard</string>
    </dict>
    <dict>
      <key>WFWorkflowActionIdentifier</key>
      <string>is.workflow.actions.uploadfile</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        <key>WFInput</key>
        <string>Clipboard</string>
        <key>WFDestination</key>
        <string>${serverUrl}/api/shortcuts/upload</string>
        <key>WFHTTPMethod</key>
        <string>POST</string>
      </dict>
    </dict>
  </array>
  <key>WFWorkflowName</key>
  <string>Upload to PocketCloud</string>
  <key>WFWorkflowIcon</key>
  <dict>
    <key>WFWorkflowIconStartColor</key>
    <integer>37</integer>
    <key>WFWorkflowIconGlyphNumber</key>
    <integer>59</integer>
  </dict>
</dict>
</plist>`;

  res.setHeader('Content-Type', 'application/vnd.apple.shortcuts');
  res.setHeader('Content-Disposition', 'attachment; filename="PocketCloud Upload.shortcut"');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  
  res.send(plistContent);
  
  logger.info(`Served iOS Shortcut file to ${req.ip}`);
});

/**
 * List available downloads
 */
router.get('/', (req, res) => {
  const downloads = [];
  
  const binaries = [
    { name: 'pcd-linux-x64', description: 'PocketCloud CLI for Linux (x64)', platform: 'linux', arch: 'x64' },
    { name: 'pcd-linux-arm64', description: 'PocketCloud CLI for Linux (ARM64)', platform: 'linux', arch: 'arm64' },
    { name: 'pcd-win-x64.exe', description: 'PocketCloud CLI for Windows (x64)', platform: 'windows', arch: 'x64' },
    { name: 'pcd-mac-arm64', description: 'PocketCloud CLI for macOS (ARM64)', platform: 'macos', arch: 'arm64' },
    { name: 'pocketcloud-tray.py', description: 'GTK System Tray App for Linux', platform: 'linux', arch: 'all' },
    { name: 'install.sh', description: 'Universal Linux Installer', platform: 'linux', arch: 'all' }
  ];

  for (const binary of binaries) {
    const filePath = join(DOWNLOADS_DIR, binary.name === 'install.sh' ? 'install-linux.sh' : binary.name);
    
    if (existsSync(filePath)) {
      const stats = statSync(filePath);
      downloads.push({
        ...binary,
        size: stats.size,
        modified: stats.mtime,
        url: `/downloads/${binary.name}`
      });
    }
  }

  res.json({
    success: true,
    data: {
      downloads,
      instructions: {
        linux: {
          oneLineInstall: `curl -fsSL http://${req.get('host')}/downloads/install.sh | bash`,
          manual: [
            `curl -fsSL http://${req.get('host')}/downloads/pcd-linux-$(uname -m | sed 's/x86_64/x64/') -o pcd`,
            'chmod +x pcd',
            'sudo mv pcd /usr/local/bin/'
          ]
        },
        windows: {
          download: `http://${req.get('host')}/downloads/pcd-win-x64.exe`,
          install: 'Download and run the installer'
        },
        macos: {
          download: `http://${req.get('host')}/downloads/pcd-mac-arm64`,
          install: [
            'curl -fsSL http://[HOST]/downloads/pcd-mac-arm64 -o pcd',
            'chmod +x pcd',
            'sudo mv pcd /usr/local/bin/'
          ]
        }
      }
    }
  });
});

export { router as downloadsRoutes };