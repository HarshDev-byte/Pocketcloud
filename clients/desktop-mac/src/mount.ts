import { EventEmitter } from 'events';
import Store from 'electron-store';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { shell } from 'electron';

const execAsync = promisify(exec);

/**
 * MountService - Mounts PocketCloud as a WebDAV volume in Finder
 * 
 * Uses macOS native WebDAV mounting via osascript to create a network volume
 * that appears in Finder sidebar as "PocketCloud Drive"
 */
export class MountService extends EventEmitter {
  private store: Store;
  private mountPoint: string | null = null;
  private isMounted = false;
  private mountCheckInterval: NodeJS.Timeout | null = null;

  constructor(store: Store) {
    super();
    this.store = store;
  }

  public async initialize(): Promise<void> {
    // Check if already mounted from previous session
    await this.checkMountStatus();
    
    // Start periodic mount status checking
    this.mountCheckInterval = setInterval(() => {
      this.checkMountStatus();
    }, 30000); // Check every 30 seconds
  }

  public async mount(webdavUrl: string): Promise<void> {
    try {
      console.log('Mounting WebDAV volume:', webdavUrl);
      
      // Get credentials
      const username = this.store.get('connection.username') as string;
      const password = this.store.get('connection.password') as string;
      
      if (!username || !password) {
        throw new Error('WebDAV credentials not configured');
      }
      
      // Construct WebDAV URL with credentials
      const url = new URL(webdavUrl);
      url.username = encodeURIComponent(username);
      url.password = encodeURIComponent(password);
      
      // Use osascript to mount the volume (native macOS method)
      const script = `
        tell application "Finder"
          try
            mount volume "${url.toString()}"
            return "success"
          on error errMsg
            return "error: " & errMsg
          end try
        end tell
      `;
      
      const { stdout } = await execAsync(`osascript -e '${script}'`);
      
      if (stdout.includes('error:')) {
        throw new Error(stdout.replace('error: ', ''));
      }
      
      // Wait a moment for mount to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Find the mount point
      await this.findMountPoint();
      
      if (this.mountPoint) {
        this.isMounted = true;
        this.emit('mounted', this.mountPoint);
        console.log('WebDAV mounted successfully at:', this.mountPoint);
      } else {
        throw new Error('Mount succeeded but could not find mount point');
      }
      
    } catch (error) {
      console.error('Mount error:', error);
      this.emit('mountError', error);
      throw error;
    }
  }

  public async unmount(): Promise<void> {
    if (!this.isMounted || !this.mountPoint) {
      return;
    }
    
    try {
      console.log('Unmounting WebDAV volume:', this.mountPoint);
      
      // Use diskutil to unmount
      await execAsync(`diskutil unmount "${this.mountPoint}"`);
      
      this.isMounted = false;
      this.mountPoint = null;
      this.emit('unmounted');
      
      console.log('WebDAV unmounted successfully');
      
    } catch (error) {
      console.error('Unmount error:', error);
      // Force unmount
      try {
        await execAsync(`diskutil unmount force "${this.mountPoint}"`);
        this.isMounted = false;
        this.mountPoint = null;
        this.emit('unmounted');
      } catch (forceError) {
        console.error('Force unmount failed:', forceError);
        this.emit('mountError', forceError);
      }
    }
  }

  public openInFinder(): void {
    if (this.isMounted && this.mountPoint) {
      shell.openPath(this.mountPoint);
    }
  }

  public getMountPoint(): string | null {
    return this.mountPoint;
  }

  public getIsMounted(): boolean {
    return this.isMounted;
  }

  private async findMountPoint(): Promise<void> {
    try {
      // Look for PocketCloud volume in /Volumes
      const volumesDir = '/Volumes';
      const volumes = await fs.promises.readdir(volumesDir);
      
      // Look for volumes that might be our PocketCloud
      const possibleNames = [
        'PocketCloud',
        'PocketCloud Drive',
        'pocketcloud.local',
        'webdav'
      ];
      
      for (const volume of volumes) {
        const volumePath = path.join(volumesDir, volume);
        
        // Check if it's one of our possible names
        if (possibleNames.some(name => volume.toLowerCase().includes(name.toLowerCase()))) {
          // Verify it's actually mounted and accessible
          try {
            const stat = await fs.promises.stat(volumePath);
            if (stat.isDirectory()) {
              this.mountPoint = volumePath;
              return;
            }
          } catch (error) {
            // Volume not accessible, continue
          }
        }
      }
      
      // If not found by name, look for any WebDAV mounts
      const { stdout } = await execAsync('mount | grep webdav');
      const webdavMounts = stdout.split('\n').filter(line => line.trim());
      
      if (webdavMounts.length > 0) {
        // Parse mount output to find mount point
        const mountLine = webdavMounts[0];
        const match = mountLine.match(/on (\/Volumes\/[^\s]+)/);
        if (match) {
          this.mountPoint = match[1];
        }
      }
      
    } catch (error) {
      console.error('Error finding mount point:', error);
    }
  }

  private async checkMountStatus(): Promise<void> {
    try {
      if (this.mountPoint) {
        // Check if mount point still exists and is accessible
        try {
          const stat = await fs.promises.stat(this.mountPoint);
          if (!stat.isDirectory()) {
            throw new Error('Mount point is not a directory');
          }
          
          // Try to list directory to verify it's still mounted
          await fs.promises.readdir(this.mountPoint);
          
          // Still mounted
          if (!this.isMounted) {
            this.isMounted = true;
            this.emit('mounted', this.mountPoint);
          }
          
        } catch (error) {
          // Mount point no longer accessible
          if (this.isMounted) {
            this.isMounted = false;
            this.mountPoint = null;
            this.emit('unmounted');
          }
        }
      } else {
        // No known mount point, try to find one
        await this.findMountPoint();
        if (this.mountPoint && !this.isMounted) {
          this.isMounted = true;
          this.emit('mounted', this.mountPoint);
        }
      }
      
    } catch (error) {
      console.error('Error checking mount status:', error);
    }
  }

  public cleanup(): void {
    if (this.mountCheckInterval) {
      clearInterval(this.mountCheckInterval);
      this.mountCheckInterval = null;
    }
    
    // Optionally unmount on cleanup
    if (this.isMounted && this.store.get('mount.autoUnmount', false)) {
      this.unmount().catch(console.error);
    }
  }

  // Create WebDAV server endpoint on Pi (this would be implemented in the backend)
  public static getWebDAVServerCode(): string {
    return `
// Add to backend/src/routes/webdav.routes.ts
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { createReadStream, createWriteStream, statSync, readdirSync } from 'fs';
import { join } from 'path';

const router = Router();

// WebDAV PROPFIND - list directory contents
router.propfind('/*', authMiddleware, (req, res) => {
  const requestPath = decodeURIComponent(req.path.replace('/webdav', ''));
  const fullPath = join(process.env.STORAGE_PATH || '/mnt/pocketcloud', requestPath);
  
  try {
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      const files = readdirSync(fullPath);
      // Return WebDAV XML response with file list
      // Implementation details...
    } else {
      // Return file properties
      // Implementation details...
    }
  } catch (error) {
    res.status(404).end();
  }
});

// WebDAV GET - download file
router.get('/*', authMiddleware, (req, res) => {
  const requestPath = decodeURIComponent(req.path.replace('/webdav', ''));
  const fullPath = join(process.env.STORAGE_PATH || '/mnt/pocketcloud', requestPath);
  
  try {
    const stat = statSync(fullPath);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    const stream = createReadStream(fullPath);
    stream.pipe(res);
  } catch (error) {
    res.status(404).end();
  }
});

// WebDAV PUT - upload file
router.put('/*', authMiddleware, (req, res) => {
  const requestPath = decodeURIComponent(req.path.replace('/webdav', ''));
  const fullPath = join(process.env.STORAGE_PATH || '/mnt/pocketcloud', requestPath);
  
  const writeStream = createWriteStream(fullPath);
  req.pipe(writeStream);
  
  writeStream.on('finish', () => {
    res.status(201).end();
  });
  
  writeStream.on('error', (error) => {
    res.status(500).json({ error: error.message });
  });
});

export default router;
    `;
  }
}