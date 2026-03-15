import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { existsSync, unlinkSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import { AuthService } from '../services/auth.service';
import { UploadService } from '../services/upload.service';
import { db } from '../db';
import uploadRoutes from '../routes/upload.routes';
import cookieParser from 'cookie-parser';

// Test app setup
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));
app.use(cookieParser());
app.use('/api/upload', uploadRoutes);

describe('Upload Tests', () => {
  const testUser = {
    username: 'uploadtestuser',
    password: 'testpassword123'
  };
  
  let sessionCookie: string;
  let userId: string;
  const testDir = join(process.cwd(), 'test-uploads');

  beforeAll(async () => {
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }

    // Create test user
    const user = await AuthService.createUser(testUser.username, testUser.password, 'user');
    userId = user.id;

    // Login to get session cookie
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send(testUser);

    const cookies = loginResponse.headers['set-cookie'];
    sessionCookie = cookies.find((cookie: string) => cookie.startsWith('session='));
  });

  afterAll(async () => {
    // Clean up test data
    const deleteStmt = db.prepare('DELETE FROM users WHERE username = ?');
    deleteStmt.run(testUser.username);
    
    const deleteSessionsStmt = db.prepare('DELETE FROM sessions WHERE user_id = ?');
    deleteSessionsStmt.run(userId);

    const deleteFilesStmt = db.prepare('DELETE FROM files WHERE owner_id = ?');
    deleteFilesStmt.run(userId);

    // Clean up test files
    try {
      const { rmSync } = require('fs');
      rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Clean up any existing upload sessions
    UploadService.cleanStalledUploads();
  });

  describe('Single-shot Upload (< 10MB)', () => {
    it('should upload small file and create DB record', async () => {
      const testContent = 'Hello, World! This is a test file.';
      const fileName = 'test-small.txt';
      const mimeType = 'text/plain';

      const response = await request(app)
        .post('/api/upload/single')
        .set('Cookie', sessionCookie)
        .attach('file', Buffer.from(testContent), {
          filename: fileName,
          contentType: mimeType
        })
        .expect(201);

      expect(response.body).toHaveProperty('file');
      expect(response.body.file.name).toBe(fileName);
      expect(response.body.file.size).toBe(testContent.length);
      expect(response.body.file.mime_type).toBe(mimeType);

      // Verify file exists on disk
      const fileRecord = response.body.file;
      expect(existsSync(fileRecord.storage_path)).toBe(true);

      // Verify file content
      const diskContent = readFileSync(fileRecord.storage_path, 'utf8');
      expect(diskContent).toBe(testContent);

      // Verify DB record
      const dbStmt = db.prepare('SELECT * FROM files WHERE id = ?');
      const dbRecord = dbStmt.get(fileRecord.id);
      expect(dbRecord).toBeDefined();
      expect(dbRecord.owner_id).toBe(userId);
    });

    it('should handle binary file upload', async () => {
      const binaryData = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); // PNG header
      const fileName = 'test-binary.png';

      const response = await request(app)
        .post('/api/upload/single')
        .set('Cookie', sessionCookie)
        .attach('file', binaryData, {
          filename: fileName,
          contentType: 'image/png'
        })
        .expect(201);

      // Verify binary content is preserved
      const fileRecord = response.body.file;
      const diskContent = readFileSync(fileRecord.storage_path);
      expect(Buffer.compare(diskContent, binaryData)).toBe(0);
    });

    it('should reject file without authentication', async () => {
      const testContent = 'Unauthorized upload attempt';

      await request(app)
        .post('/api/upload/single')
        .attach('file', Buffer.from(testContent), 'test.txt')
        .expect(401);
    });

    it('should validate file size limits', async () => {
      const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB

      await request(app)
        .post('/api/upload/single')
        .set('Cookie', sessionCookie)
        .attach('file', Buffer.from(largeContent), 'large-file.txt')
        .expect(413); // Payload too large
    });
  });

  describe('Chunked Upload', () => {
    const testFileContent = 'This is a test file for chunked upload. '.repeat(1000);
    const fileName = 'chunked-test.txt';
    const fileSize = Buffer.byteLength(testFileContent);
    const chunkSize = Math.ceil(fileSize / 3); // 3 chunks

    it('should handle complete chunked upload flow', async () => {
      // Step 1: Initialize upload
      const initResponse = await request(app)
        .post('/api/upload/init')
        .set('Cookie', sessionCookie)
        .send({
          fileName,
          fileSize,
          mimeType: 'text/plain',
          chunkSize,
          totalChunks: 3
        })
        .expect(200);

      const { uploadId } = initResponse.body;
      expect(uploadId).toBeDefined();

      // Step 2: Upload chunks
      const chunks = [];
      for (let i = 0; i < 3; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);
        const chunkData = Buffer.from(testFileContent.slice(start, end));
        chunks.push(chunkData);

        const chunkResponse = await request(app)
          .post('/api/upload/chunk')
          .set('Cookie', sessionCookie)
          .set('Content-Type', 'application/octet-stream')
          .send(chunkData)
          .query({
            uploadId,
            chunkIndex: i,
            chunkSize: chunkData.length
          })
          .expect(200);

        expect(chunkResponse.body.received).toContain(i);
      }

      // Step 3: Complete upload
      const completeResponse = await request(app)
        .post('/api/upload/complete')
        .set('Cookie', sessionCookie)
        .send({
          uploadId,
          checksum: crypto.createHash('sha256').update(testFileContent).digest('hex')
        })
        .expect(201);

      expect(completeResponse.body).toHaveProperty('file');
      const fileRecord = completeResponse.body.file;

      // Verify file was assembled correctly
      expect(existsSync(fileRecord.storage_path)).toBe(true);
      const assembledContent = readFileSync(fileRecord.storage_path, 'utf8');
      expect(assembledContent).toBe(testFileContent);
      expect(assembledContent.length).toBe(fileSize);
    });

    it('should handle checksum mismatch and cleanup', async () => {
      // Initialize upload
      const initResponse = await request(app)
        .post('/api/upload/init')
        .set('Cookie', sessionCookie)
        .send({
          fileName: 'checksum-test.txt',
          fileSize: 100,
          mimeType: 'text/plain',
          chunkSize: 50,
          totalChunks: 2
        })
        .expect(200);

      const { uploadId } = initResponse.body;

      // Upload chunks
      await request(app)
        .post('/api/upload/chunk')
        .set('Cookie', sessionCookie)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from('x'.repeat(50)))
        .query({ uploadId, chunkIndex: 0, chunkSize: 50 })
        .expect(200);

      await request(app)
        .post('/api/upload/chunk')
        .set('Cookie', sessionCookie)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from('y'.repeat(50)))
        .query({ uploadId, chunkIndex: 1, chunkSize: 50 })
        .expect(200);

      // Complete with wrong checksum
      const wrongChecksum = 'wrong_checksum_value';
      
      const completeResponse = await request(app)
        .post('/api/upload/complete')
        .set('Cookie', sessionCookie)
        .send({
          uploadId,
          checksum: wrongChecksum
        })
        .expect(400);

      expect(completeResponse.body.error).toContain('checksum');

      // Verify cleanup occurred
      const session = UploadService.getUploadSession(uploadId);
      expect(session).toBeNull();
    });

    it('should handle duplicate chunks idempotently', async () => {
      // Initialize upload
      const initResponse = await request(app)
        .post('/api/upload/init')
        .set('Cookie', sessionCookie)
        .send({
          fileName: 'duplicate-chunk-test.txt',
          fileSize: 100,
          mimeType: 'text/plain',
          chunkSize: 100,
          totalChunks: 1
        })
        .expect(200);

      const { uploadId } = initResponse.body;
      const chunkData = Buffer.from('x'.repeat(100));

      // Upload same chunk twice
      const firstUpload = await request(app)
        .post('/api/upload/chunk')
        .set('Cookie', sessionCookie)
        .set('Content-Type', 'application/octet-stream')
        .send(chunkData)
        .query({ uploadId, chunkIndex: 0, chunkSize: 100 })
        .expect(200);

      const secondUpload = await request(app)
        .post('/api/upload/chunk')
        .set('Cookie', sessionCookie)
        .set('Content-Type', 'application/octet-stream')
        .send(chunkData)
        .query({ uploadId, chunkIndex: 0, chunkSize: 100 })
        .expect(200);

      // Both should succeed and return same result
      expect(firstUpload.body.received).toEqual(secondUpload.body.received);
      expect(firstUpload.body.received).toContain(0);
    });

    it('should cleanup on upload abort', async () => {
      // Initialize upload
      const initResponse = await request(app)
        .post('/api/upload/init')
        .set('Cookie', sessionCookie)
        .send({
          fileName: 'abort-test.txt',
          fileSize: 200,
          mimeType: 'text/plain',
          chunkSize: 100,
          totalChunks: 2
        })
        .expect(200);

      const { uploadId } = initResponse.body;

      // Upload one chunk
      await request(app)
        .post('/api/upload/chunk')
        .set('Cookie', sessionCookie)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from('x'.repeat(100)))
        .query({ uploadId, chunkIndex: 0, chunkSize: 100 })
        .expect(200);

      // Abort upload
      await request(app)
        .delete(`/api/upload/${uploadId}`)
        .set('Cookie', sessionCookie)
        .expect(200);

      // Verify cleanup
      const session = UploadService.getUploadSession(uploadId);
      expect(session).toBeNull();

      // Verify temp files are cleaned up
      const tempDir = UploadService.getTempDir(uploadId);
      expect(existsSync(tempDir)).toBe(false);
    });
  });

  describe('Upload Validation', () => {
    it('should reject uploads without required fields', async () => {
      await request(app)
        .post('/api/upload/init')
        .set('Cookie', sessionCookie)
        .send({
          // missing fileName
          fileSize: 1000,
          mimeType: 'text/plain'
        })
        .expect(400);
    });

    it('should reject invalid file sizes', async () => {
      await request(app)
        .post('/api/upload/init')
        .set('Cookie', sessionCookie)
        .send({
          fileName: 'test.txt',
          fileSize: -1, // Invalid size
          mimeType: 'text/plain'
        })
        .expect(400);
    });

    it('should reject files that are too large', async () => {
      const maxFileSize = 50 * 1024 * 1024 * 1024; // 50GB limit

      await request(app)
        .post('/api/upload/init')
        .set('Cookie', sessionCookie)
        .send({
          fileName: 'huge-file.bin',
          fileSize: maxFileSize + 1,
          mimeType: 'application/octet-stream'
        })
        .expect(413);
    });

    it('should sanitize file names', async () => {
      const maliciousFileName = '../../../etc/passwd';
      
      const response = await request(app)
        .post('/api/upload/single')
        .set('Cookie', sessionCookie)
        .attach('file', Buffer.from('test'), {
          filename: maliciousFileName,
          contentType: 'text/plain'
        })
        .expect(201);

      // File name should be sanitized
      expect(response.body.file.name).not.toContain('../');
      expect(response.body.file.name).not.toContain('/');
    });
  });

  describe('Concurrent Uploads', () => {
    it('should handle multiple concurrent uploads', async () => {
      const uploads = [];
      const numUploads = 3;

      // Start multiple uploads concurrently
      for (let i = 0; i < numUploads; i++) {
        const content = `Concurrent upload ${i}`;
        const upload = request(app)
          .post('/api/upload/single')
          .set('Cookie', sessionCookie)
          .attach('file', Buffer.from(content), `concurrent-${i}.txt`);
        
        uploads.push(upload);
      }

      // Wait for all uploads to complete
      const responses = await Promise.all(uploads);

      // Verify all uploads succeeded
      responses.forEach((response, index) => {
        expect(response.status).toBe(201);
        expect(response.body.file.name).toBe(`concurrent-${index}.txt`);
      });
    });

    it('should handle concurrent chunked uploads', async () => {
      const uploads = [];
      const numUploads = 2;

      for (let i = 0; i < numUploads; i++) {
        const content = `Chunked upload ${i} `.repeat(100);
        const fileName = `chunked-concurrent-${i}.txt`;
        
        // Initialize upload
        const initPromise = request(app)
          .post('/api/upload/init')
          .set('Cookie', sessionCookie)
          .send({
            fileName,
            fileSize: Buffer.byteLength(content),
            mimeType: 'text/plain',
            chunkSize: 100,
            totalChunks: Math.ceil(Buffer.byteLength(content) / 100)
          });

        uploads.push(initPromise);
      }

      const initResponses = await Promise.all(uploads);
      
      // Verify all initializations succeeded
      initResponses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.uploadId).toBeDefined();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle disk space errors gracefully', async () => {
      // This test would require mocking filesystem operations
      // For now, we'll test the error response format
      const testContent = 'Test content for disk space error';

      // Mock disk space check to fail
      const originalCheck = UploadService.checkDiskSpace;
      UploadService.checkDiskSpace = () => false;

      try {
        await request(app)
          .post('/api/upload/single')
          .set('Cookie', sessionCookie)
          .attach('file', Buffer.from(testContent), 'disk-space-test.txt')
          .expect(507); // Insufficient storage
      } finally {
        // Restore original function
        UploadService.checkDiskSpace = originalCheck;
      }
    });

    it('should handle corrupted chunk data', async () => {
      // Initialize upload
      const initResponse = await request(app)
        .post('/api/upload/init')
        .set('Cookie', sessionCookie)
        .send({
          fileName: 'corrupted-test.txt',
          fileSize: 100,
          mimeType: 'text/plain',
          chunkSize: 100,
          totalChunks: 1
        })
        .expect(200);

      const { uploadId } = initResponse.body;

      // Send chunk with wrong size
      await request(app)
        .post('/api/upload/chunk')
        .set('Cookie', sessionCookie)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from('x'.repeat(50))) // Wrong size
        .query({ uploadId, chunkIndex: 0, chunkSize: 100 }) // Claims 100 bytes
        .expect(400);
    });
  });
});