import { useState, useCallback, useRef } from 'react';
import { uploadApi } from '../api/upload.api';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '../components/ui';

export interface UploadItem {
  id: string; // local UUID
  uploadId: string | null; // server upload session ID
  file: File;
  fileName: string;
  folderId: string | null;
  status: 'queued' | 'hashing' | 'uploading' | 'completing' | 'done' | 'failed' | 'paused';
  progress: number; // 0-100
  speed: number; // bytes/sec
  eta: number; // seconds remaining
  error: string | null;
  bytesUploaded: number;
  startedAt: number | null;
  checksum: string | null;
}

const MAX_CONCURRENT_UPLOADS = 2;
const MAX_CONCURRENT_CHUNKS = 3;
const MAX_RETRIES = 3;

export function useUpload() {
  const [uploads, setUploads] = useState<Map<string, UploadItem>>(new Map());
  const queryClient = useQueryClient();
  const activeUploadsRef = useRef<Set<string>>(new Set());

  // Generate UUID
  const generateId = () => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  // Compute SHA-256 hash
  const computeHash = async (file: File, onProgress?: (progress: number) => void): Promise<string> => {
    // For small files, hash all at once
    if (file.size < 50 * 1024 * 1024) {
      const buffer = await file.arrayBuffer();
      const hash = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hash));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // For large files, hash in chunks
    const chunkSize = 10 * 1024 * 1024; // 10MB chunks for hashing
    let offset = 0;
    const reader = new FileReader();
    
    return new Promise((resolve, reject) => {
      const hashChunks: Uint8Array[] = [];
      
      const readNextChunk = () => {
        if (offset >= file.size) {
          // Combine all chunks and hash
          const totalLength = hashChunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const combined = new Uint8Array(totalLength);
          let position = 0;
          for (const chunk of hashChunks) {
            combined.set(chunk, position);
            position += chunk.length;
          }
          
          crypto.subtle.digest('SHA-256', combined).then(hash => {
            const hashArray = Array.from(new Uint8Array(hash));
            resolve(hashArray.map(b => b.toString(16).padStart(2, '0')).join(''));
          });
          return;
        }

        const slice = file.slice(offset, offset + chunkSize);
        reader.readAsArrayBuffer(slice);
      };

      reader.onload = (e) => {
        if (e.target?.result) {
          hashChunks.push(new Uint8Array(e.target.result as ArrayBuffer));
          offset += chunkSize;
          onProgress?.(Math.min(100, (offset / file.size) * 100));
          readNextChunk();
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      readNextChunk();
    });
  };

  // Update upload item
  const updateUpload = useCallback((id: string, updates: Partial<UploadItem>) => {
    setUploads(prev => {
      const next = new Map(prev);
      const item = next.get(id);
      if (item) {
        next.set(id, { ...item, ...updates });
      }
      return next;
    });
  }, []);

  // Calculate speed and ETA
  const calculateSpeedAndEta = (
    bytesUploaded: number,
    totalBytes: number,
    startedAt: number
  ): { speed: number; eta: number } => {
    const elapsed = (Date.now() - startedAt) / 1000; // seconds
    const speed = elapsed > 0 ? bytesUploaded / elapsed : 0;
    const remaining = totalBytes - bytesUploaded;
    const eta = speed > 0 ? remaining / speed : 0;
    return { speed, eta };
  };

  // Upload single file
  const uploadFile = async (item: UploadItem) => {
    const { id, file, folderId } = item;

    try {
      // 1. Hash file
      updateUpload(id, { status: 'hashing', progress: 0 });
      
      const checksum = await computeHash(file, (progress) => {
        updateUpload(id, { progress: progress * 0.1 }); // Hashing is 10% of total
      });

      updateUpload(id, { checksum, progress: 10 });

      // 2. Initialize upload
      const initResponse = await uploadApi.initUpload({
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        checksum,
        folderId,
      });

      // Check if file already exists (deduplication)
      if (initResponse.existingFile) {
        updateUpload(id, {
          status: 'done',
          progress: 100,
          bytesUploaded: file.size,
        });
        toast.success(`${file.name} already exists (deduplicated)`);
        queryClient.invalidateQueries({ queryKey: ['folder'] });
        return;
      }

      updateUpload(id, {
        uploadId: initResponse.uploadId,
        status: 'uploading',
        startedAt: Date.now(),
      });

      // 3. Upload chunks
      const totalChunks = initResponse.totalChunks;
      const chunkSize = initResponse.chunkSize;
      let uploadedChunks = 0;

      // Upload chunks with concurrency limit
      const uploadChunk = async (chunkIndex: number, retries = 0): Promise<void> => {
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        try {
          await uploadApi.uploadChunk(initResponse.uploadId, chunkIndex, chunk);
          uploadedChunks++;

          const bytesUploaded = Math.min(uploadedChunks * chunkSize, file.size);
          const { speed, eta } = calculateSpeedAndEta(
            bytesUploaded,
            file.size,
            item.startedAt!
          );

          updateUpload(id, {
            bytesUploaded,
            progress: 10 + (bytesUploaded / file.size) * 85, // 10-95%
            speed,
            eta,
          });
        } catch (error) {
          if (retries < MAX_RETRIES) {
            // Retry
            await new Promise(resolve => setTimeout(resolve, 1000 * (retries + 1)));
            return uploadChunk(chunkIndex, retries + 1);
          }
          throw error;
        }
      };

      // Upload chunks in parallel (3 at a time)
      const chunkPromises: Promise<void>[] = [];
      for (let i = 0; i < totalChunks; i++) {
        chunkPromises.push(uploadChunk(i));
        
        // Limit concurrency
        if (chunkPromises.length >= MAX_CONCURRENT_CHUNKS) {
          await Promise.race(chunkPromises);
          chunkPromises.splice(
            chunkPromises.findIndex(p => p === undefined),
            1
          );
        }
      }

      await Promise.all(chunkPromises);

      // 4. Complete upload
      updateUpload(id, { status: 'completing', progress: 95 });
      
      await uploadApi.completeUpload(initResponse.uploadId);

      updateUpload(id, {
        status: 'done',
        progress: 100,
        bytesUploaded: file.size,
      });

      toast.success(`${file.name} uploaded successfully`);
      
      // Invalidate folder query to show new file
      queryClient.invalidateQueries({ queryKey: ['folder', folderId] });

    } catch (error: any) {
      console.error('Upload failed:', error);
      
      let errorMessage = 'Upload failed';
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error.message || errorMessage;
      }

      updateUpload(id, {
        status: 'failed',
        error: errorMessage,
      });

      toast.error(`${file.name}: ${errorMessage}`);
    } finally {
      activeUploadsRef.current.delete(id);
      processQueue();
    }
  };

  // Process upload queue
  const processQueue = useCallback(() => {
    const uploadsArray = Array.from(uploads.values());
    const queued = uploadsArray.filter(u => u.status === 'queued');
    const active = activeUploadsRef.current.size;

    if (active >= MAX_CONCURRENT_UPLOADS || queued.length === 0) {
      return;
    }

    const toStart = queued.slice(0, MAX_CONCURRENT_UPLOADS - active);
    toStart.forEach(item => {
      activeUploadsRef.current.add(item.id);
      uploadFile(item);
    });
  }, [uploads]);

  // Add files to upload queue
  const addFiles = useCallback((files: File[], folderId: string | null = null) => {
    const newUploads = new Map(uploads);

    files.forEach(file => {
      const id = generateId();
      const item: UploadItem = {
        id,
        uploadId: null,
        file,
        fileName: file.name,
        folderId,
        status: 'queued',
        progress: 0,
        speed: 0,
        eta: 0,
        error: null,
        bytesUploaded: 0,
        startedAt: null,
        checksum: null,
      };
      newUploads.set(id, item);
    });

    setUploads(newUploads);

    // Start processing
    setTimeout(processQueue, 0);
  }, [uploads, processQueue]);

  // Retry failed upload
  const retryUpload = useCallback((id: string) => {
    updateUpload(id, {
      status: 'queued',
      progress: 0,
      error: null,
      bytesUploaded: 0,
      startedAt: null,
    });
    processQueue();
  }, [processQueue, updateUpload]);

  // Cancel upload
  const cancelUpload = useCallback(async (id: string) => {
    const item = uploads.get(id);
    if (!item) return;

    if (item.uploadId) {
      try {
        await uploadApi.abortUpload(item.uploadId);
      } catch (error) {
        console.error('Failed to abort upload:', error);
      }
    }

    activeUploadsRef.current.delete(id);
    
    setUploads(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });

    processQueue();
  }, [uploads, processQueue]);

  // Clear completed uploads
  const clearCompleted = useCallback(() => {
    setUploads(prev => {
      const next = new Map(prev);
      Array.from(next.values())
        .filter(u => u.status === 'done')
        .forEach(u => next.delete(u.id));
      return next;
    });
  }, []);

  return {
    uploads: Array.from(uploads.values()),
    addFiles,
    retryUpload,
    cancelUpload,
    clearCompleted,
  };
}
