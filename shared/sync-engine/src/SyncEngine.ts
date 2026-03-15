import { EventEmitter } from 'events';
import { watch, FSWatcher } from 'chokidar';
import { createHash } from 'crypto';
import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, relative, basename } from 'path';
import Database from 'better-sqlite3';

export interface SyncEngineConfig {
  localPath: string;
  remotePath: string;
  apiClient: any;
  conflictStrategy: 'ask_user' | 'newer_wins' | 'larger_wins' | 'keep_both';
  bandwidthLimit: number; // bytes per second, 0 = unlimited
  syncSchedule: 'continuous' | 'periodic' | 'manual';
  syncInterval: number; // seconds for periodic sync
  selectiveSync: string[]; // excluded paths
}

export interface SyncStatus {
  phase: 'idle' | 'scanning' | 'comparing' | 'syncing' | 'paused' | 'error';
  progress: number; // 0-100
  lastSync: number; // timestamp
  pendingItems: number;
  currentOperation?: string;
  error?: string;
}

export interface FileItem {
  path: string;
  hash: string;
  mtime: number;
  size: number;
  isDirectory: boolean;
}

export interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number; // tokens per second
}

export class SyncEngine extends EventEmitter {
  private config: SyncEngineConfig;
  private clientId: string | null = null;
  private watcher: FSWatcher | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private hashCache: Map<string, { hash: string; mtime: number; size: number }> = new Map();
  private pendingOperations: Set<string> = new Set();
  private status: SyncStatus;
  private db: Database.Database;
  private tokenBucket: TokenBucket;
  private isRunning = false;
  private isPaused = false;

  constructor(config: SyncEngineConfig) {
    super();
    this.config = config;
    this.status = {
      phase: 'idle',
      progress: 0,
      lastSync: 0,
      pendingItems: 0
    };

    // Initialize token bucket for bandwidth limiting
    this.tokenBucket = {
      tokens: config.bandwidthLimit || 1000000, // 1MB default
      lastRefill: Date.now(),
      capacity: config.bandwidthLimit || 1000000,
      refillRate: config.bandwidthLimit || 1000000
    };

    // Initialize local database for hash cache and state
    this.initializeDatabase();
  }

  /**
   * Initialize local SQLite database for caching
   */
  private initializeDatabase(): void {
    const dbPath = join(this.config.localPath, '.pocketcloud', 'sync.db');
    mkdirSync(dirname(dbPath), { recursive: true });
    
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for crash safety
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 10000');

    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_cache (
        path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        mtime INTEGER NOT NULL,
        size INTEGER NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS sync_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_file_cache_mtime ON file_cache(mtime);
      CREATE INDEX IF NOT EXISTS idx_file_cache_updated ON file_cache(updated_at);
    `);

    // Load hash cache from database
    this.loadHashCache();
  }

  /**
   * Load hash cache from database
   */
  private loadHashCache(): void {
    try {
      const stmt = this.db.prepare('SELECT path, hash, mtime, size FROM file_cache');
      const rows = stmt.all() as Array<{ path: string; hash: string; mtime: number; size: number }>;
      
      for (const row of rows) {
        this.hashCache.set(row.path, {
          hash: row.hash,
          mtime: row.mtime,
          size: row.size
        });
      }

      console.log(`Loaded ${this.hashCache.size} cached file hashes`);
    } catch (error) {
      console.error('Failed to load hash cache:', error);
    }
  }

  /**
   * Save hash to cache and database
   */
  private saveHashToCache(path: string, hash: string, mtime: number, size: number): void {
    this.hashCache.set(path, { hash, mtime, size });
    
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO file_cache (path, hash, mtime, size, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(path, hash, mtime, size, Date.now());
    } catch (error) {
      console.error('Failed to save hash to cache:', error);
    }
  }

  /**
   * Start sync engine
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Sync engine is already running');
    }

    try {
      // Register with server if not already registered
      if (!this.clientId) {
        await this.registerWithServer();
      }

      // Start file watcher for continuous sync
      if (this.config.syncSchedule === 'continuous') {
        this.startFileWatcher();
      }

      // Start periodic sync timer
      if (this.config.syncSchedule === 'periodic') {
        this.startPeriodicSync();
      }

      this.isRunning = true;
      this.updateStatus({ phase: 'idle' });
      
      // Perform initial sync
      await this.performSync();

      this.emit('started');
      console.log('Sync engine started successfully');

    } catch (error) {
      this.updateStatus({ phase: 'error', error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Stop sync engine
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop file watcher
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    // Stop periodic timer
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    // Close database
    if (this.db) {
      this.db.close();
    }

    this.updateStatus({ phase: 'idle' });
    this.emit('stopped');
    console.log('Sync engine stopped');
  }

  /**
   * Pause sync operations
   */
  public pause(): void {
    this.isPaused = true;
    this.updateStatus({ phase: 'paused' });
    this.emit('paused');
  }

  /**
   * Resume sync operations
   */
  public resume(): void {
    this.isPaused = false;
    this.updateStatus({ phase: 'idle' });
    this.emit('resumed');
    
    // Trigger sync if there are pending operations
    if (this.pendingOperations.size > 0) {
      this.performSync();
    }
  }

  /**
   * Get current sync status
   */
  public getStatus(): SyncStatus {
    return { ...this.status };
  }

  /**
   * Register with server
   */
  private async registerWithServer(): Promise<void> {
    try {
      const deviceName = this.getDeviceName();
      const deviceOs = this.getDeviceOs();

      const response = await this.config.apiClient.post('/api/sync/register', {
        deviceName,
        deviceOs,
        syncFolder: this.config.remotePath,
        localPath: this.config.localPath
      });

      this.clientId = response.data.clientId;
      
      // Save client ID to database
      const stmt = this.db.prepare('INSERT OR REPLACE INTO sync_config (key, value) VALUES (?, ?)');
      stmt.run('clientId', this.clientId);

      console.log(`Registered sync client: ${this.clientId}`);
    } catch (error) {
      throw new Error(`Failed to register with server: ${(error as Error).message}`);
    }
  }

  /**
   * Start file watcher for real-time sync
   */
  private startFileWatcher(): void {
    const watchOptions = {
      ignored: [
        '**/.pocketcloud/**',
        '**/node_modules/**',
        '**/.git/**',
        '**/.DS_Store',
        '**/Thumbs.db',
        '**/*.tmp',
        '**/*.temp'
      ],
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
      depth: 10, // Limit recursion depth
      awaitWriteFinish: {
        stabilityThreshold: 500, // Wait 500ms after last change
        pollInterval: 100
      }
    };

    this.watcher = watch(this.config.localPath, watchOptions);

    this.watcher.on('add', (path) => this.onFileChange(path, 'add'));
    this.watcher.on('change', (path) => this.onFileChange(path, 'change'));
    this.watcher.on('unlink', (path) => this.onFileChange(path, 'unlink'));
    this.watcher.on('addDir', (path) => this.onFileChange(path, 'addDir'));
    this.watcher.on('unlinkDir', (path) => this.onFileChange(path, 'unlinkDir'));

    this.watcher.on('error', (error) => {
      console.error('File watcher error:', error);
      this.emit('error', error);
    });

    console.log(`File watcher started for: ${this.config.localPath}`);
  }

  /**
   * Start periodic sync timer
   */
  private startPeriodicSync(): void {
    this.syncTimer = setInterval(() => {
      if (!this.isPaused && this.status.phase === 'idle') {
        this.performSync();
      }
    }, this.config.syncInterval * 1000);

    console.log(`Periodic sync started: every ${this.config.syncInterval} seconds`);
  }

  /**
   * Handle file system changes
   */
  private onFileChange(path: string, event: string): void {
    if (this.isPaused || !this.isRunning) {
      return;
    }

    const relativePath = relative(this.config.localPath, path);
    
    // Check if path is excluded by selective sync
    if (this.isPathExcluded(relativePath)) {
      return;
    }

    console.log(`File ${event}: ${relativePath}`);
    
    // Add to pending operations with debounce
    this.pendingOperations.add(relativePath);
    
    // Debounce sync operations
    setTimeout(() => {
      if (this.pendingOperations.has(relativePath) && !this.isPaused) {
        this.performSync();
      }
    }, 1000); // 1 second debounce
  }

  /**
   * Check if path is excluded by selective sync
   */
  private isPathExcluded(path: string): boolean {
    for (const excludePattern of this.config.selectiveSync) {
      if (path.startsWith(excludePattern)) {
        return true;
      }
    }
    return false;
  }
  /**
   * Perform full sync operation
   */
  private async performSync(): Promise<void> {
    if (this.isPaused || !this.isRunning || this.status.phase !== 'idle') {
      return;
    }

    try {
      this.updateStatus({ phase: 'scanning', progress: 0 });

      // Scan local files
      const localFiles = await this.scanLocalFiles();
      
      this.updateStatus({ phase: 'comparing', progress: 30 });

      // Send scan to server and get delta
      const delta = await this.sendScanToServer(localFiles);
      
      this.updateStatus({ phase: 'syncing', progress: 50 });

      // Execute sync operations
      await this.executeSyncOperations(delta);
      
      this.updateStatus({ 
        phase: 'idle', 
        progress: 100, 
        lastSync: Date.now(),
        pendingItems: 0
      });

      // Clear pending operations
      this.pendingOperations.clear();

      this.emit('syncCompleted', {
        uploadCount: delta.toUpload?.length || 0,
        downloadCount: delta.toDownload?.length || 0,
        deleteCount: delta.toDelete?.length || 0,
        conflictCount: delta.conflicts?.length || 0
      });

    } catch (error) {
      this.updateStatus({ 
        phase: 'error', 
        error: (error as Error).message 
      });
      
      this.emit('syncError', error);
      console.error('Sync failed:', error);
    }
  }

  /**
   * Scan local files and compute hashes
   */
  private async scanLocalFiles(): Promise<FileItem[]> {
    const files: FileItem[] = [];
    
    const scanDirectory = async (dirPath: string): Promise<void> => {
      try {
        const { readdirSync } = await import('fs');
        const entries = readdirSync(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = join(dirPath, entry.name);
          const relativePath = relative(this.config.localPath, fullPath);
          
          // Skip excluded paths
          if (this.isPathExcluded(relativePath)) {
            continue;
          }
          
          // Skip system files
          if (this.isSystemFile(entry.name)) {
            continue;
          }

          if (entry.isDirectory()) {
            files.push({
              path: relativePath,
              hash: '',
              mtime: 0,
              size: 0,
              isDirectory: true
            });
            
            // Recursively scan subdirectory
            await scanDirectory(fullPath);
          } else if (entry.isFile()) {
            const stats = statSync(fullPath);
            const hash = await this.getFileHash(fullPath, stats.mtime, stats.size);
            
            files.push({
              path: relativePath,
              hash,
              mtime: stats.mtimeMs,
              size: stats.size,
              isDirectory: false
            });
          }
        }
      } catch (error) {
        console.error(`Failed to scan directory ${dirPath}:`, error);
      }
    };

    await scanDirectory(this.config.localPath);
    
    console.log(`Scanned ${files.length} local files`);
    return files;
  }

  /**
   * Get file hash with caching
   */
  private async getFileHash(filePath: string, mtime: number, size: number): Promise<string> {
    const relativePath = relative(this.config.localPath, filePath);
    const cached = this.hashCache.get(relativePath);
    
    // Return cached hash if file hasn't changed
    if (cached && cached.mtime === mtime && cached.size === size) {
      return cached.hash;
    }

    // Calculate hash in worker thread to avoid blocking UI
    const hash = await this.calculateFileHashAsync(filePath);
    
    // Cache the result
    this.saveHashToCache(relativePath, hash, mtime, size);
    
    return hash;
  }

  /**
   * Calculate file hash asynchronously
   */
  private async calculateFileHashAsync(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Use worker thread for large files to avoid blocking
      const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
      
      if (isMainThread) {
        const worker = new Worker(__filename, {
          workerData: { filePath, action: 'calculateHash' }
        });
        
        worker.on('message', (hash: string) => {
          worker.terminate();
          resolve(hash);
        });
        
        worker.on('error', (error: Error) => {
          worker.terminate();
          reject(error);
        });
      } else {
        // Worker thread code
        if (workerData?.action === 'calculateHash') {
          try {
            const fileBuffer = readFileSync(workerData.filePath);
            const hash = createHash('sha256').update(fileBuffer).digest('hex');
            parentPort?.postMessage(hash);
          } catch (error) {
            throw error;
          }
        }
      }
    });
  }

  /**
   * Send scan results to server and get sync delta
   */
  private async sendScanToServer(files: FileItem[]): Promise<any> {
    if (!this.clientId) {
      throw new Error('Client not registered');
    }

    try {
      const response = await this.config.apiClient.post('/api/sync/scan', {
        clientId: this.clientId,
        items: files,
        conflictStrategy: this.config.conflictStrategy
      });

      return response.data.delta;
    } catch (error) {
      throw new Error(`Failed to send scan to server: ${(error as Error).message}`);
    }
  }

  /**
   * Execute sync operations (upload, download, delete)
   */
  private async executeSyncOperations(delta: any): Promise<void> {
    const operations: any[] = [];
    let completed = 0;
    const total = (delta.toUpload?.length || 0) + (delta.toDownload?.length || 0) + (delta.toDelete?.length || 0);

    // Handle conflicts first
    if (delta.conflicts?.length > 0) {
      await this.handleConflicts(delta.conflicts);
    }

    // Process downloads first (server → client)
    for (const item of delta.toDownload || []) {
      try {
        await this.downloadFile(item);
        operations.push({
          type: 'download',
          path: item.path,
          fileId: item.fileId,
          success: true
        });
      } catch (error) {
        operations.push({
          type: 'download',
          path: item.path,
          fileId: item.fileId,
          success: false,
          error: (error as Error).message
        });
      }
      
      completed++;
      this.updateStatus({ 
        progress: 50 + Math.round((completed / total) * 40),
        currentOperation: `Downloading ${item.path}`
      });
    }

    // Process uploads (client → server)
    for (const item of delta.toUpload || []) {
      try {
        const fileId = await this.uploadFile(item);
        const localPath = join(this.config.localPath, item.path);
        const stats = statSync(localPath);
        const hash = await this.getFileHash(localPath, stats.mtimeMs, stats.size);
        
        operations.push({
          type: 'upload',
          path: item.path,
          fileId,
          hash,
          mtime: stats.mtimeMs,
          success: true
        });
      } catch (error) {
        operations.push({
          type: 'upload',
          path: item.path,
          success: false,
          error: (error as Error).message
        });
      }
      
      completed++;
      this.updateStatus({ 
        progress: 50 + Math.round((completed / total) * 40),
        currentOperation: `Uploading ${item.path}`
      });
    }

    // Process deletions
    for (const item of delta.toDelete || []) {
      try {
        await this.deleteFile(item);
        operations.push({
          type: 'delete',
          path: item.path,
          success: true
        });
      } catch (error) {
        operations.push({
          type: 'delete',
          path: item.path,
          success: false,
          error: (error as Error).message
        });
      }
      
      completed++;
      this.updateStatus({ 
        progress: 50 + Math.round((completed / total) * 40),
        currentOperation: `Deleting ${item.path}`
      });
    }

    // Report completion to server
    await this.reportSyncCompletion(operations);
  }

  /**
   * Handle sync conflicts
   */
  private async handleConflicts(conflicts: any[]): Promise<void> {
    for (const conflict of conflicts) {
      this.emit('conflict', conflict);
      
      // For now, emit conflict event and let UI handle it
      // In automatic modes, resolve based on strategy
      if (this.config.conflictStrategy !== 'ask_user') {
        // Auto-resolve based on strategy
        // Implementation depends on strategy
      }
    }
  }

  /**
   * Download file from server
   */
  private async downloadFile(item: any): Promise<void> {
    const localPath = join(this.config.localPath, item.path);
    
    // Ensure directory exists
    mkdirSync(dirname(localPath), { recursive: true });
    
    // Apply bandwidth throttling
    await this.waitForBandwidth(0); // Will be set based on file size
    
    try {
      const response = await this.config.apiClient.get(`/api/files/${item.fileId}/download`, {
        responseType: 'stream'
      });
      
      // Stream file to disk with progress tracking
      const writer = require('fs').createWriteStream(localPath);
      response.data.pipe(writer);
      
      return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
    } catch (error) {
      throw new Error(`Failed to download ${item.path}: ${(error as Error).message}`);
    }
  }

  /**
   * Upload file to server
   */
  private async uploadFile(item: any): Promise<string> {
    const localPath = join(this.config.localPath, item.path);
    
    if (!existsSync(localPath)) {
      throw new Error(`Local file not found: ${item.path}`);
    }

    const stats = statSync(localPath);
    
    // Apply bandwidth throttling
    await this.waitForBandwidth(stats.size);
    
    try {
      const FormData = require('form-data');
      const form = new FormData();
      
      form.append('file', require('fs').createReadStream(localPath));
      form.append('path', dirname(item.path));
      
      const response = await this.config.apiClient.post('/api/upload', form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });
      
      return response.data.fileId;
    } catch (error) {
      throw new Error(`Failed to upload ${item.path}: ${(error as Error).message}`);
    }
  }

  /**
   * Delete file (local or remote based on reason)
   */
  private async deleteFile(item: any): Promise<void> {
    if (item.reason === 'deleted_on_server') {
      // Delete local file
      const localPath = join(this.config.localPath, item.path);
      if (existsSync(localPath)) {
        const { unlinkSync } = await import('fs');
        unlinkSync(localPath);
      }
    } else if (item.reason === 'deleted_on_client') {
      // Delete on server (implement server-side delete API)
      // For now, just log
      console.log(`Would delete on server: ${item.path}`);
    }
  }

  /**
   * Report sync completion to server
   */
  private async reportSyncCompletion(operations: any[]): Promise<void> {
    if (!this.clientId) {
      return;
    }

    try {
      await this.config.apiClient.post('/api/sync/complete', {
        clientId: this.clientId,
        operations
      });
    } catch (error) {
      console.error('Failed to report sync completion:', error);
    }
  }

  /**
   * Wait for bandwidth tokens (throttling)
   */
  private async waitForBandwidth(bytes: number): Promise<void> {
    if (this.config.bandwidthLimit === 0) {
      return; // No limit
    }

    const now = Date.now();
    const timePassed = (now - this.tokenBucket.lastRefill) / 1000;
    
    // Refill tokens
    this.tokenBucket.tokens = Math.min(
      this.tokenBucket.capacity,
      this.tokenBucket.tokens + (timePassed * this.tokenBucket.refillRate)
    );
    this.tokenBucket.lastRefill = now;

    // Wait if not enough tokens
    if (bytes > this.tokenBucket.tokens) {
      const waitTime = (bytes - this.tokenBucket.tokens) / this.tokenBucket.refillRate * 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.tokenBucket.tokens = 0;
    } else {
      this.tokenBucket.tokens -= bytes;
    }
  }

  /**
   * Update sync status and emit event
   */
  private updateStatus(updates: Partial<SyncStatus>): void {
    Object.assign(this.status, updates);
    this.emit('statusChanged', this.status);
  }

  /**
   * Check if file is a system file to ignore
   */
  private isSystemFile(filename: string): boolean {
    const systemFiles = [
      '.DS_Store', 'Thumbs.db', 'desktop.ini', '.Spotlight-V100',
      '.Trashes', '.fseventsd', '.TemporaryItems', '.DocumentRevisions-V100',
      '.pocketcloud'
    ];
    
    return systemFiles.includes(filename) || filename.startsWith('~$');
  }

  /**
   * Get device name
   */
  private getDeviceName(): string {
    const os = require('os');
    return os.hostname() || 'Unknown Device';
  }

  /**
   * Get device OS
   */
  private getDeviceOs(): 'macos' | 'windows' | 'linux' {
    const platform = process.platform;
    
    switch (platform) {
      case 'darwin': return 'macos';
      case 'win32': return 'windows';
      case 'linux': return 'linux';
      default: return 'linux';
    }
  }

  /**
   * Trigger manual sync
   */
  public async triggerSync(): Promise<void> {
    if (this.status.phase === 'idle') {
      await this.performSync();
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<SyncEngineConfig>): void {
    Object.assign(this.config, updates);
    
    // Restart watcher if sync schedule changed
    if (updates.syncSchedule && this.isRunning) {
      this.stop().then(() => this.start());
    }
  }
}