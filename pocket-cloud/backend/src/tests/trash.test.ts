import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import { AuthService } from '../services/auth.service';
import { TrashService } from '../services/trash.service';
import { db } from '../db';
import trashRoutes from '../routes/trash.routes';
import cookieParser from 'cookie-parser';

// Test app setup
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/trash', trashRoutes);

describe('Trash Tests', () => {
  const testUser = {
    username: 'trashtest',
    password: 'testpassword123'
  };

  let sessionCookie: string;
  let userId: string;
  const testDir = join(process.cwd(), 'test-trash');

  beforeAll(async () => {
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }

    // Create test user
    const user = await AuthService.createUser(testUser.username, testUser.password, 'user');
    userId = user.user!.id;

    // Login to get session cookie
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send(testUser);

    const cookies = loginResponse.headers['set-cookie'];
    sessionCookie = cookies.find((cookie: string) => cookie.startsWith('session='))!;
  });

  afterAll(async () => {
    // Clean up test data
    const deleteStmt = db.prepare('DELETE FROM users WHERE username = ?');
    deleteStmt.run(testUser.username);
    
    const deleteSessionsStmt = db.prepare('DELETE FROM sessions WHERE user_id = ?');
    deleteSessionsStmt.run(userId);

    const deleteFilesStmt = db.prepare('DELETE FROM files WHERE owner_id = ?');
    deleteFilesStmt.run(userId);

    const deleteFoldersStmt = db.prepare('DELETE FROM folders WHERE owner_id = ?');
    deleteFoldersStmt.run(userId);

    // Clean up test files
    try {
      const { rmSync } = require('fs');
      rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Clean up any existing test data
    const deleteFilesStmt = db.prepare('DELETE FROM files WHERE owner_id = ?');
    deleteFilesStmt.run(userId);

    const deleteFoldersStmt = db.prepare('DELETE FROM folders WHERE owner_id = ?');
    deleteFoldersStmt.run(userId);
  });

  describe('Purge Expired Items', () => {
    it('should purge items older than 30 days and remove from disk', async () => {
      // Create old deleted file
      const oldContent = 'Old deleted file content';
      const oldFilePath = join(testDir, 'old-deleted.txt');
      writeFileSync(oldFilePath, oldContent);

      const oldFileId = crypto.randomUUID();
      const oldChecksum = crypto.createHash('sha256').update(oldContent).digest('hex');
      const thirtyOneDaysAgo = Date.now() - (31 * 24 * 60 * 60 * 1000);

      const insertOldFileStmt = db.prepare(`
        INSERT INTO files (id, owner_id, folder_id, name, original_name, mime_type, size, storage_path, checksum, is_deleted, deleted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertOldFileStmt.run(
        oldFileId,
        userId,
        null,
        'old-deleted.txt',
        'old-deleted.txt',
        'text/plain',
        oldContent.length,
        oldFilePath,
        oldChecksum,
        1, // is_deleted
        thirtyOneDaysAgo,
        thirtyOneDaysAgo,
        thirtyOneDaysAgo
      );

      // Verify file exists before purge
      expect(existsSync(oldFilePath)).toBe(true);

      // Run purge
      const result = await TrashService.purgeExpiredItems();

      // Verify file was deleted from disk
      expect(existsSync(oldFilePath)).toBe(false);

      // Verify file was removed from database
      const checkStmt = db.prepare('SELECT COUNT(*) as count FROM files WHERE id = ?');
      const dbResult = checkStmt.get(oldFileId) as { count: number };
      expect(dbResult.count).toBe(0);

      // Verify purge results
      expect(result.filesDeleted).toBeGreaterThan(0);
      expect(result.bytesFreed).toBeGreaterThan(0);
    });

    it('should not affect items newer than 30 days', async () => {
      // Create recently deleted file
      const recentContent = 'Recently deleted file';
      const recentFilePath = join(testDir, 'recent-deleted.txt');
      writeFileSync(recentFilePath, recentContent);

      const recentFileId = crypto.randomUUID();
      const recentChecksum = crypto.createHash('sha256').update(recentContent).digest('hex');
      const oneDayAgo = Date.now() - (1 * 24 * 60 * 60 * 1000);

      const insertRecentFileStmt = db.prepare(`
        INSERT INTO files (id, owner_id, folder_id, name, original_name, mime_type, size, storage_path, checksum, is_deleted, deleted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertRecentFileStmt.run(
        recentFileId,
        userId,
        null,
        'recent-deleted.txt',
        'recent-deleted.txt',
        'text/plain',
        recentContent.length,
        recentFilePath,
        recentChecksum,
        1, // is_deleted
        oneDayAgo,
        oneDayAgo,
        oneDayAgo
      );

      // Run purge
      const result = await TrashService.purgeExpiredItems();

      // Verify recent file still exists
      expect(existsSync(recentFilePath)).toBe(true);

      // Verify file still in database
      const checkStmt = db.prepare('SELECT COUNT(*) as count FROM files WHERE id = ?');
      const dbResult = checkStmt.get(recentFileId) as { count: number };
      expect(dbResult.count).toBe(1);
    });

    it('should handle folder purging with children', async () => {
      // Create old deleted folder with file
      const folderId = crypto.randomUUID();
      const fileId = crypto.randomUUID();
      const thirtyOneDaysAgo = Date.now() - (31 * 24 * 60 * 60 * 1000);

      // Insert folder
      const insertFolderStmt = db.prepare(`
        INSERT INTO folders (id, owner_id, parent_id, name, path, is_deleted, deleted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertFolderStmt.run(
        folderId,
        userId,
        null,
        'Old Folder',
        '/Old Folder',
        1, // is_deleted
        thirtyOneDaysAgo,
        thirtyOneDaysAgo,
        thirtyOneDaysAgo
      );

      // Insert file in folder
      const fileContent = 'File in old folder';
      const filePath = join(testDir, 'folder-file.txt');
      writeFileSync(filePath, fileContent);

      const insertFileStmt = db.prepare(`
        INSERT INTO files (id, owner_id, folder_id, name, original_name, mime_type, size, storage_path, checksum, is_deleted, deleted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const checksum = crypto.createHash('sha256').update(fileContent).digest('hex');
      insertFileStmt.run(
        fileId,
        userId,
        folderId,
        'folder-file.txt',
        'folder-file.txt',
        'text/plain',
        fileContent.length,
        filePath,
        checksum,
        1, // is_deleted
        thirtyOneDaysAgo,
        thirtyOneDaysAgo,
        thirtyOneDaysAgo
      );

      // Run purge
      const result = await TrashService.purgeExpiredItems();

      // Verify both folder and file were removed
      const folderCheckStmt = db.prepare('SELECT COUNT(*) as count FROM folders WHERE id = ?');
      const folderResult = folderCheckStmt.get(folderId) as { count: number };
      expect(folderResult.count).toBe(0);

      const fileCheckStmt = db.prepare('SELECT COUNT(*) as count FROM files WHERE id = ?');
      const fileResult = fileCheckStmt.get(fileId) as { count: number };
      expect(fileResult.count).toBe(0);

      // Verify file was deleted from disk
      expect(existsSync(filePath)).toBe(false);
    });
  });

  describe('Restore File with Deleted Parent', () => {
    it('should restore file to root when parent folder is deleted', async () => {
      // Create folder and file
      const folderId = crypto.randomUUID();
      const fileId = crypto.randomUUID();
      const now = Date.now();

      // Insert folder (deleted)
      const insertFolderStmt = db.prepare(`
        INSERT INTO folders (id, owner_id, parent_id, name, path, is_deleted, deleted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertFolderStmt.run(
        folderId,
        userId,
        null,
        'Deleted Parent',
        '/Deleted Parent',
        1, // is_deleted
        now,
        now,
        now
      );

      // Insert file in deleted folder
      const fileContent = 'File with deleted parent';
      const filePath = join(testDir, 'orphaned-file.txt');
      writeFileSync(filePath, fileContent);

      const insertFileStmt = db.prepare(`
        INSERT INTO files (id, owner_id, folder_id, name, original_name, mime_type, size, storage_path, checksum, is_deleted, deleted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const checksum = crypto.createHash('sha256').update(fileContent).digest('hex');
      insertFileStmt.run(
        fileId,
        userId,
        folderId,
        'orphaned-file.txt',
        'orphaned-file.txt',
        'text/plain',
        fileContent.length,
        filePath,
        checksum,
        1, // is_deleted
        now,
        now,
        now
      );

      // Restore file
      await TrashService.restoreFile(fileId, userId);

      // Verify file is restored to root (folder_id = null)
      const fileCheckStmt = db.prepare('SELECT folder_id, is_deleted FROM files WHERE id = ?');
      const fileResult = fileCheckStmt.get(fileId) as { folder_id: string | null; is_deleted: number };
      
      expect(fileResult.folder_id).toBeNull();
      expect(fileResult.is_deleted).toBe(0);
    });

    it('should restore file to original location when parent exists', async () => {
      // Create folder and file
      const folderId = crypto.randomUUID();
      const fileId = crypto.randomUUID();
      const now = Date.now();

      // Insert folder (not deleted)
      const insertFolderStmt = db.prepare(`
        INSERT INTO folders (id, owner_id, parent_id, name, path, is_deleted, deleted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertFolderStmt.run(
        folderId,
        userId,
        null,
        'Active Parent',
        '/Active Parent',
        0, // not deleted
        null,
        now,
        now
      );

      // Insert deleted file in active folder
      const fileContent = 'File with active parent';
      const filePath = join(testDir, 'normal-file.txt');
      writeFileSync(filePath, fileContent);

      const insertFileStmt = db.prepare(`
        INSERT INTO files (id, owner_id, folder_id, name, original_name, mime_type, size, storage_path, checksum, is_deleted, deleted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const checksum = crypto.createHash('sha256').update(fileContent).digest('hex');
      insertFileStmt.run(
        fileId,
        userId,
        folderId,
        'normal-file.txt',
        'normal-file.txt',
        'text/plain',
        fileContent.length,
        filePath,
        checksum,
        1, // is_deleted
        now,
        now,
        now
      );

      // Restore file
      await TrashService.restoreFile(fileId, userId);

      // Verify file is restored to original folder
      const fileCheckStmt = db.prepare('SELECT folder_id, is_deleted FROM files WHERE id = ?');
      const fileResult = fileCheckStmt.get(fileId) as { folder_id: string; is_deleted: number };
      
      expect(fileResult.folder_id).toBe(folderId);
      expect(fileResult.is_deleted).toBe(0);
    });
  });

  describe('Trash API Endpoints', () => {
    let deletedFileId: string;
    let deletedFolderId: string;

    beforeEach(async () => {
      // Create test items in trash
      const now = Date.now();

      // Create deleted file
      const fileContent = 'Deleted file content';
      const filePath = join(testDir, 'api-test-file.txt');
      writeFileSync(filePath, fileContent);

      deletedFileId = crypto.randomUUID();
      const checksum = crypto.createHash('sha256').update(fileContent).digest('hex');

      const insertFileStmt = db.prepare(`
        INSERT INTO files (id, owner_id, folder_id, name, original_name, mime_type, size, storage_path, checksum, is_deleted, deleted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertFileStmt.run(
        deletedFileId,
        userId,
        null,
        'api-test-file.txt',
        'api-test-file.txt',
        'text/plain',
        fileContent.length,
        filePath,
        checksum,
        1, // is_deleted
        now,
        now,
        now
      );

      // Create deleted folder
      deletedFolderId = crypto.randomUUID();
      const insertFolderStmt = db.prepare(`
        INSERT INTO folders (id, owner_id, parent_id, name, path, is_deleted, deleted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertFolderStmt.run(
        deletedFolderId,
        userId,
        null,
        'API Test Folder',
        '/API Test Folder',
        1, // is_deleted
        now,
        now,
        now
      );
    });

    it('should list trash contents', async () => {
      const response = await request(app)
        .get('/api/trash')
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(response.body).toHaveProperty('files');
      expect(response.body).toHaveProperty('folders');
      
      const fileIds = response.body.files.map((f: any) => f.id);
      const folderIds = response.body.folders.map((f: any) => f.id);
      
      expect(fileIds).toContain(deletedFileId);
      expect(folderIds).toContain(deletedFolderId);
    });

    it('should get trash statistics', async () => {
      const response = await request(app)
        .get('/api/trash/stats')
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(response.body).toHaveProperty('itemCount');
      expect(response.body).toHaveProperty('totalSize');
      expect(response.body.itemCount).toBeGreaterThan(0);
      expect(response.body.totalSize).toBeGreaterThan(0);
    });

    it('should restore file from trash', async () => {
      await request(app)
        .post(`/api/trash/${deletedFileId}/restore`)
        .set('Cookie', sessionCookie)
        .expect(200);

      // Verify file is no longer deleted
      const checkStmt = db.prepare('SELECT is_deleted FROM files WHERE id = ?');
      const result = checkStmt.get(deletedFileId) as { is_deleted: number };
      expect(result.is_deleted).toBe(0);
    });

    it('should restore folder from trash', async () => {
      await request(app)
        .post(`/api/trash/${deletedFolderId}/restore`)
        .set('Cookie', sessionCookie)
        .expect(200);

      // Verify folder is no longer deleted
      const checkStmt = db.prepare('SELECT is_deleted FROM folders WHERE id = ?');
      const result = checkStmt.get(deletedFolderId) as { is_deleted: number };
      expect(result.is_deleted).toBe(0);
    });

    it('should permanently delete single item', async () => {
      await request(app)
        .delete(`/api/trash/${deletedFileId}`)
        .set('Cookie', sessionCookie)
        .expect(200);

      // Verify file is completely removed from database
      const checkStmt = db.prepare('SELECT COUNT(*) as count FROM files WHERE id = ?');
      const result = checkStmt.get(deletedFileId) as { count: number };
      expect(result.count).toBe(0);
    });

    it('should empty entire trash', async () => {
      await request(app)
        .delete('/api/trash/empty')
        .set('Cookie', sessionCookie)
        .expect(200);

      // Verify all deleted items are removed
      const fileCheckStmt = db.prepare('SELECT COUNT(*) as count FROM files WHERE owner_id = ? AND is_deleted = 1');
      const fileResult = fileCheckStmt.get(userId) as { count: number };
      expect(fileResult.count).toBe(0);

      const folderCheckStmt = db.prepare('SELECT COUNT(*) as count FROM folders WHERE owner_id = ? AND is_deleted = 1');
      const folderResult = folderCheckStmt.get(userId) as { count: number };
      expect(folderResult.count).toBe(0);
    });

    it('should require authentication for trash operations', async () => {
      await request(app)
        .get('/api/trash')
        .expect(401);

      await request(app)
        .post(`/api/trash/${deletedFileId}/restore`)
        .expect(401);

      await request(app)
        .delete(`/api/trash/${deletedFileId}`)
        .expect(401);
    });

    it('should prevent access to other users trash items', async () => {
      // Create another user
      const otherUser = await AuthService.createUser('othertrashuser', 'password123', 'user');
      const otherUserId = otherUser.user!.id;

      // Login as other user
      const otherLoginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'othertrashuser', password: 'password123' });

      const otherCookies = otherLoginResponse.headers['set-cookie'];
      const otherSessionCookie = otherCookies.find((cookie: string) => cookie.startsWith('session='))!;

      // Try to restore first user's file
      await request(app)
        .post(`/api/trash/${deletedFileId}/restore`)
        .set('Cookie', otherSessionCookie)
        .expect(404); // Should not find the file

      // Clean up other user
      const deleteOtherStmt = db.prepare('DELETE FROM users WHERE id = ?');
      deleteOtherStmt.run(otherUserId);
    });
  });

  describe('Storage Stats Update', () => {
    it('should update storage stats after permanent delete', async () => {
      // Create file to delete
      const fileContent = 'File for stats test';
      const filePath = join(testDir, 'stats-test.txt');
      writeFileSync(filePath, fileContent);

      const fileId = crypto.randomUUID();
      const checksum = crypto.createHash('sha256').update(fileContent).digest('hex');
      const now = Date.now();

      const insertFileStmt = db.prepare(`
        INSERT INTO files (id, owner_id, folder_id, name, original_name, mime_type, size, storage_path, checksum, is_deleted, deleted_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertFileStmt.run(
        fileId,
        userId,
        null,
        'stats-test.txt',
        'stats-test.txt',
        'text/plain',
        fileContent.length,
        filePath,
        checksum,
        1, // is_deleted
        now,
        now,
        now
      );

      // Get initial stats
      const initialStats = await TrashService.getTrashSize(userId);

      // Permanently delete file
      await TrashService.permanentDelete(fileId, userId);

      // Get updated stats
      const updatedStats = await TrashService.getTrashSize(userId);

      // Stats should be reduced
      expect(updatedStats.totalSize).toBeLessThan(initialStats.totalSize);
    });
  });
});