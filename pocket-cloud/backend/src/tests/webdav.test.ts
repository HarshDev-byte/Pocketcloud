import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { db } from '../db';
import bcrypt from 'bcryptjs';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

/**
 * WebDAV Integration Tests
 * 
 * Tests RFC 4918 WebDAV compliance for network drive mounting
 */

describe('WebDAV Server', () => {
  const testUser = {
    username: 'webdav-test',
    password: 'test123',
    email: 'webdav@test.com'
  };
  
  const authHeader = `Basic ${Buffer.from(`${testUser.username}:${testUser.password}`).toString('base64')}`;
  const testStoragePath = '/tmp/pocketcloud-test';
  
  beforeAll(async () => {
    // Create test user
    const hashedPassword = await bcrypt.hash(testUser.password, 10);
    db.prepare(`
      INSERT OR REPLACE INTO users (username, email, password_hash, role, created_at)
      VALUES (?, ?, ?, 'user', datetime('now'))
    `).run(testUser.username, testUser.email, hashedPassword);
    
    // Create test storage directory
    mkdirSync(testStoragePath, { recursive: true });
    process.env.STORAGE_PATH = testStoragePath;
  });
  
  afterAll(() => {
    // Clean up test user
    db.prepare('DELETE FROM users WHERE username = ?').run(testUser.username);
    
    // Clean up test storage
    rmSync(testStoragePath, { recursive: true, force: true });
  });
  
  beforeEach(() => {
    // Clean test storage before each test
    rmSync(testStoragePath, { recursive: true, force: true });
    mkdirSync(testStoragePath, { recursive: true });
  });

  describe('OPTIONS - WebDAV Capabilities', () => {
    it('should advertise WebDAV support', async () => {
      const response = await request(app)
        .options('/webdav/')
        .expect(200);
      
      expect(response.headers.dav).toBe('1, 2');
      expect(response.headers.allow).toContain('PROPFIND');
      expect(response.headers.allow).toContain('PUT');
      expect(response.headers.allow).toContain('DELETE');
      expect(response.headers['ms-author-via']).toBe('DAV');
    });
  });

  describe('Authentication', () => {
    it('should require authentication', async () => {
      await request(app)
        .get('/webdav/')
        .expect(401)
        .expect('WWW-Authenticate', 'Basic realm="PocketCloud WebDAV"');
    });
    
    it('should accept valid credentials', async () => {
      await request(app)
        .get('/webdav/')
        .set('Authorization', authHeader)
        .expect(200);
    });
    
    it('should reject invalid credentials', async () => {
      const invalidAuth = `Basic ${Buffer.from('invalid:password').toString('base64')}`;
      
      await request(app)
        .get('/webdav/')
        .set('Authorization', invalidAuth)
        .expect(401);
    });
  });
});
  describe('PROPFIND - Directory Listing', () => {
    it('should list empty directory', async () => {
      const response = await request(app)
        .request('PROPFIND', '/webdav/')
        .set('Authorization', authHeader)
        .set('Depth', '1')
        .expect(207);
      
      expect(response.headers['content-type']).toContain('application/xml');
      expect(response.text).toContain('<?xml version="1.0"');
      expect(response.text).toContain('<D:multistatus');
      expect(response.text).toContain('<D:response>');
    });
    
    it('should list directory with files', async () => {
      // Create test files
      const userDir = join(testStoragePath, 'users', '1');
      mkdirSync(userDir, { recursive: true });
      writeFileSync(join(userDir, 'test.txt'), 'Hello WebDAV');
      mkdirSync(join(userDir, 'subfolder'));
      
      const response = await request(app)
        .request('PROPFIND', '/webdav/')
        .set('Authorization', authHeader)
        .set('Depth', '1')
        .expect(207);
      
      expect(response.text).toContain('test.txt');
      expect(response.text).toContain('subfolder');
      expect(response.text).toContain('<D:getcontentlength>');
      expect(response.text).toContain('<D:getlastmodified>');
    });
    
    it('should handle depth 0 requests', async () => {
      const response = await request(app)
        .request('PROPFIND', '/webdav/')
        .set('Authorization', authHeader)
        .set('Depth', '0')
        .expect(207);
      
      expect(response.text).toContain('<D:collection/>');
    });
  });

  describe('GET - File Download', () => {
    it('should download existing file', async () => {
      // Create test file
      const userDir = join(testStoragePath, 'users', '1');
      mkdirSync(userDir, { recursive: true });
      const testContent = 'Hello WebDAV World!';
      writeFileSync(join(userDir, 'download.txt'), testContent);
      
      const response = await request(app)
        .get('/webdav/download.txt')
        .set('Authorization', authHeader)
        .expect(200);
      
      expect(response.text).toBe(testContent);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.headers['content-length']).toBe(testContent.length.toString());
    });
    
    it('should return 404 for non-existent file', async () => {
      await request(app)
        .get('/webdav/nonexistent.txt')
        .set('Authorization', authHeader)
        .expect(404);
    });
    
    it('should serve directory listing as HTML', async () => {
      const response = await request(app)
        .get('/webdav/')
        .set('Authorization', authHeader)
        .expect(200);
      
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('PocketCloud Drive');
    });
  });

  describe('PUT - File Upload', () => {
    it('should upload new file', async () => {
      const testContent = 'Uploaded via WebDAV';
      
      await request(app)
        .put('/webdav/upload.txt')
        .set('Authorization', authHeader)
        .send(testContent)
        .expect(201);
      
      // Verify file was created
      const response = await request(app)
        .get('/webdav/upload.txt')
        .set('Authorization', authHeader)
        .expect(200);
      
      expect(response.text).toBe(testContent);
    });
    
    it('should overwrite existing file', async () => {
      // Create initial file
      await request(app)
        .put('/webdav/overwrite.txt')
        .set('Authorization', authHeader)
        .send('Original content')
        .expect(201);
      
      // Overwrite with new content
      const newContent = 'Updated content';
      await request(app)
        .put('/webdav/overwrite.txt')
        .set('Authorization', authHeader)
        .send(newContent)
        .expect(201);
      
      // Verify new content
      const response = await request(app)
        .get('/webdav/overwrite.txt')
        .set('Authorization', authHeader)
        .expect(200);
      
      expect(response.text).toBe(newContent);
    });
    
    it('should reject .DS_Store files', async () => {
      await request(app)
        .put('/webdav/.DS_Store')
        .set('Authorization', authHeader)
        .send('macOS metadata')
        .expect(403);
    });
  });

  describe('DELETE - File Removal', () => {
    it('should delete existing file', async () => {
      // Create test file
      await request(app)
        .put('/webdav/delete-me.txt')
        .set('Authorization', authHeader)
        .send('Delete this file')
        .expect(201);
      
      // Delete the file
      await request(app)
        .delete('/webdav/delete-me.txt')
        .set('Authorization', authHeader)
        .expect(204);
      
      // Verify file is gone
      await request(app)
        .get('/webdav/delete-me.txt')
        .set('Authorization', authHeader)
        .expect(404);
    });
    
    it('should return 404 for non-existent file', async () => {
      await request(app)
        .delete('/webdav/nonexistent.txt')
        .set('Authorization', authHeader)
        .expect(404);
    });
  });

  describe('MKCOL - Directory Creation', () => {
    it('should create new directory', async () => {
      await request(app)
        .request('MKCOL', '/webdav/new-folder')
        .set('Authorization', authHeader)
        .expect(201);
      
      // Verify directory exists
      const response = await request(app)
        .request('PROPFIND', '/webdav/new-folder')
        .set('Authorization', authHeader)
        .set('Depth', '0')
        .expect(207);
      
      expect(response.text).toContain('<D:collection/>');
    });
  });

  describe('COPY - File/Directory Copy', () => {
    it('should copy file', async () => {
      // Create source file
      const content = 'Copy me!';
      await request(app)
        .put('/webdav/source.txt')
        .set('Authorization', authHeader)
        .send(content)
        .expect(201);
      
      // Copy file
      await request(app)
        .request('COPY', '/webdav/source.txt')
        .set('Authorization', authHeader)
        .set('Destination', 'http://localhost/webdav/copy.txt')
        .expect(201);
      
      // Verify copy exists
      const response = await request(app)
        .get('/webdav/copy.txt')
        .set('Authorization', authHeader)
        .expect(200);
      
      expect(response.text).toBe(content);
    });
  });

  describe('MOVE - File/Directory Move', () => {
    it('should move file', async () => {
      // Create source file
      const content = 'Move me!';
      await request(app)
        .put('/webdav/move-source.txt')
        .set('Authorization', authHeader)
        .send(content)
        .expect(201);
      
      // Move file
      await request(app)
        .request('MOVE', '/webdav/move-source.txt')
        .set('Authorization', authHeader)
        .set('Destination', 'http://localhost/webdav/moved.txt')
        .expect(201);
      
      // Verify source is gone
      await request(app)
        .get('/webdav/move-source.txt')
        .set('Authorization', authHeader)
        .expect(404);
      
      // Verify destination exists
      const response = await request(app)
        .get('/webdav/moved.txt')
        .set('Authorization', authHeader)
        .expect(200);
      
      expect(response.text).toBe(content);
    });
  });

  describe('LOCK/UNLOCK - Resource Locking', () => {
    it('should lock and unlock resource', async () => {
      // Create test file
      await request(app)
        .put('/webdav/lockable.txt')
        .set('Authorization', authHeader)
        .send('Lock this file')
        .expect(201);
      
      // Lock the file
      const lockXml = `<?xml version="1.0" encoding="utf-8"?>
        <D:lockinfo xmlns:D="DAV:">
          <D:lockscope><D:exclusive/></D:lockscope>
          <D:locktype><D:write/></D:locktype>
          <D:owner>WebDAV Test</D:owner>
        </D:lockinfo>`;
      
      const lockResponse = await request(app)
        .request('LOCK', '/webdav/lockable.txt')
        .set('Authorization', authHeader)
        .set('Content-Type', 'application/xml')
        .send(lockXml)
        .expect(200);
      
      expect(lockResponse.headers['lock-token']).toBeDefined();
      expect(lockResponse.text).toContain('<D:locktoken>');
      
      const lockToken = lockResponse.headers['lock-token'];
      
      // Unlock the file
      await request(app)
        .request('UNLOCK', '/webdav/lockable.txt')
        .set('Authorization', authHeader)
        .set('Lock-Token', lockToken)
        .expect(204);
    });
  });

  describe('Windows WebDAV Client Compatibility', () => {
    it('should handle If header with lock tokens', async () => {
      // Create and lock file
      await request(app)
        .put('/webdav/windows-test.txt')
        .set('Authorization', authHeader)
        .send('Windows WebDAV test')
        .expect(201);
      
      const lockXml = `<?xml version="1.0" encoding="utf-8"?>
        <D:lockinfo xmlns:D="DAV:">
          <D:lockscope><D:exclusive/></D:lockscope>
          <D:locktype><D:write/></D:locktype>
          <D:owner>Windows Client</D:owner>
        </D:lockinfo>`;
      
      const lockResponse = await request(app)
        .request('LOCK', '/webdav/windows-test.txt')
        .set('Authorization', authHeader)
        .send(lockXml)
        .expect(200);
      
      const lockToken = lockResponse.headers['lock-token'];
      
      // Try to modify with If header (Windows style)
      await request(app)
        .put('/webdav/windows-test.txt')
        .set('Authorization', authHeader)
        .set('If', `(${lockToken})`)
        .send('Modified by Windows client')
        .expect(201);
    });
  });

  describe('macOS Finder Compatibility', () => {
    it('should handle .well-known/caldav requests', async () => {
      await request(app)
        .get('/webdav/.well-known/caldav')
        .set('Authorization', authHeader)
        .expect(404);
    });
    
    it('should handle _DAV_NOT_FOUND_ requests', async () => {
      await request(app)
        .get('/webdav/_DAV_NOT_FOUND_/test')
        .set('Authorization', authHeader)
        .expect(404);
    });
  });

  describe('Performance and Limits', () => {
    it('should handle large directory listings', async () => {
      // Create many files
      const userDir = join(testStoragePath, 'users', '1');
      mkdirSync(userDir, { recursive: true });
      
      for (let i = 0; i < 100; i++) {
        writeFileSync(join(userDir, `file${i}.txt`), `Content ${i}`);
      }
      
      const response = await request(app)
        .request('PROPFIND', '/webdav/')
        .set('Authorization', authHeader)
        .set('Depth', '1')
        .expect(207);
      
      // Should handle all files without timeout
      expect(response.text).toContain('file0.txt');
      expect(response.text).toContain('file99.txt');
    });
  });
});