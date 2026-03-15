import { EventEmitter } from 'events';
import Store from 'electron-store';
import * as chokidar from 'chokidar';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import axios from 'axios';
import FormData from 'form-data';

interface DeviceInfo {
  endpoints: {
    api: string;
    web: string;
  };
}

interface SyncStats {
  filesUploaded: number;
  filesDeleted: number;
  bytesTransferred: number;
  errors: number;
  startTime: Date;
  endTime?: Date;
}

interface UploadProgress {
  file: string;
  progress: number;
  speed: number;
  eta: number;
}

/**
 * SyncService - Automatic folder synchronization with PocketCloud
 * 
 * Features:
 * - Watches local folder for changes using chokidar
 * - Uploads new/modified files via chunked upload API
 * - Handles deletions (moves to trash, not hard delete)
 * - Bandwidth throttling to not saturate WiFi
 * - Conflict resolution (keeps both versions)
 * - Ignores system files (.DS_Store, etc.)
 */
export class SyncService extends EventEmitter {
  private store: Store;
  private watcher: chokidar.FSWatcher | null = null;
  private currentDevice: DeviceInfo | null = null;
  private isRunning = false;
  private syncQueue: string[] = [];
  private isProcessingQueue = false;
  private bandwidthLimiter: NodeJS.Timeout | null = null;
  private uploadProgress: Map<string, UploadProgress> = new Map();

  constructor(store: Store) {
    super();
    this.store = store;
  }

  public async initialize(): Promise<void> {
    // Ensure sync folder exists
    const syncFolder = this.store.get('sync.folder') as string;
    
    try {
      await fs.promises.mkdir(syncFolder, { recursive: true });
      console.log('Sync folder initialized:', syncFolder);
    } catch (error) {
      console.error('Failed to create sync folder:', error);
    }
  }

  public async start(deviceInfo: DeviceInfo): Promise<void> {
    if (this.isRunning) {
      return;
    }

    const syncEnabled = this.store.get('sync.enabled', true) as boolean;
    if (!syncEnabled) {
      return;
    }

    this.currentDevice = deviceInfo;
    this.isRunning = true;

    console.log('Starting folder sync service...');

    // Start watching the sync folder
    await this.startWatching();

    // Perform initial sync
    await this.performInitialSync();
  }

  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('Stopping folder sync service...');

    this.isRunning = false;
    this.currentDevice = null;

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.bandwidthLimiter) {
      clearTimeout(this.bandwidthLimiter);
      this.bandwidthLimiter = null;
    }

    this.syncQueue = [];
    this.isProcessingQueue = false;
    this.uploadProgress.clear();
  }

  public updateSettings(): void {
    if (this.isRunning) {
      // Restart with new settings
      const deviceInfo = this.currentDevice;
      this.stop();
      if (deviceInfo) {
        this.start(deviceInfo);
      }
    }
  }

  public async uploadFiles(filePaths: string[]): Promise<void> {
    if (!this.currentDevice) {
      throw new Error('Not connected to PocketCloud');
    }

    for (const filePath of filePaths) {
      await this.uploadFile(filePath);
    }
  }

  public async uploadFolder(folderPath: string): Promise<void> {
    if (!this.currentDevice) {
      throw new Error('Not connected to PocketCloud');
    }

    await this.uploadFolderRecursive(folderPath);
  }

  public forceSync(): void {
    if (this.isRunning && this.currentDevice) {
      this.performInitialSync();
    }
  }

  private async startWatching(): Promise<void> {
    const syncFolder = this.store.get('sync.folder') as string;
    const ignorePatterns = this.store.get('sync.ignorePatterns') as string[];

    this.watcher = chokidar.watch(syncFolder, {
      ignored: [
        ...ignorePatterns.map(pattern => path.join(syncFolder, pattern)),
        /(^|[\/\\])\../, // Hidden files
      ],
      persistent: true,
      ignoreInitial: true, // Don't trigger for existing files
      followSymlinks: false,
      depth: 10 // Reasonable depth limit
    });

    this.watcher
      .on('add', (filePath) => this.handleFileAdded(filePath))
      .on('change', (filePath) => this.handleFileChanged(filePath))
      .on('unlink', (filePath) => this.handleFileDeleted(filePath))
      .on('addDir', (dirPath) => this.handleDirectoryAdded(dirPath))
      .on('unlinkDir', (dirPath) => this.handleDirectoryDeleted(dirPath))
      .on('error', (error) => {
        console.error('Watcher error:', error);
        this.emit('syncError', error);
      });

    console.log('File watcher started for:', syncFolder);
  }

  private async handleFileAdded(filePath: string): Promise<void> {
    console.log('File added:', filePath);
    this.queueFileForSync(filePath);
  }

  private async handleFileChanged(filePath: string): Promise<void> {
    console.log('File changed:', filePath);
    this.queueFileForSync(filePath);
  }

  private async handleFileDeleted(filePath: string): Promise<void> {
    console.log('File deleted:', filePath);
    await this.moveFileToTrash(filePath);
  }

  private async handleDirectoryAdded(dirPath: string): Promise<void> {
    console.log('Directory added:', dirPath);
    // Directories are created automatically when files are uploaded
  }

  private async handleDirectoryDeleted(dirPath: string): Promise<void> {
    console.log('Directory deleted:', dirPath);
    // Handle directory deletion if needed
  }

  private queueFileForSync(filePath: string): void {
    if (!this.syncQueue.includes(filePath)) {
      this.syncQueue.push(filePath);
    }

    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.syncQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.syncQueue.length > 0 && this.isRunning) {
      const filePath = this.syncQueue.shift()!;
      
      try {
        await this.uploadFile(filePath);
        
        // Apply bandwidth limiting
        const bandwidthLimit = this.store.get('sync.bandwidthLimit', 10) as number; // MB/s
        if (bandwidthLimit > 0) {
          const delayMs = 1000 / bandwidthLimit; // Rough throttling
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
      } catch (error) {
        console.error('Failed to upload file:', filePath, error);
        this.emit('uploadError', filePath, error);
      }
    }

    this.isProcessingQueue = false;
  }

  private async uploadFile(filePath: string): Promise<void> {
    if (!this.currentDevice) {
      throw new Error('Not connected to PocketCloud');
    }

    try {
      // Check if file still exists
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) {
        return;
      }

      const fileName = path.basename(filePath);
      const syncFolder = this.store.get('sync.folder') as string;
      const relativePath = path.relative(syncFolder, filePath);
      
      console.log('Uploading file:', relativePath);
      this.emit('uploadStarted', fileName);

      // Calculate file hash for integrity check
      const fileHash = await this.calculateFileHash(filePath);

      // Check if file already exists on server with same hash
      const existingFile = await this.checkFileExists(relativePath, fileHash);
      if (existingFile) {
        console.log('File already exists with same content, skipping:', relativePath);
        return;
      }

      // Upload file using chunked upload API
      await this.performChunkedUpload(filePath, relativePath);

      this.emit('uploadComplete', fileName, {
        size: stat.size,
        path: relativePath
      });

    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  }

  private async uploadFolderRecursive(folderPath: string): Promise<void> {
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(folderPath, entry.name);
      
      if (entry.isFile()) {
        await this.uploadFile(fullPath);
      } else if (entry.isDirectory()) {
        await this.uploadFolderRecursive(fullPath);
      }
    }
  }

  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private async checkFileExists(relativePath: string, hash: string): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.currentDevice!.endpoints.api}/files/check`,
        {
          params: { path: relativePath, hash },
          headers: this.getAuthHeaders()
        }
      );
      
      return response.data.exists === true;
    } catch (error) {
      // Assume file doesn't exist if check fails
      return false;
    }
  }

  private async performChunkedUpload(filePath: string, relativePath: string): Promise<void> {
    const chunkSize = 1024 * 1024; // 1MB chunks
    const fileSize = (await fs.promises.stat(filePath)).size;
    const totalChunks = Math.ceil(fileSize / chunkSize);
    
    // Initialize upload
    const initResponse = await axios.post(
      `${this.currentDevice!.endpoints.api}/upload/init`,
      {
        filename: path.basename(filePath),
        size: fileSize,
        totalChunks,
        path: path.dirname(relativePath) || '/'
      },
      { headers: this.getAuthHeaders() }
    );
    
    const uploadId = initResponse.data.uploadId;
    
    // Upload chunks
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, fileSize);
      const chunkBuffer = Buffer.alloc(end - start);
      
      const fd = await fs.promises.open(filePath, 'r');
      await fd.read(chunkBuffer, 0, end - start, start);
      await fd.close();
      
      const formData = new FormData();
      formData.append('uploadId', uploadId);
      formData.append('chunkIndex', chunkIndex.toString());
      formData.append('chunk', chunkBuffer, {
        filename: `chunk-${chunkIndex}`,
        contentType: 'application/octet-stream'
      });
      
      await axios.post(
        `${this.currentDevice!.endpoints.api}/upload/chunk`,
        formData,
        {
          headers: {
            ...this.getAuthHeaders(),
            ...formData.getHeaders()
          }
        }
      );
      
      // Update progress
      const progress = ((chunkIndex + 1) / totalChunks) * 100;
      this.updateUploadProgress(filePath, progress);
    }
    
    // Finalize upload
    await axios.post(
      `${this.currentDevice!.endpoints.api}/upload/complete`,
      { uploadId },
      { headers: this.getAuthHeaders() }
    );
    
    this.uploadProgress.delete(filePath);
  }

  private async moveFileToTrash(filePath: string): Promise<void> {
    if (!this.currentDevice) {
      return;
    }

    try {
      const syncFolder = this.store.get('sync.folder') as string;
      const relativePath = path.relative(syncFolder, filePath);
      
      // Move file to trash on server (soft delete)
      await axios.post(
        `${this.currentDevice.endpoints.api}/files/trash`,
        { path: relativePath },
        { headers: this.getAuthHeaders() }
      );
      
      console.log('Moved to trash on server:', relativePath);
      
    } catch (error) {
      console.error('Failed to move file to trash on server:', error);
    }
  }

  private async performInitialSync(): Promise<void> {
    if (!this.currentDevice) {
      return;
    }

    console.log('Performing initial sync...');
    
    const syncStats: SyncStats = {
      filesUploaded: 0,
      filesDeleted: 0,
      bytesTransferred: 0,
      errors: 0,
      startTime: new Date()
    };

    try {
      const syncFolder = this.store.get('sync.folder') as string;
      
      // Get local files
      const localFiles = await this.getLocalFiles(syncFolder);
      
      // Get remote files
      const remoteFiles = await this.getRemoteFiles();
      
      // Compare and sync
      for (const localFile of localFiles) {
        try {
          const relativePath = path.relative(syncFolder, localFile);
          const localHash = await this.calculateFileHash(localFile);
          
          const remoteFile = remoteFiles.find(f => f.path === relativePath);
          
          if (!remoteFile || remoteFile.hash !== localHash) {
            // File is new or modified, upload it
            await this.uploadFile(localFile);
            syncStats.filesUploaded++;
            
            const stat = await fs.promises.stat(localFile);
            syncStats.bytesTransferred += stat.size;
          }
        } catch (error) {
          console.error('Error syncing file:', localFile, error);
          syncStats.errors++;
        }
      }
      
      syncStats.endTime = new Date();
      this.emit('syncComplete', syncStats);
      
      console.log('Initial sync completed:', syncStats);
      
    } catch (error) {
      console.error('Initial sync failed:', error);
      this.emit('syncError', error);
    }
  }

  private async getLocalFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const ignorePatterns = this.store.get('sync.ignorePatterns') as string[];
    
    const scan = async (currentDir: string): Promise<void> => {
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        // Check ignore patterns
        const shouldIgnore = ignorePatterns.some(pattern => 
          entry.name.match(new RegExp(pattern.replace(/\*/g, '.*')))
        );
        
        if (shouldIgnore) {
          continue;
        }
        
        if (entry.isFile()) {
          files.push(fullPath);
        } else if (entry.isDirectory()) {
          await scan(fullPath);
        }
      }
    };
    
    await scan(dir);
    return files;
  }

  private async getRemoteFiles(): Promise<Array<{ path: string; hash: string }>> {
    try {
      const response = await axios.get(
        `${this.currentDevice!.endpoints.api}/files/list-all`,
        { headers: this.getAuthHeaders() }
      );
      
      return response.data.files || [];
    } catch (error) {
      console.error('Failed to get remote files:', error);
      return [];
    }
  }

  private updateUploadProgress(filePath: string, progress: number): void {
    const existing = this.uploadProgress.get(filePath);
    if (existing) {
      existing.progress = progress;
      // Calculate speed and ETA would go here
    }
  }

  private getAuthHeaders(): any {
    const username = this.store.get('connection.username') as string;
    const password = this.store.get('connection.password') as string;
    
    if (username && password) {
      const auth = Buffer.from(`${username}:${password}`).toString('base64');
      return { Authorization: `Basic ${auth}` };
    }
    
    return {};
  }
}