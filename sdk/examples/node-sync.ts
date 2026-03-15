/**
 * Two-way sync between local folder and Pocket Cloud Drive
 */

import { PocketCloudClient } from '../src/index.js';
import { promises as fs } from 'fs';
import { join, relative, dirname } from 'path';
import { createHash } from 'crypto';
import { watch } from 'chokidar';

interface SyncItem {
  path: string;
  isDirectory: boolean;
  size?: number;
  checksum?: string;
  lastModified: number;
}

interface SyncState {
  local: Map<string, SyncItem>;
  remote: Map<string, SyncItem>;
  lastSync: number;
}

class SyncEngine {
  private client: PocketCloudClient;
  private localPath: string;
  private remotePath: string;
  private state: SyncState;
  private watcher?: any;
  private isRunning = false;

  constructor(client: PocketCloudClient, localPath: string, remotePath: string) {
    this.client = client;
    this.localPath = localPath;
    this.remotePath = remotePath;
    this.state = {
      local: new Map(),
      remote: new Map(),
      lastSync: 0
    };
  }

  /**
   * Start continuous sync
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    console.log(`🔄 Starting sync: ${this.localPath} ↔ ${this.remotePath}`);
    
    this.isRunning = true;
    
    // Initial sync
    await this.performSync();
    
    // Watch for local changes
    this.startLocalWatcher();
    
    // Watch for remote changes
    this.startRemoteWatcher();
    
    // Periodic full sync (every 5 minutes)
    setInterval(() => {
      if (this.isRunning) {
        this.performSync().catch(console.error);
      }
    }, 5 * 60 * 1000);
    
    console.log('✅ Sync started');
  }

  /**
   * Stop sync
   */
  stop(): void {
    this.isRunning = false;
    
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    
    this.client.realtime.disconnect();
    console.log('🛑 Sync stopped');
  }

  /**
   * Perform full sync
   */
  async performSync(): Promise<void> {
    console.log('🔍 Scanning for changes...');
    
    try {
      // Scan local and remote states
      await Promise.all([
        this.scanLocal(),
        this.scanRemote()
      ]);
      
      // Find differences and sync
      const changes = this.findChanges();
      await this.applyChanges(changes);
      
      this.state.lastSync = Date.now();
      console.log(`✅ Sync completed at ${new Date().toISOString()}`);
      
    } catch (error) {
      console.error('❌ Sync failed:', error);
    }
  }

  /**
   * Scan local filesystem
   */
  private async scanLocal(): Promise<void> {
    const items = new Map<string, SyncItem>();
    
    const scanDirectory = async (dirPath: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = join(dirPath, entry.name);
          const relativePath = relative(this.localPath, fullPath);
          
          if (entry.isDirectory()) {
            const stats = await fs.stat(fullPath);
            items.set(relativePath, {
              path: relativePath,
              isDirectory: true,
              lastModified: stats.mtimeMs
            });
            
            await scanDirectory(fullPath);
          } else {
            const stats = await fs.stat(fullPath);
            const checksum = await this.calculateFileChecksum(fullPath);
            
            items.set(relativePath, {
              path: relativePath,
              isDirectory: false,
              size: stats.size,
              checksum,
              lastModified: stats.mtimeMs
            });
          }
        }
      } catch (error) {
        console.error(`Error scanning ${dirPath}:`, error);
      }
    };
    
    await scanDirectory(this.localPath);
    this.state.local = items;
  }

  /**
   * Scan remote filesystem
   */
  private async scanRemote(): Promise<void> {
    const items = new Map<string, SyncItem>();
    
    // Ensure remote folder exists
    const remoteFolder = await this.client.folders.createPath(this.remotePath);
    
    const scanFolder = async (folderId: string, basePath: string = ''): Promise<void> => {
      try {
        const contents = await this.client.folders.getContents(folderId);
        
        // Add folders
        for (const folder of contents.folders) {
          const relativePath = basePath ? `${basePath}/${folder.name}` : folder.name;
          items.set(relativePath, {
            path: relativePath,
            isDirectory: true,
            lastModified: folder.updatedAt
          });
          
          await scanFolder(folder.id, relativePath);
        }
        
        // Add files
        for (const file of contents.files) {
          const relativePath = basePath ? `${basePath}/${file.name}` : file.name;
          items.set(relativePath, {
            path: relativePath,
            isDirectory: false,
            size: file.size,
            checksum: file.checksum,
            lastModified: file.updatedAt
          });
        }
      } catch (error) {
        console.error(`Error scanning remote folder ${folderId}:`, error);
      }
    };
    
    await scanFolder(remoteFolder.id);
    this.state.remote = items;
  }

  /**
   * Find changes between local and remote
   */
  private findChanges(): {
    uploadFiles: string[];
    downloadFiles: string[];
    createLocalFolders: string[];
    createRemoteFolders: string[];
    deleteLocal: string[];
    deleteRemote: string[];
  } {
    const changes = {
      uploadFiles: [] as string[],
      downloadFiles: [] as string[],
      createLocalFolders: [] as string[],
      createRemoteFolders: [] as string[],
      deleteLocal: [] as string[],
      deleteRemote: [] as string[]
    };

    // Find items to upload (local newer or not on remote)
    for (const [path, localItem] of this.state.local) {
      const remoteItem = this.state.remote.get(path);
      
      if (!remoteItem) {
        // New local item
        if (localItem.isDirectory) {
          changes.createRemoteFolders.push(path);
        } else {
          changes.uploadFiles.push(path);
        }
      } else if (!localItem.isDirectory && !remoteItem.isDirectory) {
        // File exists on both sides - check if local is newer
        if (localItem.checksum !== remoteItem.checksum && 
            localItem.lastModified > remoteItem.lastModified) {
          changes.uploadFiles.push(path);
        }
      }
    }

    // Find items to download (remote newer or not local)
    for (const [path, remoteItem] of this.state.remote) {
      const localItem = this.state.local.get(path);
      
      if (!localItem) {
        // New remote item
        if (remoteItem.isDirectory) {
          changes.createLocalFolders.push(path);
        } else {
          changes.downloadFiles.push(path);
        }
      } else if (!localItem.isDirectory && !remoteItem.isDirectory) {
        // File exists on both sides - check if remote is newer
        if (localItem.checksum !== remoteItem.checksum && 
            remoteItem.lastModified > localItem.lastModified) {
          changes.downloadFiles.push(path);
        }
      }
    }

    return changes;
  }

  /**
   * Apply sync changes
   */
  private async applyChanges(changes: ReturnType<typeof this.findChanges>): Promise<void> {
    let totalOperations = Object.values(changes).reduce((sum, arr) => sum + arr.length, 0);
    
    if (totalOperations === 0) {
      console.log('📁 No changes to sync');
      return;
    }
    
    console.log(`📊 Sync operations: ${totalOperations}`);
    
    // Create local folders
    for (const folderPath of changes.createLocalFolders) {
      try {
        const localPath = join(this.localPath, folderPath);
        await fs.mkdir(localPath, { recursive: true });
        console.log(`📁 Created local folder: ${folderPath}`);
      } catch (error) {
        console.error(`Failed to create local folder ${folderPath}:`, error);
      }
    }

    // Create remote folders
    for (const folderPath of changes.createRemoteFolders) {
      try {
        await this.client.folders.createPath(`${this.remotePath}/${folderPath}`);
        console.log(`📁 Created remote folder: ${folderPath}`);
      } catch (error) {
        console.error(`Failed to create remote folder ${folderPath}:`, error);
      }
    }

    // Upload files
    for (const filePath of changes.uploadFiles) {
      try {
        const localFilePath = join(this.localPath, filePath);
        const remoteFolderPath = dirname(filePath) === '.' ? this.remotePath : 
                                `${this.remotePath}/${dirname(filePath)}`;
        
        const remoteFolder = await this.client.folders.createPath(remoteFolderPath);
        
        await this.client.upload.file(localFilePath, {
          folderId: remoteFolder.id,
          onProgress: ({ percent }) => {
            process.stdout.write(`\r⬆️  Uploading ${filePath}: ${percent}%`);
          }
        });
        
        console.log(`\n⬆️  Uploaded: ${filePath}`);
      } catch (error) {
        console.error(`Failed to upload ${filePath}:`, error);
      }
    }

    // Download files
    for (const filePath of changes.downloadFiles) {
      try {
        const localFilePath = join(this.localPath, filePath);
        const localDir = dirname(localFilePath);
        
        // Ensure local directory exists
        await fs.mkdir(localDir, { recursive: true });
        
        // Find remote file
        const remoteItem = this.state.remote.get(filePath);
        if (remoteItem) {
          await this.client.files.download(remoteItem.path, {
            destination: localFilePath,
            onProgress: ({ percent }) => {
              process.stdout.write(`\r⬇️  Downloading ${filePath}: ${percent}%`);
            }
          });
          
          console.log(`\n⬇️  Downloaded: ${filePath}`);
        }
      } catch (error) {
        console.error(`Failed to download ${filePath}:`, error);
      }
    }
  }

  /**
   * Start watching local filesystem
   */
  private startLocalWatcher(): void {
    this.watcher = watch(this.localPath, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true
    });

    this.watcher
      .on('add', (path: string) => this.handleLocalChange('add', path))
      .on('change', (path: string) => this.handleLocalChange('change', path))
      .on('unlink', (path: string) => this.handleLocalChange('unlink', path))
      .on('addDir', (path: string) => this.handleLocalChange('addDir', path))
      .on('unlinkDir', (path: string) => this.handleLocalChange('unlinkDir', path));
  }

  /**
   * Start watching remote filesystem
   */
  private startRemoteWatcher(): void {
    const rt = this.client.realtime.connect();
    
    rt.on('file:created', (event) => {
      if (event.data.file.path?.startsWith(this.remotePath)) {
        this.handleRemoteChange('created', event.data.file);
      }
    });
    
    rt.on('file:updated', (event) => {
      if (event.data.file.path?.startsWith(this.remotePath)) {
        this.handleRemoteChange('updated', event.data.file);
      }
    });
    
    rt.on('file:deleted', (event) => {
      if (event.data.file.path?.startsWith(this.remotePath)) {
        this.handleRemoteChange('deleted', event.data.file);
      }
    });
  }

  /**
   * Handle local filesystem changes
   */
  private async handleLocalChange(event: string, path: string): Promise<void> {
    const relativePath = relative(this.localPath, path);
    console.log(`📁 Local change: ${event} ${relativePath}`);
    
    // Debounce rapid changes
    setTimeout(() => {
      this.performSync().catch(console.error);
    }, 1000);
  }

  /**
   * Handle remote filesystem changes
   */
  private async handleRemoteChange(event: string, file: any): Promise<void> {
    const relativePath = relative(this.remotePath, file.path);
    console.log(`☁️  Remote change: ${event} ${relativePath}`);
    
    // Debounce rapid changes
    setTimeout(() => {
      this.performSync().catch(console.error);
    }, 1000);
  }

  /**
   * Calculate file checksum
   */
  private async calculateFileChecksum(filePath: string): Promise<string> {
    const data = await fs.readFile(filePath);
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Get sync statistics
   */
  getStats(): {
    localFiles: number;
    remoteFiles: number;
    lastSync: Date | null;
    isRunning: boolean;
  } {
    return {
      localFiles: Array.from(this.state.local.values()).filter(i => !i.isDirectory).length,
      remoteFiles: Array.from(this.state.remote.values()).filter(i => !i.isDirectory).length,
      lastSync: this.state.lastSync ? new Date(this.state.lastSync) : null,
      isRunning: this.isRunning
    };
  }
}

// Example usage
async function main() {
  const client = await PocketCloudClient.discover({
    apiKey: process.env.POCKETCLOUD_API_KEY
  });

  const syncEngine = new SyncEngine(
    client,
    '/Users/alice/Documents/Projects',
    '/Sync/Projects'
  );

  // Start sync
  await syncEngine.start();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down sync...');
    syncEngine.stop();
    process.exit(0);
  });

  // Keep process alive
  setInterval(() => {
    const stats = syncEngine.getStats();
    console.log(`📊 Stats: ${stats.localFiles} local, ${stats.remoteFiles} remote files`);
  }, 60000);
}

if (require.main === module) {
  main().catch(console.error);
}

export { SyncEngine };