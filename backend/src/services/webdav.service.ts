import { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { db } from '../db/client';
import { AuthService } from './auth.service';
import { FileService } from './file.service';
import { TrashService } from './trash.service';
import { QuotaService } from './quota.service';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

interface WebDAVResource {
  name: string;
  path: string;
  isCollection: boolean;
  size?: number;
  lastModified?: Date;
  created?: Date;
  mimeType?: string;
  etag?: string;
}

interface WebDAVUser {
  id: string;
  username: string;
  role: string;
}

export class WebDAVService {
  /**
   * Authenticate WebDAV request using Basic Auth
   */
  static async authenticateRequest(req: Request): Promise<WebDAVUser | null> {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return null;
    }

    try {
      const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
      const [username, password] = credentials.split(':');

      if (!username || !password) {
        return null;
      }

      // Use existing auth service
      const loginResult = await AuthService.login(username, password, {
        ip: 'webdav-client',
        userAgent: 'WebDAV'
      });
      
      return {
        id: loginResult.user.id,
        username: loginResult.user.username,
        role: loginResult.user.role
      };
    } catch (error: any) {
      logger.warn('WebDAV authentication failed', { error: error?.message || 'Unknown error' });
      return null;
    }
  }

  /**
   * Parse WebDAV path to folder structure
   */
  static parsePath(webdavPath: string): { folderPath: string[]; fileName?: string } {
    // Remove leading/trailing slashes and split
    const cleanPath = webdavPath.replace(/^\/+|\/+$/g, '');
    
    if (!cleanPath) {
      return { folderPath: [] };
    }

    const parts = cleanPath.split('/').filter(part => part.length > 0);
    
    // If last part has extension, it's likely a file
    const lastPart = parts[parts.length - 1];
    if (lastPart && lastPart.includes('.')) {
      return {
        folderPath: parts.slice(0, -1),
        fileName: lastPart
      };
    }

    return { folderPath: parts };
  }

  /**
   * Find folder by path
   */
  static async findFolderByPath(userId: string, folderPath: string[]): Promise<string | null> {
    if (folderPath.length === 0) {
      return null; // Root folder
    }

    let currentFolderId: string | null = null;
    
    for (const folderName of folderPath) {
      const folder = db.prepare(`
        SELECT id FROM folders 
        WHERE owner_id = ? AND name = ? AND folder_id ${currentFolderId ? '= ?' : 'IS NULL'} AND is_deleted = 0
      `).get(currentFolderId ? [userId, folderName, currentFolderId] : [userId, folderName]) as { id: string } | undefined;

      if (!folder) {
        return null;
      }

      currentFolderId = folder.id;
    }

    return currentFolderId;
  }

  /**
   * Create folder path if it doesn't exist
   */
  static async createFolderPath(userId: string, folderPath: string[]): Promise<string | null> {
    if (folderPath.length === 0) {
      return null; // Root folder
    }

    let currentFolderId: string | null = null;
    
    for (const folderName of folderPath) {
      // Check if folder exists
      let folder = db.prepare(`
        SELECT id FROM folders 
        WHERE owner_id = ? AND name = ? AND folder_id ${currentFolderId ? '= ?' : 'IS NULL'} AND is_deleted = 0
      `).get(currentFolderId ? [userId, folderName, currentFolderId] : [userId, folderName]) as { id: string } | undefined;

      if (!folder) {
        // Create folder
        const newFolder = await FileService.createFolder(userId, folderName, currentFolderId || undefined);
        currentFolderId = newFolder.id;
      } else {
        currentFolderId = folder.id;
      }
    }

    return currentFolderId;
  }

  /**
   * List directory contents for WebDAV PROPFIND
   */
  static async listDirectory(userId: string, webdavPath: string): Promise<WebDAVResource[]> {
    const { folderPath } = this.parsePath(webdavPath);
    const folderId = await this.findFolderByPath(userId, folderPath);

    // Get folder contents using existing service
    const contents = await FileService.listFolder(userId, folderId || undefined);
    
    const resources: WebDAVResource[] = [];

    // Add folders
    for (const folder of contents.folders) {
      resources.push({
        name: folder.name,
        path: path.posix.join(webdavPath, folder.name),
        isCollection: true,
        created: new Date(folder.created_at),
        lastModified: new Date(folder.updated_at)
      });
    }

    // Add files
    for (const file of contents.files) {
      resources.push({
        name: file.name,
        path: path.posix.join(webdavPath, file.name),
        isCollection: false,
        size: file.size,
        created: new Date(file.created_at),
        lastModified: new Date(file.updated_at),
        mimeType: file.mime_type,
        etag: `"${file.checksum}"`
      });
    }

    return resources;
  }

  /**
   * Get file resource for WebDAV
   */
  static async getFileResource(userId: string, webdavPath: string): Promise<WebDAVResource | null> {
    const { folderPath, fileName } = this.parsePath(webdavPath);
    
    if (!fileName) {
      return null;
    }

    const folderId = await this.findFolderByPath(userId, folderPath);
    
    // Find file in database
    const file = db.prepare(`
      SELECT * FROM files 
      WHERE owner_id = ? AND name = ? AND folder_id ${folderId ? '= ?' : 'IS NULL'} AND is_deleted = 0
    `).get(folderId ? [userId, fileName, folderId] : [userId, fileName]) as any;

    if (!file) {
      return null;
    }

    return {
      name: file.name,
      path: webdavPath,
      isCollection: false,
      size: file.size,
      created: new Date(file.created_at),
      lastModified: new Date(file.updated_at),
      mimeType: file.mime_type,
      etag: `"${file.checksum}"`
    };
  }

  /**
   * Generate WebDAV XML response for PROPFIND
   */
  static generatePropfindXML(resources: WebDAVResource[], baseUrl: string, depth: number = 1): string {
    const xmlHeader = '<?xml version="1.0" encoding="utf-8"?>';
    const multistatus = '<D:multistatus xmlns:D="DAV:">';
    
    let responses = '';

    for (const resource of resources) {
      const href = new URL(resource.path, baseUrl).pathname;
      const displayName = resource.name || path.basename(resource.path) || '';
      
      responses += `
        <D:response>
          <D:href>${this.escapeXml(href)}</D:href>
          <D:propstat>
            <D:prop>
              <D:displayname>${this.escapeXml(displayName)}</D:displayname>
              <D:creationdate>${resource.created?.toISOString() || new Date().toISOString()}</D:creationdate>
              <D:getlastmodified>${resource.lastModified?.toUTCString() || new Date().toUTCString()}</D:getlastmodified>
              ${resource.isCollection ? 
                '<D:resourcetype><D:collection/></D:resourcetype>' : 
                `<D:resourcetype/>
                 <D:getcontentlength>${resource.size || 0}</D:getcontentlength>
                 <D:getcontenttype>${resource.mimeType || 'application/octet-stream'}</D:getcontenttype>
                 ${resource.etag ? `<D:getetag>${resource.etag}</D:getetag>` : ''}`
              }
              <D:supportedlock>
                <D:lockentry>
                  <D:lockscope><D:exclusive/></D:lockscope>
                  <D:locktype><D:write/></D:locktype>
                </D:lockentry>
              </D:supportedlock>
            </D:prop>
            <D:status>HTTP/1.1 200 OK</D:status>
          </D:propstat>
        </D:response>`;
    }

    return `${xmlHeader}${multistatus}${responses}</D:multistatus>`;
  }

  /**
   * Handle WebDAV OPTIONS request
   */
  static handleOptions(req: Request, res: Response): void {
    res.setHeader('Allow', 'OPTIONS, GET, HEAD, POST, PUT, DELETE, TRACE, COPY, MOVE, MKCOL, PROPFIND, PROPPATCH, LOCK, UNLOCK');
    res.setHeader('DAV', '1, 2');
    res.setHeader('MS-Author-Via', 'DAV');
    res.setHeader('Accept-Ranges', 'bytes');
    res.status(200).end();
  }

  /**
   * Handle WebDAV PROPFIND request
   */
  static async handlePropfind(req: Request, res: Response, user: WebDAVUser): Promise<void> {
    try {
      const webdavPath = decodeURIComponent(req.path.replace('/webdav', '') || '/');
      const depth = parseInt(req.headers.depth as string) || 1;

      // Limit depth for performance (especially on Pi)
      if (depth > 2) {
        res.status(403).set('Content-Type', 'application/xml; charset=utf-8').send(`
          <?xml version="1.0" encoding="utf-8"?>
          <D:error xmlns:D="DAV:">
            <D:propfind-finite-depth/>
          </D:error>
        `);
        return;
      }

      const { folderPath, fileName } = this.parsePath(webdavPath);

      if (fileName) {
        // Single file request
        const resource = await this.getFileResource(user.id, webdavPath);
        if (!resource) {
          res.status(404).end();
          return;
        }

        const xml = this.generatePropfindXML([resource], `${req.protocol}://${req.get('host')}/webdav`);
        res.status(207).set('Content-Type', 'application/xml; charset=utf-8').send(xml);
      } else {
        // Directory listing
        const resources = await this.listDirectory(user.id, webdavPath);
        
        // Add current directory to response
        const currentDir: WebDAVResource = {
          name: '',
          path: webdavPath,
          isCollection: true,
          created: new Date(),
          lastModified: new Date()
        };
        
        const allResources = [currentDir, ...resources];
        const xml = this.generatePropfindXML(allResources, `${req.protocol}://${req.get('host')}/webdav`);
        res.status(207).set('Content-Type', 'application/xml; charset=utf-8').send(xml);
      }

    } catch (error: any) {
      logger.error('WebDAV PROPFIND failed', { error: error.message, path: req.path });
      res.status(500).end();
    }
  }

  /**
   * Handle WebDAV GET request (download file)
   */
  static async handleGet(req: Request, res: Response, user: WebDAVUser): Promise<void> {
    try {
      const webdavPath = decodeURIComponent(req.path.replace('/webdav', '') || '/');
      const { folderPath, fileName } = this.parsePath(webdavPath);

      if (!fileName) {
        res.status(404).end();
        return;
      }

      const folderId = await this.findFolderByPath(user.id, folderPath);
      
      // Find file
      const file = db.prepare(`
        SELECT * FROM files 
        WHERE owner_id = ? AND name = ? AND folder_id ${folderId ? '= ?' : 'IS NULL'} AND is_deleted = 0
      `).get(folderId ? [user.id, fileName, folderId] : [user.id, fileName]) as any;

      if (!file) {
        res.status(404).end();
        return;
      }

      // Stream file using existing service
      await FileService.streamFile(file.id, user.id, res, req.headers.range);

    } catch (error: any) {
      logger.error('WebDAV GET failed', { error: error.message, path: req.path });
      if (!res.headersSent) {
        res.status(500).end();
      }
    }
  }

  /**
   * Handle WebDAV PUT request (upload file)
   */
  static async handlePut(req: Request, res: Response, user: WebDAVUser): Promise<void> {
    try {
      const webdavPath = decodeURIComponent(req.path.replace('/webdav', '') || '/');
      const { folderPath, fileName } = this.parsePath(webdavPath);

      if (!fileName) {
        res.status(400).end();
        return;
      }

      // Ignore Mac metadata files
      if (fileName.startsWith('.DS_Store') || fileName.startsWith('._')) {
        res.status(403).end();
        return;
      }

      const contentLength = parseInt(req.headers['content-length'] || '0');
      
      if (contentLength === 0) {
        res.status(400).end();
        return;
      }

      // Check quota before upload
      try {
        QuotaService.checkUploadAllowed(user.id, contentLength);
      } catch (error: any) {
        if (error.code === 'QUOTA_EXCEEDED') {
          res.status(507).end(); // Insufficient Storage
          return;
        }
        throw error;
      }

      // Create folder path if needed
      const folderId = await this.createFolderPath(user.id, folderPath);

      // Create temporary file
      const tempPath = path.join(process.env.UPLOAD_TEMP_DIR!, `webdav_${Date.now()}_${Math.random().toString(36)}`);
      const writeStream = fs.createWriteStream(tempPath);

      // Calculate checksum while writing
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256');

      req.on('data', (chunk) => {
        hash.update(chunk);
        writeStream.write(chunk);
      });

      req.on('end', async () => {
        writeStream.end();
        
        try {
          const checksum = hash.digest('hex');
          const mimeType = this.getMimeType(fileName);

          // Check if file already exists (for versioning)
          const existingFile = db.prepare(`
            SELECT * FROM files 
            WHERE owner_id = ? AND name = ? AND folder_id ${folderId ? '= ?' : 'IS NULL'} AND is_deleted = 0
          `).get(folderId ? [user.id, fileName, folderId] : [user.id, fileName]) as any;

          if (existingFile) {
            // Create version using existing service
            const { VersioningService } = require('./versioning.service');
            await VersioningService.createVersion(
              existingFile.id,
              tempPath,
              contentLength,
              checksum,
              user.id,
              `WebDAV upload ${new Date().toISOString()}`
            );
          } else {
            // Create new file record
            const fileId = crypto.randomUUID();
            const now = Date.now();
            
            // Move file to final location
            const ext = path.extname(fileName);
            const date = new Date();
            const storagePath = path.join(
              process.env.STORAGE_PATH!,
              user.id,
              String(date.getFullYear()),
              String(date.getMonth() + 1).padStart(2, '0'),
              `${fileId}${ext}`
            );

            // Ensure directory exists
            fs.mkdirSync(path.dirname(storagePath), { recursive: true });
            fs.renameSync(tempPath, storagePath);

            // Insert file record
            db.prepare(`
              INSERT INTO files (
                id, owner_id, folder_id, name, original_name, mime_type,
                size, storage_path, checksum, is_deleted, deleted_at,
                created_at, updated_at, version_count, current_version
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              fileId, user.id, folderId, fileName, fileName, mimeType,
              contentLength, storagePath, checksum, 0, null,
              now, now, 1, 1
            );
          }

          // Clean up temp file if it still exists
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }

          res.status(existingFile ? 204 : 201).end();

        } catch (error: any) {
          // Clean up temp file
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
          throw error;
        }
      });

      req.on('error', (error) => {
        logger.error('WebDAV PUT stream error', { error: error.message });
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
        if (!res.headersSent) {
          res.status(500).end();
        }
      });

    } catch (error: any) {
      logger.error('WebDAV PUT failed', { error: error.message, path: req.path });
      if (!res.headersSent) {
        res.status(500).end();
      }
    }
  }

  /**
   * Handle WebDAV DELETE request
   */
  static async handleDelete(req: Request, res: Response, user: WebDAVUser): Promise<void> {
    try {
      const webdavPath = decodeURIComponent(req.path.replace('/webdav', '') || '/');
      const { folderPath, fileName } = this.parsePath(webdavPath);

      if (fileName) {
        // Delete file (soft delete to trash)
        const folderId = await this.findFolderByPath(user.id, folderPath);
        
        const file = db.prepare(`
          SELECT * FROM files 
          WHERE owner_id = ? AND name = ? AND folder_id ${folderId ? '= ?' : 'IS NULL'} AND is_deleted = 0
        `).get(folderId ? [user.id, fileName, folderId] : [user.id, fileName]) as any;

        if (!file) {
          res.status(404).end();
          return;
        }

        await TrashService.softDeleteFile(file.id, user.id);
        res.status(204).end();
      } else {
        // Delete folder
        const folderId = await this.findFolderByPath(user.id, folderPath);
        
        if (!folderId) {
          res.status(404).end();
          return;
        }

        await TrashService.softDeleteFolder(folderId, user.id);
        res.status(204).end();
      }

    } catch (error: any) {
      logger.error('WebDAV DELETE failed', { error: error.message, path: req.path });
      res.status(500).end();
    }
  }

  /**
   * Handle WebDAV MKCOL request (create directory)
   */
  static async handleMkcol(req: Request, res: Response, user: WebDAVUser): Promise<void> {
    try {
      const webdavPath = decodeURIComponent(req.path.replace('/webdav', '') || '/');
      const { folderPath } = this.parsePath(webdavPath);

      if (folderPath.length === 0) {
        res.status(405).end(); // Cannot create root
        return;
      }

      const folderName = folderPath[folderPath.length - 1];
      const parentPath = folderPath.slice(0, -1);
      const parentFolderId = await this.findFolderByPath(user.id, parentPath);

      // Check if folder already exists
      const existing = db.prepare(`
        SELECT id FROM folders 
        WHERE owner_id = ? AND name = ? AND folder_id ${parentFolderId ? '= ?' : 'IS NULL'} AND is_deleted = 0
      `).get(parentFolderId ? [user.id, folderName, parentFolderId] : [user.id, folderName]);

      if (existing) {
        res.status(405).end(); // Method Not Allowed (already exists)
        return;
      }

      await FileService.createFolder(user.id, folderName, parentFolderId || undefined);
      res.status(201).end();

    } catch (error: any) {
      logger.error('WebDAV MKCOL failed', { error: error.message, path: req.path });
      res.status(500).end();
    }
  }

  /**
   * Handle WebDAV MOVE request
   */
  static async handleMove(req: Request, res: Response, user: WebDAVUser): Promise<void> {
    try {
      const sourcePath = decodeURIComponent(req.path.replace('/webdav', '') || '/');
      const destinationHeader = req.headers.destination as string;
      
      if (!destinationHeader) {
        res.status(400).end();
        return;
      }

      const destinationPath = decodeURIComponent(new URL(destinationHeader).pathname.replace('/webdav', '') || '/');
      
      const source = this.parsePath(sourcePath);
      const dest = this.parsePath(destinationPath);

      if (source.fileName && dest.fileName) {
        // Move/rename file
        const sourceFolderId = await this.findFolderByPath(user.id, source.folderPath);
        const destFolderId = await this.findFolderByPath(user.id, dest.folderPath);

        const file = db.prepare(`
          SELECT * FROM files 
          WHERE owner_id = ? AND name = ? AND folder_id ${sourceFolderId ? '= ?' : 'IS NULL'} AND is_deleted = 0
        `).get(sourceFolderId ? [user.id, source.fileName, sourceFolderId] : [user.id, source.fileName]) as any;

        if (!file) {
          res.status(404).end();
          return;
        }

        // Update file location/name
        if (destFolderId !== sourceFolderId) {
          await FileService.moveFile(file.id, user.id, destFolderId || undefined);
        }
        
        if (dest.fileName !== source.fileName) {
          await FileService.renameFile(file.id, user.id, dest.fileName);
        }

        res.status(204).end();
      } else {
        // Move folder (not implemented for simplicity)
        res.status(501).end(); // Not Implemented
      }

    } catch (error: any) {
      logger.error('WebDAV MOVE failed', { error: error.message, path: req.path });
      res.status(500).end();
    }
  }

  /**
   * Handle WebDAV LOCK request (basic implementation)
   */
  static handleLock(req: Request, res: Response): void {
    // Basic lock response for Windows compatibility
    const lockToken = `opaquelocktoken:${Date.now()}-${Math.random().toString(36)}`;
    
    res.setHeader('Lock-Token', `<${lockToken}>`);
    res.status(200).set('Content-Type', 'application/xml; charset=utf-8').send(`
      <?xml version="1.0" encoding="utf-8"?>
      <D:prop xmlns:D="DAV:">
        <D:lockdiscovery>
          <D:activelock>
            <D:locktype><D:write/></D:locktype>
            <D:lockscope><D:exclusive/></D:lockscope>
            <D:depth>0</D:depth>
            <D:timeout>Second-3600</D:timeout>
            <D:locktoken><D:href>${lockToken}</D:href></D:locktoken>
          </D:activelock>
        </D:lockdiscovery>
      </D:prop>
    `);
  }

  /**
   * Handle WebDAV UNLOCK request
   */
  static handleUnlock(req: Request, res: Response): void {
    res.status(204).end();
  }

  /**
   * Get MIME type from file extension
   */
  private static getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.zip': 'application/zip',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Escape XML special characters
   */
  private static escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}