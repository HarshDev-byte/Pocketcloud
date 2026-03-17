import { db } from '../db/client';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { NotFoundError, ForbiddenError, ConflictError } from '../utils/errors';
import { FileService } from './file.service';

interface SyncClient {
  id: string;
  user_id: string;
  device_name: string;
  device_os: string;
  remote_folder_id: string | null;
  last_sync: number | null;
  sync_token: string;
  created_at: number;
}

interface SyncState {
  client_id: string;
  file_id: string;
  local_path: string;
  local_hash: string;
  synced_at: number;
}

interface SyncEvent {
  id: string;
  folder_id: string;
  event_type: 'created' | 'modified' | 'deleted' | 'moved';
  file_id: string | null;
  old_path: string | null;
  new_path: string | null;
  created_at: number;
}

interface SyncEntry {
  type: 'file' | 'folder';
  id: string;
  path: string;
  name: string;
  size: number;
  checksum: string | null;
  modifiedAt: number;
  downloadUrl: string;
  isDeleted: boolean;
}

interface LocalChange {
  localPath: string;
  checksum: string;
  modifiedAt: number;
  type: 'add' | 'modify' | 'delete';
}

interface ConflictItem {
  path: string;
  serverVersion: any;
  clientChecksum: string;
  strategy: 'keep_both';
}

interface UploadRef {
  path: string;
  uploadId: string;
}

export class SyncService {

  // Register a new sync client
  static async registerClient(
    userId: string,
    deviceName: string,
    deviceOs: string,
    remoteFolderId?: string
  ): Promise<{ clientId: string; syncToken: string; remoteFolderId: string | null }> {
    // Validate device OS
    const validOs = ['macos', 'windows', 'linux'];
    if (!validOs.includes(deviceOs)) {
      throw new Error('INVALID_DEVICE_OS');
    }

    // Validate remote folder if provided
    if (remoteFolderId) {
      const folder = db.prepare('SELECT id FROM folders WHERE id = ? AND owner_id = ? AND is_deleted = 0')
        .get(remoteFolderId, userId);
      if (!folder) {
        throw new NotFoundError('Remote folder not found');
      }
    }

    const clientId = uuidv4();
    const syncToken = uuidv4();
    const now = Date.now();

    db.prepare(`
      INSERT INTO sync_clients (id, user_id, device_name, device_os, remote_folder_id, last_sync, sync_token, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(clientId, userId, deviceName, deviceOs, remoteFolderId || null, null, syncToken, now);

    logger.info('Sync client registered', { clientId, userId, deviceName, deviceOs });

    return {
      clientId,
      syncToken,
      remoteFolderId: remoteFolderId || null
    };
  }

  // Get full snapshot for initial sync
  static async getFullSnapshot(clientId: string): Promise<{
    entries: SyncEntry[];
    cursor: string;
    hasMore: boolean;
  }> {
    const client = db.prepare('SELECT * FROM sync_clients WHERE id = ?').get(clientId) as SyncClient;
    if (!client) {
      throw new NotFoundError('Sync client not found');
    }

    // Get all files and folders recursively
    const { files, folders } = await this.listFolderRecursive(client.user_id, client.remote_folder_id);

    // Convert to SyncEntry format
    const entries: SyncEntry[] = [];

    // Add folders
    for (const folder of folders) {
      entries.push({
        type: 'folder',
        id: folder.id,
        path: folder.path,
        name: folder.name,
        size: 0,
        checksum: null,
        modifiedAt: folder.updated_at,
        downloadUrl: '',
        isDeleted: false
      });
    }

    // Add files
    for (const file of files) {
      const relativePath = this.buildRelativePath(file.folder_id, folders, file.name);
      entries.push({
        type: 'file',
        id: file.id,
        path: relativePath,
        name: file.name,
        size: file.size,
        checksum: file.checksum,
        modifiedAt: file.updated_at,
        downloadUrl: `/api/files/${file.id}/download`,
        isDeleted: false
      });
    }

    // Generate new sync token representing this snapshot moment
    const newToken = uuidv4();
    const now = Date.now();
    db.prepare('UPDATE sync_clients SET sync_token = ?, last_sync = ? WHERE id = ?')
      .run(newToken, now, clientId);

    logger.info('Full snapshot generated', { clientId, entryCount: entries.length });

    return {
      entries,
      cursor: this.encodeCursor(now),
      hasMore: false
    };
  }

  // Get delta changes since cursor
  static async getDelta(clientId: string, cursor: string): Promise<{
    changes: SyncEntry[];
    cursor: string;
    hasMore: boolean;
  }> {
    const client = db.prepare('SELECT * FROM sync_clients WHERE id = ?').get(clientId) as SyncClient;
    if (!client) {
      throw new NotFoundError('Sync client not found');
    }

    const cursorTime = this.decodeCursor(cursor);

    // Get all folder IDs in sync scope (including subfolders)
    const folderIds = await this.getRecursiveFolderIds(client.user_id, client.remote_folder_id);

    // Query sync events since cursor
    const limit = 500;
    const placeholders = folderIds.map(() => '?').join(',');
    const query = folderIds.length > 0
      ? `SELECT * FROM sync_events WHERE folder_id IN (${placeholders}) AND created_at > ? ORDER BY created_at ASC LIMIT ?`
      : `SELECT * FROM sync_events WHERE created_at > ? ORDER BY created_at ASC LIMIT ?`;
    
    const params = folderIds.length > 0 ? [...folderIds, cursorTime, limit] : [cursorTime, limit];
    const events = db.prepare(query).all(...params) as SyncEvent[];

    const hasMore = events.length === limit;
    const newCursorTime = hasMore ? events[events.length - 1].created_at : Date.now();

    // Convert events to SyncEntry changes
    const changes: SyncEntry[] = [];
    const { files, folders } = await this.listFolderRecursive(client.user_id, client.remote_folder_id);

    for (const event of events) {
      if (event.event_type === 'deleted') {
        // Deleted entry
        changes.push({
          type: 'file',
          id: event.file_id!,
          path: event.old_path || '',
          name: '',
          size: 0,
          checksum: null,
          modifiedAt: event.created_at,
          downloadUrl: '',
          isDeleted: true
        });
      } else if (event.event_type === 'moved') {
        // Moved entry - show as delete + create
        changes.push({
          type: 'file',
          id: event.file_id!,
          path: event.old_path || '',
          name: '',
          size: 0,
          checksum: null,
          modifiedAt: event.created_at,
          downloadUrl: '',
          isDeleted: true
        });
        
        const file = files.find(f => f.id === event.file_id);
        if (file) {
          const relativePath = this.buildRelativePath(file.folder_id, folders, file.name);
          changes.push({
            type: 'file',
            id: file.id,
            path: relativePath,
            name: file.name,
            size: file.size,
            checksum: file.checksum,
            modifiedAt: file.updated_at,
            downloadUrl: `/api/files/${file.id}/download`,
            isDeleted: false
          });
        }
      } else {
        // Created or modified
        const file = files.find(f => f.id === event.file_id);
        if (file) {
          const relativePath = this.buildRelativePath(file.folder_id, folders, file.name);
          changes.push({
            type: 'file',
            id: file.id,
            path: relativePath,
            name: file.name,
            size: file.size,
            checksum: file.checksum,
            modifiedAt: file.updated_at,
            downloadUrl: `/api/files/${file.id}/download`,
            isDeleted: false
          });
        }
      }
    }

    // Update last sync time
    db.prepare('UPDATE sync_clients SET last_sync = ? WHERE id = ?').run(newCursorTime, clientId);

    logger.info('Delta generated', { clientId, changeCount: changes.length, hasMore });

    return {
      changes,
      cursor: this.encodeCursor(newCursorTime),
      hasMore
    };
  }

  // Report local changes from client
  static async reportLocalChanges(clientId: string, changes: LocalChange[]): Promise<{
    accepted: string[];
    conflicts: ConflictItem[];
    pendingUploads: UploadRef[];
  }> {
    const client = db.prepare('SELECT * FROM sync_clients WHERE id = ?').get(clientId) as SyncClient;
    if (!client) {
      throw new NotFoundError('Sync client not found');
    }

    const accepted: string[] = [];
    const conflicts: ConflictItem[] = [];
    const pendingUploads: UploadRef[] = [];

    for (const change of changes) {
      try {
        // Get local sync state for this path
        const localState = db.prepare(`
          SELECT * FROM sync_state WHERE client_id = ? AND local_path = ?
        `).get(clientId, change.localPath) as SyncState | undefined;

        // Find existing file by path
        const existing = await this.getFileByPath(client.user_id, client.remote_folder_id, change.localPath);

        // CONFLICT DETECTION
        if (existing && localState && existing.checksum !== localState.local_hash) {
          // Both sides changed since last sync
          conflicts.push({
            path: change.localPath,
            serverVersion: existing,
            clientChecksum: change.checksum,
            strategy: 'keep_both'
          });
          continue;
        }

        // APPLY CHANGE
        if (change.type === 'add' || change.type === 'modify') {
          // Client needs to upload the file
          const { UploadService } = require('./upload.service');
          const filename = change.localPath.split('/').pop() || 'file';
          
          // Initialize upload session
          const uploadResult = await UploadService.initUpload(client.user_id, {
            filename,
            mimeType: 'application/octet-stream', // Client will provide correct type
            size: 0, // Client will provide size
            checksum: change.checksum,
            folderId: client.remote_folder_id
          });

          pendingUploads.push({
            path: change.localPath,
            uploadId: uploadResult.uploadId
          });
        } else if (change.type === 'delete') {
          // Delete file on server
          if (existing) {
            const { TrashService } = require('./trash.service');
            await TrashService.softDeleteFile(existing.id, client.user_id);
            accepted.push(change.localPath);
          }
        }
      } catch (error: any) {
        logger.warn('Failed to process local change', { 
          clientId, 
          path: change.localPath, 
          error: error.message 
        });
      }
    }

    logger.info('Local changes processed', { 
      clientId, 
      accepted: accepted.length, 
      conflicts: conflicts.length, 
      pendingUploads: pendingUploads.length 
    });

    return { accepted, conflicts, pendingUploads };
  }

  // Record sync event
  static recordSyncEvent(
    folderId: string,
    eventType: 'created' | 'modified' | 'deleted' | 'moved',
    fileId: string,
    oldPath?: string,
    newPath?: string
  ): void {
    const eventId = uuidv4();
    const now = Date.now();

    db.prepare(`
      INSERT INTO sync_events (id, folder_id, event_type, file_id, old_path, new_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(eventId, folderId, eventType, fileId, oldPath || null, newPath || null, now);

    logger.debug('Sync event recorded', { eventId, folderId, eventType, fileId });

    // Notify sync clients via WebSocket
    setImmediate(() => {
      try {
        const { RealtimeService } = require('./realtime.service');
        
        // Get all clients syncing this folder
        const clients = db.prepare(`
          SELECT user_id, id FROM sync_clients WHERE remote_folder_id = ?
        `).all(folderId) as { user_id: string; id: string }[];

        for (const client of clients) {
          RealtimeService.sendToUser(client.user_id, 'sync:delta_ready', {
            clientId: client.id,
            eventCount: 1
          });
        }
      } catch (error: any) {
        logger.warn('Failed to emit sync delta ready event', { error: error.message });
      }
    });
  }

  // Resolve conflict
  static async resolveConflict(
    clientId: string,
    path: string,
    resolution: 'keep_server' | 'keep_client' | 'keep_both'
  ): Promise<{ action: string; newPath?: string }> {
    const client = db.prepare('SELECT * FROM sync_clients WHERE id = ?').get(clientId) as SyncClient;
    if (!client) {
      throw new NotFoundError('Sync client not found');
    }

    const existing = await this.getFileByPath(client.user_id, client.remote_folder_id, path);
    if (!existing) {
      throw new NotFoundError('File not found');
    }

    if (resolution === 'keep_server') {
      // Client downloads server version
      return { action: 'download_server_version' };
    } else if (resolution === 'keep_client') {
      // Client uploads, overwrites server (create version first)
      const { VersioningService } = require('./versioning.service');
      await VersioningService.createVersion(
        existing.id,
        existing.storage_path,
        existing.size,
        existing.checksum,
        client.user_id,
        'Pre-conflict backup'
      );
      return { action: 'upload_client_version' };
    } else {
      // keep_both: rename client version
      const ext = path.substring(path.lastIndexOf('.'));
      const baseName = path.substring(0, path.lastIndexOf('.'));
      const date = new Date().toISOString().split('T')[0];
      const newPath = `${baseName} (conflict ${date})${ext}`;
      
      return { action: 'upload_as_new_file', newPath: newPath };
    }
  }

  // List registered clients for user
  static listClients(userId: string): SyncClient[] {
    return db.prepare('SELECT * FROM sync_clients WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as SyncClient[];
  }

  // Unregister client
  static async unregisterClient(clientId: string, userId: string): Promise<void> {
    const client = db.prepare('SELECT * FROM sync_clients WHERE id = ? AND user_id = ?')
      .get(clientId, userId) as SyncClient;
    
    if (!client) {
      throw new NotFoundError('Sync client not found');
    }

    db.transaction(() => {
      db.prepare('DELETE FROM sync_state WHERE client_id = ?').run(clientId);
      db.prepare('DELETE FROM sync_clients WHERE id = ?').run(clientId);
    })();

    logger.info('Sync client unregistered', { clientId, userId });
  }

  // Clean old sync events (called by cleanup job)
  static cleanOldEvents(): { deleted: number } {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const result = db.prepare('DELETE FROM sync_events WHERE created_at < ?').run(sevenDaysAgo);
    
    logger.info('Old sync events cleaned', { deleted: result.changes });
    
    return { deleted: result.changes };
  }

  // Helper: List folder recursively
  private static async listFolderRecursive(userId: string, folderId: string | null): Promise<{
    files: any[];
    folders: any[];
  }> {
    // Get all descendant folders using recursive CTE
    const folders = db.prepare(`
      WITH RECURSIVE subtree(id, parent_id, name, path, created_at, updated_at) AS (
        SELECT id, parent_id, name, path, created_at, updated_at 
        FROM folders 
        WHERE ${folderId ? 'id = ?' : 'parent_id IS NULL'} AND owner_id = ? AND is_deleted = 0
        UNION ALL
        SELECT f.id, f.parent_id, f.name, f.path, f.created_at, f.updated_at
        FROM folders f
        INNER JOIN subtree s ON f.parent_id = s.id
        WHERE f.owner_id = ? AND f.is_deleted = 0
      )
      SELECT * FROM subtree
    `).all(...(folderId ? [folderId, userId, userId] : [userId, userId])) as any[];

    // Get all files in these folders
    const folderIds = folders.map(f => f.id);
    const files = folderIds.length > 0
      ? db.prepare(`
          SELECT * FROM files 
          WHERE folder_id IN (${folderIds.map(() => '?').join(',')}) 
          AND owner_id = ? AND is_deleted = 0
        `).all(...folderIds, userId) as any[]
      : [];

    // Also get files in root if no folderId specified
    if (!folderId) {
      const rootFiles = db.prepare(`
        SELECT * FROM files WHERE folder_id IS NULL AND owner_id = ? AND is_deleted = 0
      `).all(userId) as any[];
      files.push(...rootFiles);
    }

    return { files, folders };
  }

  // Helper: Get recursive folder IDs
  private static async getRecursiveFolderIds(userId: string, folderId: string | null): Promise<string[]> {
    const { folders } = await this.listFolderRecursive(userId, folderId);
    return folders.map(f => f.id);
  }

  // Helper: Build relative path for file
  private static buildRelativePath(folderId: string | null, folders: any[], filename: string): string {
    if (!folderId) {
      return filename;
    }

    const folder = folders.find(f => f.id === folderId);
    if (!folder) {
      return filename;
    }

    // Remove leading slash from folder path
    const folderPath = folder.path.startsWith('/') ? folder.path.substring(1) : folder.path;
    return `${folderPath}/${filename}`;
  }

  // Helper: Get file by relative path
  private static async getFileByPath(userId: string, rootFolderId: string | null, relativePath: string): Promise<any | null> {
    const parts = relativePath.split('/');
    const filename = parts.pop();
    const folderPath = parts.length > 0 ? '/' + parts.join('/') : null;

    if (!folderPath) {
      // File in root
      return db.prepare(`
        SELECT * FROM files WHERE owner_id = ? AND folder_id IS NULL AND name = ? AND is_deleted = 0
      `).get(userId, filename) as any;
    }

    // Find folder by path
    const folder = db.prepare(`
      SELECT id FROM folders WHERE owner_id = ? AND path = ? AND is_deleted = 0
    `).get(userId, folderPath) as { id: string } | undefined;

    if (!folder) {
      return null;
    }

    return db.prepare(`
      SELECT * FROM files WHERE owner_id = ? AND folder_id = ? AND name = ? AND is_deleted = 0
    `).get(userId, folder.id, filename) as any;
  }

  // Helper: Encode cursor
  private static encodeCursor(timestamp: number): string {
    return Buffer.from(String(timestamp)).toString('base64');
  }

  // Helper: Decode cursor
  private static decodeCursor(cursor: string): number {
    return parseInt(Buffer.from(cursor, 'base64').toString('utf8'), 10);
  }
}
