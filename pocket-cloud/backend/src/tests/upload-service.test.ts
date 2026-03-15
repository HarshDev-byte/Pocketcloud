/**
 * Upload Service Tests
 * Tests file upload functionality including chunked uploads and validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UploadService } from '../services/upload.service';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import crypto from 'crypto';

describe('UploadService', () => {
  let uploadService: UploadService;
  let tempDir: string;

  beforeEach(async () => {
    uploadService = new UploadService();
    tempDir = join(tmpdir(), `pocketcloud-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('initiates upload and returns uploadId + chunkSize', async () => {
    const result = await uploadService.initiateUpload({
      filename: 'test.txt',
      size: 1024,
      mimeType: 'text/plain',
      checksum: 'abc123'
    });

    expect(result).toHaveProperty('uploadId');
    expect(result).toHaveProperty('chunkSize');
    expect(typeof result.uploadId).toBe('string');
    expect(typeof result.chunkSize).toBe('number');
    expect(result.chunkSize).toBeGreaterThan(0);
    expect(result.uploadId).toMatch(/^[a-f0-9-]{36}$/); // UUID format
  });

  it('saves chunks idempotently (duplicate chunk = no error)', async () => {
    const result = await uploadService.initiateUpload({
      filename: 'test.txt',
      size: 300,
      mimeType: 'text/plain',
      checksum: 'test-checksum'
    });

    const chunkData = Buffer.from('A'.repeat(100));

    // Upload chunk 0 twice - should not throw error
    await uploadService.uploadChunk(result.uploadId, 0, chunkData);
    await uploadService.uploadChunk(result.uploadId, 0, chunkData);

    // Verify chunk was saved correctly
    const chunkPath = uploadService.getChunkPath(result.uploadId, 0);
    const savedChunk = await fs.readFile(chunkPath);
    expect(savedChunk.equals(chunkData)).toBe(true);
  });

  it('assembles file correctly from 3 chunks', async () => {
    const result = await uploadService.initiateUpload({
      filename: 'test.txt',
      size: 300,
      mimeType: 'text/plain',
      checksum: 'test-checksum'
    });

    const chunk0 = Buffer.from('A'.repeat(100));
    const chunk1 = Buffer.from('B'.repeat(100));
    const chunk2 = Buffer.from('C'.repeat(100));

    // Upload chunks in random order to test assembly
    await uploadService.uploadChunk(result.uploadId, 1, chunk1);
    await uploadService.uploadChunk(result.uploadId, 0, chunk0);
    await uploadService.uploadChunk(result.uploadId, 2, chunk2);

    // Calculate correct checksum
    const expectedContent = Buffer.concat([chunk0, chunk1, chunk2]);
    const correctChecksum = crypto.createHash('sha256').update(expectedContent).digest('hex');
    
    await uploadService.updateUploadChecksum(result.uploadId, correctChecksum);
    const finalResult = await uploadService.finalizeUpload(result.uploadId);
    
    expect(finalResult.success).toBe(true);
    expect(finalResult.filePath).toBeDefined();

    // Verify assembled file content
    const assembledContent = await fs.readFile(finalResult.filePath!);
    expect(assembledContent.equals(expectedContent)).toBe(true);
  });

  it('validates checksum and rejects mismatched file', async () => {
    const result = await uploadService.initiateUpload({
      filename: 'test.txt',
      size: 300,
      mimeType: 'text/plain',
      checksum: 'wrong-checksum-will-fail'
    });

    const chunk0 = Buffer.from('A'.repeat(100));
    const chunk1 = Buffer.from('B'.repeat(100));
    const chunk2 = Buffer.from('C'.repeat(100));

    await uploadService.uploadChunk(result.uploadId, 0, chunk0);
    await uploadService.uploadChunk(result.uploadId, 1, chunk1);
    await uploadService.uploadChunk(result.uploadId, 2, chunk2);

    const finalResult = await uploadService.finalizeUpload(result.uploadId);
    
    expect(finalResult.success).toBe(false);
    expect(finalResult.error).toContain('checksum');
    expect(finalResult.error).toContain('mismatch');
  });

  it('cleans up temp dir on abort', async () => {
    const result = await uploadService.initiateUpload({
      filename: 'test.txt',
      size: 100,
      mimeType: 'text/plain',
      checksum: 'test-checksum'
    });

    // Upload a chunk to create temp files
    const chunkData = Buffer.from('A'.repeat(100));
    await uploadService.uploadChunk(result.uploadId, 0, chunkData);

    // Verify temp files exist
    const tempPath = uploadService.getTempPath(result.uploadId);
    const exists = await fs.access(tempPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    // Abort upload
    await uploadService.abortUpload(result.uploadId);

    // Verify temp files are cleaned up
    const existsAfter = await fs.access(tempPath).then(() => true).catch(() => false);
    expect(existsAfter).toBe(false);
  });

  it('cleans up temp dir on checksum failure', async () => {
    const result = await uploadService.initiateUpload({
      filename: 'test.txt',
      size: 100,
      mimeType: 'text/plain',
      checksum: 'wrong-checksum'
    });

    const chunkData = Buffer.from('A'.repeat(100));
    await uploadService.uploadChunk(result.uploadId, 0, chunkData);

    const tempPath = uploadService.getTempPath(result.uploadId);
    const existsBefore = await fs.access(tempPath).then(() => true).catch(() => false);
    expect(existsBefore).toBe(true);

    // Finalize should fail and clean up
    const finalResult = await uploadService.finalizeUpload(result.uploadId);
    expect(finalResult.success).toBe(false);

    const existsAfter = await fs.access(tempPath).then(() => true).catch(() => false);
    expect(existsAfter).toBe(false);
  });

  it('rejects upload if disk has insufficient space', async () => {
    // Mock the disk space check to return false
    const originalCheckDiskSpace = uploadService.checkDiskSpace;
    uploadService.checkDiskSpace = vi.fn().mockResolvedValue(false);

    await expect(
      uploadService.initiateUpload({
        filename: 'large-file.bin',
        size: 1024 * 1024 * 1024 * 10, // 10GB
        mimeType: 'application/octet-stream',
        checksum: 'abc123'
      })
    ).rejects.toThrow('Insufficient disk space');

    // Restore original method
    uploadService.checkDiskSpace = originalCheckDiskSpace;
  });
});