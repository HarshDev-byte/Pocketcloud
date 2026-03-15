import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { existsSync, statSync, readFileSync } from 'fs';
import { join, relative, dirname } from 'path';
import { db } from '../db';
import { LoggerService } from './logger.service';
import { realtimeService } from './realtime.service';

export interface SyncClient {
  id: string;
  user_id: string;
  device_name: string;
  device_os: 'macos' | 'windows' | 'linux';
  last_seen: number;
  sync_folder: string;
  local_path: string;
  status: 'idle' | 'scanning' | 'comparing' | 'syncing' | 'error';
}

export interface SyncState {
  client_id: string;
  file_id: string;
  local_path: string;
  local_hash: string;
  local_mtime: number;
  synced_at: number;
}

export interface SyncItem {
  path: string;
  hash: string;
  mtime: number;
  size: number;
  isDirectory?: boolean;
}

export interface SyncDelta {
  toUpload: Array<{
    path: string;
    reason: 'new' | 'modified' | 'conflict_client_newer';
  }>;
  toDownload: Array<{
    path: string;
    fileId: string;
    reason: 'new' | 'modified' | 'conflict_server_newer';
  }>;
  toDelete: Array<{
    path: string;
    reason: 'deleted_on_server' | 'deleted_on_client';
  }>;
  conflicts: Array<{
    path: string;
    clientHash: string;
    serverHash: string;
    clientMtime: number;
    serverMtime: number;
  }>;
}

export interface ConflictResolution {
  strategy: 'keep_client' | 'keep_server' | 'keep_both' | 'ask_user';
  clientPath?: string;
  serverPath?: string;
}

export class SyncService extends EventEmitter {
  private static instance: SyncService;
  private activeSyncs = new Map<string, { status: string; progress: number }>();

  private constructor() {
    super();
    this.initializeTables();
  }

  public static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  /**
   * Initialize sync database tables
   */
  private initializeTables(): void {
    try {
      // Sync clients table
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_clients (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          device_name TEXT NOT NULL,
          device_os TEXT NOT NULL CHECK (device_os IN ('macos', 'windows', 'linux')),
          last_seen INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
          sync_folder TEXT,
          local_path TEXT,
          status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'scanning', 'comparing', 'syncing', 'error')),
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
        )
      `);

      // Sync state table
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_state (
          client_id TEXT NOT NULL REFERENCES sync_clients(id) ON DELETE CASCADE,
          file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
          local_path TEXT NOT NULL,
          local_hash TEXT NOT NULL,
          local_mtime INTEGER NOT NULL,
          synced_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
          PRIMARY KEY (client_id, file_id)
        )
      `);

      // Sync conflicts table
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_conflicts (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL REFERENCES sync_clients(id) ON DELETE CASCADE,
          file_path TEXT NOT NULL,
          client_hash TEXT NOT NULL,
          server_hash TEXT NOT NULL,
          client_mtime INTEGER NOT NULL,
          server_mtime INTEGER NOT NULL,
          resolution TEXT CHECK (resolution IN ('keep_client', 'keep_server', 'keep_both', 'ask_user')),
          resolved_at INTEGER,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
        )
      `);

      // Indexes for performance
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sync_clients_user_id ON sync_clients(user_id);
        CREATE INDEX IF NOT EXISTS idx_sync_clients_status ON sync_clients(status);
        CREATE INDEX IF NOT EXISTS idx_sync_state_client_id ON sync_state(client_id);
        CREATE INDEX IF NOT EXISTS idx_sync_state_synced_at ON sync_state(synced_at DESC);
        CREATE INDEX IF NOT EXISTS idx_sync_conflicts_client_id ON sync_conflicts(client_id);
        CREATE INDEX IF NOT EXISTS idx_sync_conflicts_resolved ON sync_conflicts(resolved_at);
      `);

      LoggerService.info('sync', 'Sync database tables initialized');
    } catch (error) {
      LoggerService.error('sync', 'Failed to initialize sync tables', undefined, {
        error: (error as Error).message
      });
      throw error;
    }
  }
  /**
   * Register a new sync client
   */
  public async registerClient(
    userId: string,
    deviceName: string,
    deviceOs: 'macos' | 'windows' | 'linux',
    syncFolder: string,
    localPath: string
  ): Promise<string> {
    const clientId = this.generateClientId();
    
    try {
      const stmt = db.prepare(`
        INSERT INTO sync_clients (id, user_id, device_name, device_os, sync_folder, local_path)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(clientId, userId, deviceName, deviceOs, syncFolder, localPath);
      
      LoggerService.info('sync', `Sync client registered: ${deviceName}`, userId, {
        clientId,
        deviceOs,
        syncFolder,
        localPath
      });

      // Broadcast to user's devices
      realtimeService.broadcastToUser(userId, 'SYNC_CLIENT_REGISTERED', {
        clientId,
        deviceName,
        deviceOs,
        syncFolder
      });

      return clientId;
    } catch (error) {
      LoggerService.error('sync', 'Failed to register sync client', userId, {
        error: (error as Error).message,
        deviceName,
        deviceOs
      });
      throw new Error('Failed to register sync client');
    }
  }

  /**
   * Process sync scan from client and return delta
   */
  public async processScan(
    clientId: string,
    items: SyncItem[],
    conflictStrategy: 'ask_user' | 'newer_wins' | 'larger_wins' | 'keep_both' = 'ask_user'
  ): Promise<SyncDelta> {
    try {
      // Update client status
      this.updateClientStatus(clientId, 'comparing');
      
      const client = this.getClient(clientId);
      if (!client) {
        throw new Error('Sync client not found');
      }

      LoggerService.info('sync', `Processing sync scan for ${client.device_name}`, client.user_id, {
        clientId,
        itemCount: items.length
      });

      // Get current sync state for this client
      const currentState = this.getCurrentSyncState(clientId);
      
      // Get server files in sync folder
      const serverFiles = this.getServerFiles(client.user_id, client.sync_folder);
      
      // Compare and generate delta
      const delta = this.generateSyncDelta(
        clientId,
        items,
        currentState,
        serverFiles,
        conflictStrategy
      );

      // Update client status
      this.updateClientStatus(clientId, 'idle');
      
      LoggerService.info('sync', `Sync delta generated for ${client.device_name}`, client.user_id, {
        clientId,
        toUpload: delta.toUpload.length,
        toDownload: delta.toDownload.length,
        toDelete: delta.toDelete.length,
        conflicts: delta.conflicts.length
      });

      // Broadcast sync status
      realtimeService.broadcastToUser(client.user_id, 'SYNC_DELTA_READY', {
        clientId,
        deviceName: client.device_name,
        delta: {
          uploadCount: delta.toUpload.length,
          downloadCount: delta.toDownload.length,
          deleteCount: delta.toDelete.length,
          conflictCount: delta.conflicts.length
        }
      });

      return delta;
    } catch (error) {
      this.updateClientStatus(clientId, 'error');
      LoggerService.error('sync', 'Failed to process sync scan', undefined, {
        error: (error as Error).message,
        clientId
      });
      throw error;
    }
  }

  /**
   * Generate sync delta by comparing client and server state
   */
  private generateSyncDelta(
    clientId: string,
    clientItems: SyncItem[],
    currentState: Map<string, SyncState>,
    serverFiles: Map<string, any>,
    conflictStrategy: string
  ): SyncDelta {
    const delta: SyncDelta = {
      toUpload: [],
      toDownload: [],
      toDelete: [],
      conflicts: []
    };

    // Create maps for efficient lookup
    const clientItemsMap = new Map(clientItems.map(item => [item.path, item]));
    const serverFilesMap = new Map(Array.from(serverFiles.entries()));

    // Process client items
    for (const [path, clientItem] of clientItemsMap) {
      const syncState = currentState.get(path);
      const serverFile = serverFilesMap.get(path);

      if (!serverFile) {
        // File exists on client but not on server
        if (!syncState) {
          // New file on client
          delta.toUpload.push({ path, reason: 'new' });
        } else {
          // File was deleted on server
          delta.toDelete.push({ path, reason: 'deleted_on_server' });
        }
      } else {
        // File exists on both client and server
        const serverHash = this.calculateFileHash(serverFile.storage_path);
        
        if (clientItem.hash === serverHash) {
          // Files are identical, check if sync state needs update
          if (!syncState || syncState.local_hash !== clientItem.hash) {
            this.updateSyncState(clientId, serverFile.id, path, clientItem.hash, clientItem.mtime);
          }
        } else {
          // Files differ, determine action
          if (!syncState) {
            // No previous sync state, treat as conflict
            if (this.shouldResolveConflict(clientItem, serverFile, conflictStrategy)) {
              const resolution = this.resolveConflict(clientItem, serverFile, conflictStrategy);
              if (resolution.strategy === 'keep_client') {
                delta.toUpload.push({ path, reason: 'conflict_client_newer' });
              } else if (resolution.strategy === 'keep_server') {
                delta.toDownload.push({ path, fileId: serverFile.id, reason: 'conflict_server_newer' });
              } else {
                delta.conflicts.push({
                  path,
                  clientHash: clientItem.hash,
                  serverHash,
                  clientMtime: clientItem.mtime,
                  serverMtime: serverFile.updated_at
                });
              }
            }
          } else {
            // Has sync state, check what changed
            if (syncState.local_hash === clientItem.hash) {
              // Client unchanged, server changed
              delta.toDownload.push({ path, fileId: serverFile.id, reason: 'modified' });
            } else if (syncState.local_hash === serverHash) {
              // Server unchanged, client changed
              delta.toUpload.push({ path, reason: 'modified' });
            } else {
              // Both changed since last sync - conflict
              delta.conflicts.push({
                path,
                clientHash: clientItem.hash,
                serverHash,
                clientMtime: clientItem.mtime,
                serverMtime: serverFile.updated_at
              });
            }
          }
        }
      }
    }

    // Process server files not on client
    for (const [path, serverFile] of serverFilesMap) {
      if (!clientItemsMap.has(path)) {
        const syncState = currentState.get(path);
        
        if (!syncState) {
          // New file on server
          delta.toDownload.push({ path, fileId: serverFile.id, reason: 'new' });
        } else {
          // File was deleted on client
          delta.toDelete.push({ path, reason: 'deleted_on_client' });
        }
      }
    }

    return delta;
  }

  /**
   * Resolve conflict based on strategy
   */
  private resolveConflict(
    clientItem: SyncItem,
    serverFile: any,
    strategy: string
  ): ConflictResolution {
    switch (strategy) {
      case 'newer_wins':
        return {
          strategy: clientItem.mtime > serverFile.updated_at ? 'keep_client' : 'keep_server'
        };
      
      case 'larger_wins':
        return {
          strategy: clientItem.size > serverFile.size ? 'keep_client' : 'keep_server'
        };
      
      case 'keep_both':
        return {
          strategy: 'keep_both',
          clientPath: this.generateConflictPath(clientItem.path, 'client'),
          serverPath: this.generateConflictPath(clientItem.path, 'server')
        };
      
      default:
        return { strategy: 'ask_user' };
    }
  }

  /**
   * Generate conflict file path
   */
  private generateConflictPath(originalPath: string, source: 'client' | 'server'): string {
    const ext = originalPath.split('.').pop();
    const nameWithoutExt = originalPath.replace(`.${ext}`, '');
    const timestamp = new Date().toISOString().split('T')[0];
    
    return `${nameWithoutExt} (${source} conflict ${timestamp}).${ext}`;
  }

  /**
   * Complete sync operation and update state
   */
  public async completeSyncOperation(
    clientId: string,
    operations: Array<{
      type: 'upload' | 'download' | 'delete';
      path: string;
      fileId?: string;
      hash?: string;
      mtime?: number;
      success: boolean;
      error?: string;
    }>
  ): Promise<void> {
    try {
      const client = this.getClient(clientId);
      if (!client) {
        throw new Error('Sync client not found');
      }

      this.updateClientStatus(clientId, 'syncing');

      let successCount = 0;
      let errorCount = 0;

      for (const op of operations) {
        if (op.success) {
          successCount++;
          
          // Update sync state for successful operations
          if (op.type === 'upload' || op.type === 'download') {
            if (op.fileId && op.hash && op.mtime) {
              this.updateSyncState(clientId, op.fileId, op.path, op.hash, op.mtime);
            }
          } else if (op.type === 'delete') {
            this.removeSyncState(clientId, op.path);
          }
        } else {
          errorCount++;
          LoggerService.error('sync', `Sync operation failed: ${op.type} ${op.path}`, client.user_id, {
            clientId,
            error: op.error
          });
        }
      }

      // Update client status
      this.updateClientStatus(clientId, errorCount > 0 ? 'error' : 'idle');
      this.updateClientLastSeen(clientId);

      LoggerService.info('sync', `Sync completed for ${client.device_name}`, client.user_id, {
        clientId,
        totalOperations: operations.length,
        successCount,
        errorCount
      });

      // Broadcast sync completion
      realtimeService.broadcastToUser(client.user_id, 'SYNC_COMPLETED', {
        clientId,
        deviceName: client.device_name,
        successCount,
        errorCount,
        timestamp: Date.now()
      });

    } catch (error) {
      this.updateClientStatus(clientId, 'error');
      LoggerService.error('sync', 'Failed to complete sync operation', undefined, {
        error: (error as Error).message,
        clientId
      });
      throw error;
    }
  }

  /**
   * Get sync client by ID
   */
  public getClient(clientId: string): SyncClient | null {
    try {
      const stmt = db.prepare('SELECT * FROM sync_clients WHERE id = ?');
      return stmt.get(clientId) as SyncClient || null;
    } catch (error) {
      LoggerService.error('sync', 'Failed to get sync client', undefined, {
        error: (error as Error).message,
        clientId
      });
      return null;
    }
  }

  /**
   * Get all sync clients for a user
   */
  public getUserClients(userId: string): SyncClient[] {
    try {
      const stmt = db.prepare('SELECT * FROM sync_clients WHERE user_id = ? ORDER BY last_seen DESC');
      return stmt.all(userId) as SyncClient[];
    } catch (error) {
      LoggerService.error('sync', 'Failed to get user sync clients', userId, {
        error: (error as Error).message
      });
      return [];
    }
  }

  /**
   * Update client status
   */
  private updateClientStatus(clientId: string, status: string): void {
    try {
      const stmt = db.prepare(`
        UPDATE sync_clients 
        SET status = ?, updated_at = ? 
        WHERE id = ?
      `);
      stmt.run(status, Date.now(), clientId);
      
      this.activeSyncs.set(clientId, { status, progress: 0 });
    } catch (error) {
      LoggerService.error('sync', 'Failed to update client status', undefined, {
        error: (error as Error).message,
        clientId,
        status
      });
    }
  }

  /**
   * Update client last seen timestamp
   */
  private updateClientLastSeen(clientId: string): void {
    try {
      const stmt = db.prepare('UPDATE sync_clients SET last_seen = ? WHERE id = ?');
      stmt.run(Date.now(), clientId);
    } catch (error) {
      LoggerService.error('sync', 'Failed to update client last seen', undefined, {
        error: (error as Error).message,
        clientId
      });
    }
  }

  /**
   * Get current sync state for client
   */
  private getCurrentSyncState(clientId: string): Map<string, SyncState> {
    try {
      const stmt = db.prepare('SELECT * FROM sync_state WHERE client_id = ?');
      const results = stmt.all(clientId) as SyncState[];
      
      return new Map(results.map(state => [state.local_path, state]));
    } catch (error) {
      LoggerService.error('sync', 'Failed to get sync state', undefined, {
        error: (error as Error).message,
        clientId
      });
      return new Map();
    }
  }

  /**
   * Get server files in sync folder
   */
  private getServerFiles(userId: string, syncFolder: string): Map<string, any> {
    try {
      const stmt = db.prepare(`
        SELECT * FROM files 
        WHERE owner_id = ? AND path LIKE ? AND is_deleted = 0
        ORDER BY path
      `);
      
      const folderPattern = syncFolder.endsWith('/') ? `${syncFolder}%` : `${syncFolder}/%`;
      const results = stmt.all(userId, folderPattern);
      
      return new Map(results.map((file: any) => {
        const relativePath = relative(syncFolder, file.path);
        return [relativePath, file];
      }));
    } catch (error) {
      LoggerService.error('sync', 'Failed to get server files', userId, {
        error: (error as Error).message,
        syncFolder
      });
      return new Map();
    }
  }

  /**
   * Update sync state for a file
   */
  private updateSyncState(
    clientId: string,
    fileId: string,
    localPath: string,
    hash: string,
    mtime: number
  ): void {
    try {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO sync_state 
        (client_id, file_id, local_path, local_hash, local_mtime, synced_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(clientId, fileId, localPath, hash, mtime, Date.now());
    } catch (error) {
      LoggerService.error('sync', 'Failed to update sync state', undefined, {
        error: (error as Error).message,
        clientId,
        fileId,
        localPath
      });
    }
  }

  /**
   * Remove sync state for a file
   */
  private removeSyncState(clientId: string, localPath: string): void {
    try {
      const stmt = db.prepare('DELETE FROM sync_state WHERE client_id = ? AND local_path = ?');
      stmt.run(clientId, localPath);
    } catch (error) {
      LoggerService.error('sync', 'Failed to remove sync state', undefined, {
        error: (error as Error).message,
        clientId,
        localPath
      });
    }
  }

  /**
   * Calculate file hash
   */
  private calculateFileHash(filePath: string): string {
    try {
      if (!existsSync(filePath)) {
        return '';
      }
      
      const fileBuffer = readFileSync(filePath);
      return createHash('sha256').update(fileBuffer).digest('hex');
    } catch (error) {
      LoggerService.error('sync', 'Failed to calculate file hash', undefined, {
        error: (error as Error).message,
        filePath
      });
      return '';
    }
  }

  /**
   * Check if conflict should be resolved automatically
   */
  private shouldResolveConflict(
    clientItem: SyncItem,
    serverFile: any,
    strategy: string
  ): boolean {
    return strategy !== 'ask_user';
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Unregister sync client
   */
  public async unregisterClient(clientId: string): Promise<void> {
    try {
      const client = this.getClient(clientId);
      if (!client) {
        throw new Error('Sync client not found');
      }

      // Remove sync state
      db.prepare('DELETE FROM sync_state WHERE client_id = ?').run(clientId);
      
      // Remove conflicts
      db.prepare('DELETE FROM sync_conflicts WHERE client_id = ?').run(clientId);
      
      // Remove client
      db.prepare('DELETE FROM sync_clients WHERE id = ?').run(clientId);
      
      // Remove from active syncs
      this.activeSyncs.delete(clientId);

      LoggerService.info('sync', `Sync client unregistered: ${client.device_name}`, client.user_id, {
        clientId
      });

      // Broadcast to user's devices
      realtimeService.broadcastToUser(client.user_id, 'SYNC_CLIENT_UNREGISTERED', {
        clientId,
        deviceName: client.device_name
      });

    } catch (error) {
      LoggerService.error('sync', 'Failed to unregister sync client', undefined, {
        error: (error as Error).message,
        clientId
      });
      throw error;
    }
  }

  /**
   * Get sync status for client
   */
  public getSyncStatus(clientId: string): any {
    const client = this.getClient(clientId);
    if (!client) {
      return null;
    }

    const activeSync = this.activeSyncs.get(clientId);
    
    return {
      clientId,
      deviceName: client.device_name,
      deviceOs: client.device_os,
      status: client.status,
      lastSeen: client.last_seen,
      syncFolder: client.sync_folder,
      localPath: client.local_path,
      activeSync: activeSync || null
    };
  }

  /**
   * Get sync statistics
   */
  public getSyncStats(userId: string): any {
    try {
      const clients = this.getUserClients(userId);
      const totalFiles = db.prepare(`
        SELECT COUNT(*) as count 
        FROM sync_state ss 
        JOIN sync_clients sc ON sc.id = ss.client_id 
        WHERE sc.user_id = ?
      `).get(userId) as { count: number };

      const recentActivity = db.prepare(`
        SELECT sc.device_name, ss.synced_at
        FROM sync_state ss
        JOIN sync_clients sc ON sc.id = ss.client_id
        WHERE sc.user_id = ?
        ORDER BY ss.synced_at DESC
        LIMIT 10
      `).all(userId);

      return {
        clientCount: clients.length,
        activeClients: clients.filter(c => c.status !== 'idle').length,
        totalSyncedFiles: totalFiles.count,
        recentActivity
      };
    } catch (error) {
      LoggerService.error('sync', 'Failed to get sync stats', userId, {
        error: (error as Error).message
      });
      return {
        clientCount: 0,
        activeClients: 0,
        totalSyncedFiles: 0,
        recentActivity: []
      };
    }
  }
}

export const syncService = SyncService.getInstance();