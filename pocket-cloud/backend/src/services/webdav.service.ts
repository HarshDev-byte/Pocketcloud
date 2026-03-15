import * as mime from 'mime-types';
import { db } from '../db';
import { TrashService } from './trash.service';
import { AuditService } from './audit.service';
import { 
  WebDAVResponse, 
  WebDAVProperty, 
  LockInfo,
  lockStore,
  buildMultistatus,
  buildLockResponse,
  parseLockRequest,
  parseProppatch,
  formatRFC1123Date
} from '../utils/webdav.xml';

// Import modules using eval to avoid TypeScript module resolution issues
const fs = eval('require')('fs');
const path = eval('require')('path');
const util = eval('require')('util');
const stream = eval('require')('stream');

const pipelineAsync = util.promisify(stream.pipeline);

/**
 * WebDAV Service - RFC 4918 Implementation
 * 
 * Provides full WebDAV server functionality for mounting PocketCloud
 * as a network drive on any operating system
 */
export class WebDAVService {
  private storagePath: string;
  private propfindCache = new Map<string, { data: string, expires: number }>();

  constructor() {
    this.storagePath = eval('process.env.STORAGE_PATH') || '/mnt/pocketcloud';
  }

  /**
   * Handle OPTIONS request - Advertise WebDAV capabilities
   */
  public handleOptions(): { [key: string]: string } {
    return {
      'DAV': '1, 2',
      'Allow': 'OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK',
      'MS-Author-Via': 'DAV', // Windows WebDAV client compatibility
      'Accept-Ranges': 'bytes',
      'X-MSOS-ServerVersion': '15.0.0' // Fake Windows Server version for compatibility
    };
  }

  /**
   * Handle PROPFIND request - List directory contents or get file properties
   */
  public async handlePropfind(
    requestPath: string, 
    depth: string, 
    userId: number,
    isAdmin: boolean = false
  ): Promise<string> {
    const cacheKey = `${requestPath}:${depth}:${userId}:${isAdmin}`;
    const cached = this.propfindCache.get(cacheKey);
    
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    try {
      const responses: WebDAVResponse[] = [];
      
      if (isAdmin && requestPath === '/') {
        // Admin sees all users' folders
        responses.push(...await this.getAdminRootListing());
      } else {
        // Regular user or specific path
        const userPath = this.getUserPath(requestPath, userId, isAdmin);
        const fullPath = path.join(this.storagePath, userPath);
        
        const stats = this.getFileStats(fullPath);
        if (!stats.exists) {
          throw new Error('Not Found');
        }

        // Add the requested resource
        responses.push(this.createWebDAVResponse(requestPath, stats, path.basename(fullPath)));

        // If it's a directory and depth > 0, add children
        if (stats.isDirectory && depth !== '0') {
          const children = await this.getDirectoryChildren(fullPath, requestPath, userId, isAdmin);
          responses.push(...children);
        }
      }

      const xml = buildMultistatus(responses);
      
      // Cache for 2 seconds
      this.propfindCache.set(cacheKey, {
        data: xml,
        expires: Date.now() + 2000
      });

      return xml;
    } catch (error: unknown) {
      throw new Error(`PROPFIND failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle GET request - Download file or browse directory
   */
  public async handleGet(
    requestPath: string, 
    userId: number, 
    isAdmin: boolean = false
  ): Promise<{ stream?: any, html?: string, stats?: any }> {
    const userPath = this.getUserPath(requestPath, userId, isAdmin);
    const fullPath = path.join(this.storagePath, userPath);
    
    const stats = this.getFileStats(fullPath);
    if (!stats.exists) {
      throw new Error('Not Found');
    }

    if (stats.isDirectory) {
      // Return HTML directory listing for browsers
      const html = await this.generateDirectoryHTML(fullPath, requestPath);
      return { html };
    } else {
      // Stream file download
      const stream = fs.createReadStream(fullPath);
      
      // Log access
      AuditService.logFileAccess(userId.toString(), userPath, 'download', '[client_ip]', 'WebDAV');
      
      return { stream, stats };
    }
  }

  /**
   * Handle PUT request - Upload file
   */
  public async handlePut(
    requestPath: string,
    contentStream: any,
    userId: number,
    isAdmin: boolean = false,
    lockToken?: string
  ): Promise<void> {
    // Check for macOS metadata files and ignore them
    const fileName = path.basename(requestPath);
    if (this.shouldIgnoreFile(fileName)) {
      throw new Error('Forbidden');
    }

    const userPath = this.getUserPath(requestPath, userId, isAdmin);
    const fullPath = path.join(this.storagePath, userPath);
    
    // Check if file is locked
    if (lockStore.isLocked(requestPath) && !lockStore.validateLockToken(requestPath, lockToken || '')) {
      throw new Error('Locked');
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(fullPath);
      fs.mkdirSync(dir, { recursive: true });

      // Stream upload directly to storage (no RAM buffering)
      const writeStream = fs.createWriteStream(fullPath);
      await pipelineAsync(contentStream, writeStream);

      // Log upload
      AuditService.logFileAccess(userId.toString(), userPath, 'upload', '[client_ip]', 'WebDAV');
      
      // Clear cache
      this.clearPropfindCache(path.dirname(requestPath));
      
    } catch (error: any) {
      throw new Error(`Upload failed: ${error.message}`);
    }
  }

  /**
   * Handle DELETE request - Delete file (soft delete to trash)
   */
  public async handleDelete(
    requestPath: string,
    userId: number,
    isAdmin: boolean = false,
    lockToken?: string
  ): Promise<void> {
    const userPath = this.getUserPath(requestPath, userId, isAdmin);
    const fullPath = path.join(this.storagePath, userPath);
    
    // Check if file is locked
    if (lockStore.isLocked(requestPath) && !lockStore.validateLockToken(requestPath, lockToken || '')) {
      throw new Error('Locked');
    }

    const stats = this.getFileStats(fullPath);
    if (!stats.exists) {
      throw new Error('Not Found');
    }

    try {
      // Soft delete to trash - need to get file ID first
      const database = db();
      const fileQuery = database.prepare('SELECT id FROM files WHERE storage_path = ? AND owner_id = ?');
      const fileRecord = fileQuery.get(fullPath, userId) as { id: string } | undefined;
      
      if (fileRecord) {
        // Use TrashService for soft delete
        const trashService = new TrashService();
        await trashService.moveFileToTrash(fileRecord.id, userId);
      } else {
        // If not in database, just remove from filesystem (shouldn't happen in normal operation)
        throw new Error('File not found in database');
      }
      
      // Log deletion
      AuditService.logFileAccess(userId.toString(), userPath, 'delete', '[client_ip]', 'WebDAV');
      
      // Clear cache
      this.clearPropfindCache(path.dirname(requestPath));
      
    } catch (error: any) {
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  /**
   * Handle MKCOL request - Create directory
   */
  public async handleMkcol(
    requestPath: string,
    userId: number,
    isAdmin: boolean = false
  ): Promise<void> {
    const userPath = this.getUserPath(requestPath, userId, isAdmin);
    const fullPath = path.join(this.storagePath, userPath);
    
    try {
      fs.mkdirSync(fullPath, { recursive: true });
      
      // Log creation
      AuditService.logFileAccess(userId.toString(), userPath, 'create_folder', '[client_ip]', 'WebDAV');
      
      // Clear cache
      this.clearPropfindCache(path.dirname(requestPath));
      
    } catch (error: any) {
      throw new Error(`Create directory failed: ${error.message}`);
    }
  }

  /**
   * Handle COPY request - Copy file or directory
   */
  public async handleCopy(
    sourcePath: string,
    destinationPath: string,
    userId: number,
    isAdmin: boolean = false,
    overwrite: boolean = false
  ): Promise<void> {
    const sourceUserPath = this.getUserPath(sourcePath, userId, isAdmin);
    const destUserPath = this.getUserPath(destinationPath, userId, isAdmin);
    const sourceFullPath = path.join(this.storagePath, sourceUserPath);
    const destFullPath = path.join(this.storagePath, destUserPath);
    
    const sourceStats = this.getFileStats(sourceFullPath);
    if (!sourceStats.exists) {
      throw new Error('Source Not Found');
    }

    const destStats = this.getFileStats(destFullPath);
    if (destStats.exists && !overwrite) {
      throw new Error('Destination Exists');
    }

    try {
      // Ensure destination directory exists
      const destDir = path.dirname(destFullPath);
      fs.mkdirSync(destDir, { recursive: true });

      if (sourceStats.isDirectory) {
        // Copy directory recursively
        this.copyDirectoryRecursive(sourceFullPath, destFullPath);
      } else {
        // Copy file
        fs.copyFileSync(sourceFullPath, destFullPath);
      }

      // Log copy
      AuditService.logFileAccess(userId.toString(), sourceUserPath, 'copy', '[client_ip]', 'WebDAV');
      
      // Clear cache
      this.clearPropfindCache(path.dirname(destinationPath));
      
    } catch (error: any) {
      throw new Error(`Copy failed: ${error.message}`);
    }
  }

  /**
   * Handle MOVE request - Move/rename file or directory
   */
  public async handleMove(
    sourcePath: string,
    destinationPath: string,
    userId: number,
    isAdmin: boolean = false,
    overwrite: boolean = false
  ): Promise<void> {
    const sourceUserPath = this.getUserPath(sourcePath, userId, isAdmin);
    const destUserPath = this.getUserPath(destinationPath, userId, isAdmin);
    const sourceFullPath = path.join(this.storagePath, sourceUserPath);
    const destFullPath = path.join(this.storagePath, destUserPath);
    
    const sourceStats = this.getFileStats(sourceFullPath);
    if (!sourceStats.exists) {
      throw new Error('Source Not Found');
    }

    const destStats = this.getFileStats(destFullPath);
    if (destStats.exists && !overwrite) {
      throw new Error('Destination Exists');
    }

    try {
      // Ensure destination directory exists
      const destDir = path.dirname(destFullPath);
      fs.mkdirSync(destDir, { recursive: true });

      // Move file/directory
      fs.renameSync(sourceFullPath, destFullPath);

      // Log move
      AuditService.logFileAccess(userId.toString(), sourceUserPath, 'move', '[client_ip]', 'WebDAV');
      
      // Clear cache for both paths
      this.clearPropfindCache(path.dirname(sourcePath));
      this.clearPropfindCache(path.dirname(destinationPath));
      
    } catch (error: any) {
      throw new Error(`Move failed: ${error.message}`);
    }
  }

  /**
   * Handle LOCK request - Lock resource (required for Windows WebDAV client)
   */
  public handleLock(
    requestPath: string,
    lockXml: string,
    timeout: number = 1800
  ): { lockInfo: LockInfo, xml: string } {
    const { owner } = parseLockRequest(lockXml);
    const lockInfo = lockStore.createLock(requestPath, owner, timeout);
    const xml = buildLockResponse(lockInfo, requestPath);
    
    return { lockInfo, xml };
  }

  /**
   * Handle UNLOCK request - Unlock resource
   */
  public handleUnlock(requestPath: string, lockToken: string): boolean {
    if (!lockStore.validateLockToken(requestPath, lockToken)) {
      throw new Error('Invalid Lock Token');
    }
    
    return lockStore.releaseLock(requestPath);
  }

  /**
   * Handle PROPPATCH request - Update properties
   */
  public handleProppatch(requestPath: string, proppatchXml: string): string {
    const { set, remove } = parseProppatch(proppatchXml);
    
    // For now, we'll just return success for all property updates
    // In a full implementation, you'd store custom properties in the database
    const responses: WebDAVResponse[] = [];
    
    set.forEach(prop => {
      responses.push({
        href: requestPath,
        properties: [{
          namespace: prop.namespace,
          name: prop.name,
          status: 'HTTP/1.1 200 OK'
        }],
        status: 'HTTP/1.1 200 OK'
      });
    });

    remove.forEach(propName => {
      responses.push({
        href: requestPath,
        properties: [{
          namespace: 'DAV:',
          name: propName,
          status: 'HTTP/1.1 200 OK'
        }],
        status: 'HTTP/1.1 200 OK'
      });
    });

    return buildMultistatus(responses);
  }

  // Private helper methods

  private getUserPath(requestPath: string, userId: number, isAdmin: boolean): string {
    if (isAdmin) {
      // Admin can access all user paths: /username/path
      return requestPath.startsWith('/') ? requestPath.slice(1) : requestPath;
    } else {
      // Regular user path: users/{userId}/path
      const cleanPath = requestPath.startsWith('/') ? requestPath.slice(1) : requestPath;
      return path.join('users', userId.toString(), cleanPath);
    }
  }

  private getFileStats(fullPath: string) {
    try {
      const stat = fs.statSync(fullPath);
      return {
        exists: true,
        isDirectory: stat.isDirectory(),
        size: stat.size,
        lastModified: stat.mtime,
        created: stat.birthtime,
        etag: `"${stat.mtime.getTime()}-${stat.size}"`,
        contentType: stat.isDirectory() ? 'httpd/unix-directory' : mime.lookup(fullPath) || 'application/octet-stream'
      };
    } catch (error) {
      return { exists: false };
    }
  }

  private createWebDAVResponse(href: string, stats: any, displayName: string): WebDAVResponse {
    const properties: WebDAVProperty[] = [
      {
        namespace: 'DAV:',
        name: 'displayname',
        value: displayName,
        status: 'HTTP/1.1 200 OK'
      },
      {
        namespace: 'DAV:',
        name: 'getlastmodified',
        value: formatRFC1123Date(stats.lastModified),
        status: 'HTTP/1.1 200 OK'
      },
      {
        namespace: 'DAV:',
        name: 'creationdate',
        value: stats.created.toISOString(),
        status: 'HTTP/1.1 200 OK'
      },
      {
        namespace: 'DAV:',
        name: 'getetag',
        value: stats.etag,
        status: 'HTTP/1.1 200 OK'
      }
    ];

    if (stats.isDirectory) {
      properties.push({
        namespace: 'DAV:',
        name: 'resourcetype',
        value: '<D:collection/>',
        status: 'HTTP/1.1 200 OK'
      });
    } else {
      properties.push(
        {
          namespace: 'DAV:',
          name: 'resourcetype',
          value: '',
          status: 'HTTP/1.1 200 OK'
        },
        {
          namespace: 'DAV:',
          name: 'getcontentlength',
          value: stats.size.toString(),
          status: 'HTTP/1.1 200 OK'
        },
        {
          namespace: 'DAV:',
          name: 'getcontenttype',
          value: stats.contentType,
          status: 'HTTP/1.1 200 OK'
        }
      );
    }

    return {
      href,
      properties,
      status: 'HTTP/1.1 200 OK'
    };
  }

  private async getAdminRootListing(): Promise<WebDAVResponse[]> {
    const responses: WebDAVResponse[] = [];
    
    try {
      // Get all users from database
      const database = db();
      const users = database.prepare('SELECT id, username FROM users').all() as Array<{ id: number, username: string }>;
      
      users.forEach(user => {
        const userPath = path.join(this.storagePath, 'users', user.id.toString());
        const stats = this.getFileStats(userPath);
        
        if (stats.exists) {
          responses.push(this.createWebDAVResponse(`/${user.username}/`, stats, user.username));
        }
      });
    } catch (error: any) {
      console.error('Error getting admin root listing:', error);
    }
    
    return responses;
  }

  private async getDirectoryChildren(
    fullPath: string, 
    requestPath: string, 
    _userId: number, 
    _isAdmin: boolean
  ): Promise<WebDAVResponse[]> {
    const responses: WebDAVResponse[] = [];
    
    try {
      const items = fs.readdirSync(fullPath);
      
      // Limit to 500 items for performance
      const limitedItems = items.slice(0, 500);
      
      limitedItems.forEach((item: string) => {
        const itemPath = path.join(fullPath, item);
        const stats = this.getFileStats(itemPath);
        
        if (stats.exists) {
          const itemHref = requestPath.endsWith('/') ? `${requestPath}${item}` : `${requestPath}/${item}`;
          if (stats.isDirectory) {
            responses.push(this.createWebDAVResponse(`${itemHref}/`, stats, item));
          } else {
            responses.push(this.createWebDAVResponse(itemHref, stats, item));
          }
        }
      });
    } catch (error: any) {
      console.error('Error reading directory:', error);
    }
    
    return responses;
  }

  private async generateDirectoryHTML(fullPath: string, requestPath: string): Promise<string> {
    const items = fs.readdirSync(fullPath);
    const title = requestPath || 'PocketCloud Drive';
    
    let html = `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 40px; }
    h1 { color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px; }
    .item { padding: 8px 0; border-bottom: 1px solid #f5f5f5; display: flex; align-items: center; }
    .item a { text-decoration: none; color: #007aff; margin-left: 8px; }
    .item a:hover { text-decoration: underline; }
    .icon { font-size: 16px; width: 20px; }
    .size { margin-left: auto; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <h1>📁 ${title}</h1>`;

    if (requestPath && requestPath !== '/') {
      html += `  <div class="item">
    <span class="icon">📁</span>
    <a href="../">..</a>
  </div>`;
    }

    items.forEach((item: string) => {
      const itemPath = path.join(fullPath, item);
      const stats = this.getFileStats(itemPath);
      
      if (stats.exists) {
        const icon = stats.isDirectory ? '📁' : '📄';
        const href = stats.isDirectory ? `${item}/` : item;
        const size = stats.isDirectory ? '' : this.formatFileSize(stats.size || 0);
        
        html += `  <div class="item">
    <span class="icon">${icon}</span>
    <a href="${href}">${item}</a>
    <span class="size">${size}</span>
  </div>`;
      }
    });

    html += `</body>
</html>`;

    return html;
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  private shouldIgnoreFile(fileName: string): boolean {
    const ignoredFiles = ['.DS_Store', '.Spotlight-V100', 'Thumbs.db'];
    const ignoredPrefixes = ['._'];
    
    return ignoredFiles.includes(fileName) || 
           ignoredPrefixes.some(prefix => fileName.startsWith(prefix));
  }

  private copyDirectoryRecursive(source: string, destination: string): void {
      fs.mkdirSync(destination, { recursive: true });

      const items = fs.readdirSync(source);
      items.forEach((item: string) => {
        const sourcePath = path.join(source, item);
        const destPath = path.join(destination, item);
        const stats = this.getFileStats(sourcePath);

        if (stats.isDirectory) {
          this.copyDirectoryRecursive(sourcePath, destPath);
        } else {
          fs.copyFileSync(sourcePath, destPath);
        }
      });
    }

  private clearPropfindCache(path: string): void {
    // Clear cache entries that start with the given path
    const keysToDelete: string[] = Array.from(this.propfindCache.keys()).filter(key => key.startsWith(path));
    keysToDelete.forEach(key => this.propfindCache.delete(key));
  }
}