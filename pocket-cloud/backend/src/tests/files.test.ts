import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import { AuthService } from '../services/auth.service';
import { TrashService } from '../services/trash.service';
import { db } from '../db';
import filesRoutes from '../routes/files.routes';
import cookieParser from 'cookie-parser';

// Test app setup
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', filesRoutes);

describe('Files Tests', () => {
  const testUser1 = {
    username: 'filestestuser1',
    password: 'testpassword123'
  };

  const testUser2 = {
    username: 'filestestuser2',
    password: 'testpassword123'
  };

  let user1Cookie: string;
  let user2Cookie: string;
  let user1Id: string;
  let user2Id: string;
  let testFileId: string;
  let testFolderId: string;
  const testDir = join(process.cwd(), 'test-files');

  beforeAll(async () => {
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }

    // Create test users
    const user1 = await AuthService.createUser(testUser1.username, testUser1.password, 'user');
    const user2 = await AuthService.createUser(testUser2.username, testUser2.password, 'user');
    user1Id = user1.id;
    user2Id = user2.id;

    // Login both users
    const login1Response = await request(app)
      .post('/api/auth/login')
      .send(testUser1);
    user1Cookie = login1Response.headers['set-cookie'].find((cookie: string) => cookie.startsWith('session='));

    const login2Response = await request(app)
      .post('/api/auth/login')
      .send(testUser2);
    user2Cookie = login2Response.headers['set-cookie'].find((cookie: string) => cookie.startsWith('session='));

    // Create test folder
    const folderStmt = db.prepare(`
      INSERT INTO folders (id, owner_id, parent_id, name, path, is_deleted, deleted_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    testFolderId = crypto.randomUUID();
    const now = Date.now();
    folderStmt.run(testFolderId, user1Id, null, 'Test Folder', '/Test Folder', 0, null, now, now);

    // Create test file
    const testContent = 'This is a test file for download tests.';
    const testFilePath = join(testDir, 'test-download.txt');
    writeFileSync(testFilePath, testContent);

    const fileStmt = db.prepare(`
      INSERT INTO files (id, owner_id, folder_id, name, original_name, mime_type, size, storage_path, checksum, is_deleted, deleted_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    testFileId = crypto.randomUUID();
    const checksum = crypto.createHash('sha256').update(testContent).digest('hex');
    
    fileStmt.run(
      testFileId,
      user1Id,
      null,
      'test-download.txt',
      'test-download.txt',
      'text/plain',
      testContent.length,
      testFilePath,
      checksum,
      0,
      null,
      now,
      now
    );
  });

  afterAll(async () => {
    // Clean up test data
    const deleteUsersStmt = db.prepare('DELETE FROM users WHERE username IN (?, ?)');
    deleteUsersStmt.run(testUser1.username, testUser2.username);
    
    const deleteSessionsStmt = db.prepare('DELETE FROM sessions WHERE user_id IN (?, ?)');
    deleteSessionsStmt.run(user1Id, user2Id);

    const deleteFilesStmt = db.prepare('DELETE FROM files WHERE owner_id IN (?, ?)');
    deleteFilesStmt.run(user1Id, user2Id);

    const deleteFoldersStmt = db.prepare('DELETE FROM folders WHERE owner_id IN (?, ?)');
    deleteFoldersStmt.run(user1Id, user2Id);

    // Clean up test files
    try {
      const { rmSync } = require('fs');
      rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('File Download', () => {
    it('should download existing file with correct headers', async () => {
      const response = await request(app)
        .get(`/api/files/${testFileId}/download`)
        .set('Cookie', user1Cookie)
        .expect(200);

      expect(response.headers['content-type']).toBe('text/plain');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('test-download.txt');
      expect(response.text).toBe('This is a test file for download tests.');
    });

    it('should return 404 for non-existent file', async () => {
      const nonExistentId = crypto.randomUUID();
      
      await request(app)
        .get(`/api/files/${nonExistentId}/download`)
        .set('Cookie', user1Cookie)
        .expect(404);
    });

    it('should return 403 when accessing another user\'s file', async () => {
      await request(app)
        .get(`/api/files/${testFileId}/download`)
        .set('Cookie', user2Cookie)
        .expect(403);
    });

    it('should handle range requests for partial content', async () => {
      const response = await request(app)
        .get(`/api/files/${testFileId}/download`)
        .set('Cookie', user1Cookie)
        .set('Range', 'bytes=0-9')
        .expect(206);

      expect(response.headers['content-range']).toContain('bytes 0-9');
      expect(response.headers['accept-ranges']).toBe('bytes');
      expect(response.text).toBe('This is a ');
    });

    it('should handle invalid range requests', async () => {
      await request(app)
        .get(`/api/files/${testFileId}/download`)
        .set('Cookie', user1Cookie)
        .set('Range', 'bytes=1000-2000') // Beyond file size
        .expect(416); // Range not satisfiable
    });

    it('should require authentication for download', async () => {
      await request(app)
        .get(`/api/files/${testFileId}/download`)
        .expect(401);
    });
  });

  describe('File Metadata', () => {
    it('should get file metadata for owned file', async () => {
      const response = await request(app)
        .get(`/api/files/${testFileId}`)
        .set('Cookie', user1Cookie)
        .expect(200);

      expect(response.body.file).toHaveProperty('id', testFileId);
      expect(response.body.file).toHaveProperty('name', 'test-download.txt');
      expect(response.body.file).toHaveProperty('mime_type', 'text/plain');
      expect(response.body.file).toHaveProperty('size');
    });

    it('should return 404 for non-existent file metadata', async () => {
      const nonExistentId = crypto.randomUUID();
      
      await request(app)
        .get(`/api/files/${nonExistentId}`)
        .set('Cookie', user1Cookie)
        .expect(404);
    });

    it('should return 403 for another user\'s file metadata', async () => {
      await request(app)
        .get(`/api/files/${testFileId}`)
        .set('Cookie', user2Cookie)
        .expect(403);
    });
  });

  describe('Soft Delete', () => {
    let deletableFileId: string;

    beforeEach(async () => {
      // Create a file to delete
      const testContent = 'File to be deleted';
      const testFilePath = join(testDir, 'deletable.txt');
      writeFileSync(testFilePath, testContent);

      const fileStmt = db.prepare(`
        INSERT INTO files (id, owner_id, folder_id, name, original_name, mime_type, size, storage_path, checksum, is_deleted, deleted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      deletableFileId = crypto.randomUUID();
      const checksum = crypto.createHash('sha256').update(testContent).digest('hex');
      const now = Date.now();
      
      fileStmt.run(
        deletableFileId,
        user1Id,
        null,
        'deletable.txt',
        'deletable.txt',
        'text/plain',
        testContent.length,
        testFilePath,
        checksum,
        0,
        null,
        now,
        now
      );
    });

    it('should soft delete file and hide from listing', async () => {
      // Delete the file
      await request(app)
        .delete(`/api/files/${deletableFileId}`)
        .set('Cookie', user1Cookie)
        .expect(200);

      // Verify file is hidden from normal listing
      const listResponse = await request(app)
        .get('/api/folders')
        .set('Cookie', user1Cookie)
        .expect(200);

      const fileIds = listResponse.body.files?.map((f: any) => f.id) || [];
      expect(fileIds).not.toContain(deletableFileId);

      // Verify file still exists on disk
      const fileStmt = db.prepare('SELECT storage_path FROM files WHERE id = ?');
      const fileRecord = fileStmt.get(deletableFileId) as any;
      expect(existsSync(fileRecord.storage_path)).toBe(true);

      // Verify file is marked as deleted in DB
      const checkStmt = db.prepare('SELECT is_deleted, deleted_at FROM files WHERE id = ?');
      const result = checkStmt.get(deletableFileId) as any;
      expect(result.is_deleted).toBe(1);
      expect(result.deleted_at).toBeTruthy();
    });

    it('should show deleted file in trash', async () => {
      // Delete the file
      await request(app)
        .delete(`/api/files/${deletableFileId}`)
        .set('Cookie', user1Cookie)
        .expect(200);

      // Check trash contents
      const trashResponse = await request(app)
        .get('/api/trash')
        .set('Cookie', user1Cookie)
        .expect(200);

      const trashFileIds = trashResponse.body.files?.map((f: any) => f.id) || [];
      expect(trashFileIds).toContain(deletableFileId);
    });
  });

  describe('Restore from Trash', () => {
    let deletedFileId: string;
    let deletedFolderId: string;

    beforeEach(async () => {
      // Create and delete a file
      const testContent = 'File to restore';
      const testFilePath = join(testDir, 'restorable.txt');
      writeFileSync(testFilePath, testContent);

      const fileStmt = db.prepare(`
        INSERT INTO files (id, owner_id, folder_id, name, original_name, mime_type, size, storage_path, checksum, is_deleted, deleted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      deletedFileId = crypto.randomUUID();
      const checksum = crypto.createHash('sha256').update(testContent).digest('hex');
      const now = Date.now();
      
      fileStmt.run(
        deletedFileId,
        user1Id,
        testFolderId,
        'restorable.txt',
        'restorable.txt',
        'text/plain',
        testContent.length,
        testFilePath,
        checksum,
        1, // is_deleted
        now,
        now,
        now
      );

      // Create and delete a folder
      const folderStmt = db.prepare(`
        INSERT INTO folders (id, owner_id, parent_id, name, path, is_deleted, deleted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      deletedFolderId = crypto.randomUUID();
      folderStmt.run(deletedFolderId, user1Id, null, 'Deleted Folder', '/Deleted Folder', 1, now, now, now);
    });

    it('should restore file and make it appear in listing', async () => {
      // Restore the file
      await request(app)
        .post(`/api/trash/${deletedFileId}/restore`)
        .set('Cookie', user1Cookie)
        .send({ type: 'file' })
        .expect(200);

      // Verify file appears in normal listing
      const folderResponse = await request(app)
        .get(`/api/folders/${testFolderId}`)
        .set('Cookie', user1Cookie)
        .expect(200);

      const fileIds = folderResponse.body.files?.map((f: any) => f.id) || [];
      expect(fileIds).toContain(deletedFileId);

      // Verify file is no longer in trash
      const trashResponse = await request(app)
        .get('/api/trash')
        .set('Cookie', user1Cookie)
        .expect(200);

      const trashFileIds = trashResponse.body.files?.map((f: any) => f.id) || [];
      expect(trashFileIds).not.toContain(deletedFileId);
    });

    it('should restore file to root when parent folder is deleted', async () => {
      // Delete the parent folder first
      TrashService.softDeleteFolder(testFolderId, user1Id);

      // Restore the file
      await request(app)
        .post(`/api/trash/${deletedFileId}/restore`)
        .set('Cookie', user1Cookie)
        .send({ type: 'file' })
        .expect(200);

      // Verify file is restored to root (folder_id = null)
      const fileStmt = db.prepare('SELECT folder_id FROM files WHERE id = ?');
      const result = fileStmt.get(deletedFileId) as any;
      expect(result.folder_id).toBeNull();

      // Verify file appears in root listing
      const rootResponse = await request(app)
        .get('/api/folders')
        .set('Cookie', user1Cookie)
        .expect(200);

      const fileIds = rootResponse.body.files?.map((f: any) => f.id) || [];
      expect(fileIds).toContain(deletedFileId);
    });

    it('should restore folder and all its contents', async () => {
      // Restore the folder
      await request(app)
        .post(`/api/trash/${deletedFolderId}/restore`)
        .set('Cookie', user1Cookie)
        .send({ type: 'folder' })
        .expect(200);

      // Verify folder appears in listing
      const rootResponse = await request(app)
        .get('/api/folders')
        .set('Cookie', user1Cookie)
        .expect(200);

      const folderIds = rootResponse.body.folders?.map((f: any) => f.id) || [];
      expect(folderIds).toContain(deletedFolderId);

      // Verify folder is marked as not deleted
      const folderStmt = db.prepare('SELECT is_deleted FROM folders WHERE id = ?');
      const result = folderStmt.get(deletedFolderId) as any;
      expect(result.is_deleted).toBe(0);
    });
  });

  describe('File Operations', () => {
    it('should rename file', async () => {
      const newName = 'renamed-file.txt';
      
      const response = await request(app)
        .patch(`/api/files/${testFileId}/rename`)
        .set('Cookie', user1Cookie)
        .send({ name: newName })
        .expect(200);

      expect(response.body.name).toBe(newName);

      // Verify in database
      const fileStmt = db.prepare('SELECT name FROM files WHERE id = ?');
      const result = fileStmt.get(testFileId) as any;
      expect(result.name).toBe(newName);
    });

    it('should move file to different folder', async () => {
      const response = await request(app)
        .patch(`/api/files/${testFileId}/move`)
        .set('Cookie', user1Cookie)
        .send({ targetFolderId: testFolderId })
        .expect(200);

      expect(response.body.folder_id).toBe(testFolderId);

      // Verify in database
      const fileStmt = db.prepare('SELECT folder_id FROM files WHERE id = ?');
      const result = fileStmt.get(testFileId) as any;
      expect(result.folder_id).toBe(testFolderId);
    });

    it('should copy file', async () => {
      const response = await request(app)
        .post(`/api/files/${testFileId}/copy`)
        .set('Cookie', user1Cookie)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.id).not.toBe(testFileId);
      expect(response.body.name).toContain('Copy');

      // Verify copy exists on disk
      expect(existsSync(response.body.storage_path)).toBe(true);
    });
  });

  describe('Folder Operations', () => {
    it('should create folder', async () => {
      const folderName = 'New Test Folder';
      
      const response = await request(app)
        .post('/api/folders')
        .set('Cookie', user1Cookie)
        .send({ name: folderName })
        .expect(201);

      expect(response.body.name).toBe(folderName);
      expect(response.body.path).toBe(`/${folderName}`);
    });

    it('should get folder contents', async () => {
      const response = await request(app)
        .get(`/api/folders/${testFolderId}`)
        .set('Cookie', user1Cookie)
        .expect(200);

      expect(response.body).toHaveProperty('folder');
      expect(response.body).toHaveProperty('subfolders');
      expect(response.body).toHaveProperty('files');
      expect(response.body.folder.id).toBe(testFolderId);
    });

    it('should delete folder and all contents', async () => {
      // Create a folder to delete
      const folderStmt = db.prepare(`
        INSERT INTO folders (id, owner_id, parent_id, name, path, is_deleted, deleted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const deletableFolderId = crypto.randomUUID();
      const now = Date.now();
      folderStmt.run(deletableFolderId, user1Id, null, 'Deletable Folder', '/Deletable Folder', 0, null, now, now);

      // Delete the folder
      await request(app)
        .delete(`/api/folders/${deletableFolderId}`)
        .set('Cookie', user1Cookie)
        .expect(200);

      // Verify folder is soft deleted
      const checkStmt = db.prepare('SELECT is_deleted FROM folders WHERE id = ?');
      const result = checkStmt.get(deletableFolderId) as any;
      expect(result.is_deleted).toBe(1);
    });
  });

  describe('Search', () => {
    it('should search files by name', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'test' })
        .set('Cookie', user1Cookie)
        .expect(200);

      expect(response.body).toHaveProperty('files');
      expect(response.body).toHaveProperty('folders');
      
      // Should find our test file
      const foundFile = response.body.files.find((f: any) => f.id === testFileId);
      expect(foundFile).toBeDefined();
    });

    it('should filter search by type', async () => {
      const response = await request(app)
        .get('/api/search')
        .query({ q: 'test', type: 'file' })
        .set('Cookie', user1Cookie)
        .expect(200);

      expect(response.body.files).toBeDefined();
      expect(response.body.folders).toHaveLength(0);
    });
  });

  describe('Storage Stats', () => {
    it('should get storage statistics', async () => {
      const response = await request(app)
        .get('/api/storage/stats')
        .set('Cookie', user1Cookie)
        .expect(200);

      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('used');
      expect(response.body).toHaveProperty('free');
      expect(response.body).toHaveProperty('fileCount');
      expect(response.body).toHaveProperty('breakdown');
    });
  });
});