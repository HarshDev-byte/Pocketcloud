import { useState, useCallback, useRef } from 'react';
import { apiClient } from '../api/client';
import { UploadFile } from '../types/files';

interface UseFileUploadOptions {
  folderId?: string;
  onComplete?: (file: any) => void;
  onError?: (error: string) => void;
}

interface UploadState {
  files: UploadFile[];
  isUploading: boolean;
}

interface UploadHandle {
  progress: number;
  speed: number;
  eta: number;
  pause: () => void;
  resume: () => void;
  abort: () => void;
}

export const useFileUpload = (options: UseFileUploadOptions = {}) => {
  const [state, setState] = useState<UploadState>({
    files: [],
    isUploading: false,
  });

  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const speedCalculatorRef = useRef<Map<string, { bytes: number; timestamp: number }[]>>(new Map());

  // Calculate upload speed using sliding window
  const calculateSpeed = useCallback((fileId: string, bytesUploaded: number): number => {
    const now = Date.now();
    const history = speedCalculatorRef.current.get(fileId) || [];
    
    // Add current data point
    history.push({ bytes: bytesUploaded, timestamp: now });
    
    // Keep only last 5 seconds of data for sliding window
    const filtered = history.filter(point => now - point.timestamp <= 5000);
    speedCalculatorRef.current.set(fileId, filtered);
    
    if (filtered.length < 2) return 0;
    
    // Calculate average speed over the window
    const timeSpan = filtered[filtered.length - 1].timestamp - filtered[0].timestamp;
    const bytesSpan = filtered[filtered.length - 1].bytes - filtered[0].bytes;
    
    return timeSpan > 0 ? (bytesSpan / timeSpan) * 1000 : 0; // bytes per second
  }, []);

  // Calculate ETA based on remaining bytes and current speed
  const calculateETA = useCallback((fileSize: number, uploadedBytes: number, speed: number): number => {
    if (speed === 0) return Infinity;
    const remainingBytes = fileSize - uploadedBytes;
    return remainingBytes / speed;
  }, []);

  const updateFileState = useCallback((fileId: string, updates: Partial<UploadFile>) => {
    setState(prev => ({
      ...prev,
      files: prev.files.map(file => 
        file.id === fileId ? { ...file, ...updates } : file
      ),
    }));
  }, []);

  // Initialize upload session
  const initializeUpload = useCallback(async (file: UploadFile): Promise<void> => {
    try {
      updateFileState(file.id, { status: 'initializing' });

      // Calculate SHA-256 checksum
      const checksum = await calculateChecksum(file.file);

      // POST /api/upload/init
      const response = await apiClient.post('/upload/init', {
        filename: file.file.name,
        size: file.file.size,
        mimeType: file.file.type,
        folderId: options.folderId,
        checksum,
      });

      const { uploadId, chunkSize } = response.data;
      const totalChunks = Math.ceil(file.file.size / chunkSize);

      updateFileState(file.id, {
        status: 'uploading',
        uploadId,
        totalChunks,
        uploadedChunks: [],
      });

      await uploadChunks(file.id, file.file, uploadId, chunkSize, totalChunks);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to initialize upload';
      updateFileState(file.id, { status: 'error', error: errorMessage });
      options.onError?.(errorMessage);
    }
  }, [options.folderId, options.onError, updateFileState]);

  // Upload chunks with concurrency limit (3 parallel)
  const uploadChunks = useCallback(async (
    fileId: string,
    file: File,
    uploadId: string,
    chunkSize: number,
    totalChunks: number
  ): Promise<void> => {
    const abortController = new AbortController();
    abortControllersRef.current.set(fileId, abortController);

    try {
      const uploadedChunks: number[] = [];
      let uploadedBytes = 0;

      // Upload 3 chunks in parallel with Promise.all
      const concurrency = 3;
      const chunks = Array.from({ length: totalChunks }, (_, i) => i);
      
      for (let i = 0; i < chunks.length; i += concurrency) {
        const batch = chunks.slice(i, i + concurrency);
        
        await Promise.all(
          batch.map(async (chunkIndex) => {
            if (abortController.signal.aborted) return;

            const start = chunkIndex * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            const chunk = file.slice(start, end);

            // Retry logic: up to 3 times with 1s, 2s, 4s backoff
            let retries = 0;
            const maxRetries = 3;

            while (retries < maxRetries) {
              try {
                // PUT /api/upload/{id}/chunk/{index}
                await apiClient.put(`/upload/${uploadId}/chunk/${chunkIndex}`, chunk, {
                  headers: { 'Content-Type': 'application/octet-stream' },
                  signal: abortController.signal,
                });

                uploadedChunks.push(chunkIndex);
                uploadedBytes += chunk.size;

                const speed = calculateSpeed(fileId, uploadedBytes);
                const progress = (uploadedBytes / file.size) * 100;
                const eta = calculateETA(file.size, uploadedBytes, speed);

                updateFileState(fileId, {
                  progress,
                  speed,
                  eta,
                  uploadedChunks: [...uploadedChunks],
                });

                break;
              } catch (error: any) {
                retries++;
                if (retries >= maxRetries || abortController.signal.aborted) {
                  throw error;
                }
                // Exponential backoff: 1s, 2s, 4s
                const delay = Math.pow(2, retries - 1) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
              }
            }
          })
        );
      }

      if (!abortController.signal.aborted) {
        await completeUpload(fileId, uploadId);
      }
    } catch (error: any) {
      if (!abortController.signal.aborted) {
        const errorMessage = error.response?.data?.error || 'Upload failed';
        updateFileState(fileId, { status: 'error', error: errorMessage });
        options.onError?.(errorMessage);
      }
    } finally {
      abortControllersRef.current.delete(fileId);
      speedCalculatorRef.current.delete(fileId);
    }
  }, [calculateSpeed, calculateETA, updateFileState, options.onError]);

  // Complete upload
  const completeUpload = useCallback(async (fileId: string, uploadId: string): Promise<void> => {
    try {
      updateFileState(fileId, { status: 'completing' });

      // POST /api/upload/{id}/complete
      const response = await apiClient.post(`/upload/${uploadId}/complete`);

      if (response.data.success) {
        updateFileState(fileId, { status: 'completed', progress: 100 });
        options.onComplete?.(response.data.data);
      } else {
        throw new Error(response.data.error || 'Failed to complete upload');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to complete upload';
      updateFileState(fileId, { status: 'error', error: errorMessage });
      options.onError?.(errorMessage);
    }
  }, [updateFileState, options.onComplete, options.onError]);

  // Public API methods
  const addFiles = useCallback((files: File[]) => {
    const uploadFiles: UploadFile[] = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      status: 'pending',
      progress: 0,
      speed: 0,
      eta: 0,
    }));

    setState(prev => ({
      ...prev,
      files: [...prev.files, ...uploadFiles],
      isUploading: true,
    }));

    // Start uploads
    uploadFiles.forEach(uploadFile => {
      initializeUpload(uploadFile);
    });
  }, [initializeUpload]);

  const uploadFile = useCallback((file: File, folderId?: string): UploadHandle => {
    const uploadFile: UploadFile = {
      id: crypto.randomUUID(),
      file,
      status: 'pending',
      progress: 0,
      speed: 0,
      eta: 0,
    };

    setState(prev => ({
      ...prev,
      files: [...prev.files, uploadFile],
      isUploading: true,
    }));

    // Start upload
    const uploadOptions = { ...options, folderId };
    initializeUpload(uploadFile);

    // Return handle
    return {
      get progress() {
        const currentFile = state.files.find(f => f.id === uploadFile.id);
        return currentFile?.progress || 0;
      },
      get speed() {
        const currentFile = state.files.find(f => f.id === uploadFile.id);
        return currentFile?.speed || 0;
      },
      get eta() {
        const currentFile = state.files.find(f => f.id === uploadFile.id);
        return currentFile?.eta || 0;
      },
      pause: () => pauseFile(uploadFile.id),
      resume: () => resumeFile(uploadFile.id),
      abort: () => removeFile(uploadFile.id),
    };
  }, [state.files, options, initializeUpload]);

  const removeFile = useCallback((fileId: string) => {
    // Abort upload if in progress
    const abortController = abortControllersRef.current.get(fileId);
    if (abortController) {
      abortController.abort();
    }

    setState(prev => ({
      ...prev,
      files: prev.files.filter(file => file.id !== fileId),
      isUploading: prev.files.filter(file => file.id !== fileId).some(file => 
        ['pending', 'initializing', 'uploading', 'completing'].includes(file.status)
      ),
    }));
  }, []);

  const retryFile = useCallback((fileId: string) => {
    const file = state.files.find(f => f.id === fileId);
    if (file && file.status === 'error') {
      updateFileState(fileId, { 
        status: 'pending', 
        progress: 0, 
        speed: 0, 
        eta: 0, 
        error: undefined,
        uploadedChunks: [],
      });
      initializeUpload(file);
    }
  }, [state.files, updateFileState, initializeUpload]);

  const pauseFile = useCallback((fileId: string) => {
    const abortController = abortControllersRef.current.get(fileId);
    if (abortController) {
      abortController.abort();
    }
    updateFileState(fileId, { status: 'paused' });
  }, [updateFileState]);

  const resumeFile = useCallback((fileId: string) => {
    const file = state.files.find(f => f.id === fileId);
    if (file && file.status === 'paused') {
      initializeUpload(file);
    }
  }, [state.files, initializeUpload]);

  const clearCompleted = useCallback(() => {
    setState(prev => ({
      ...prev,
      files: prev.files.filter(file => file.status !== 'completed'),
    }));
  }, []);

  return {
    files: state.files,
    isUploading: state.isUploading,
    uploadFile,
    addFiles,
    removeFile,
    retryFile,
    pauseFile,
    resumeFile,
    clearCompleted,
  };
};

// Helper function to calculate file checksum
async function calculateChecksum(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}