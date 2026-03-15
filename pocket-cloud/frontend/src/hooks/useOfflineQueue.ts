import { useState, useEffect, useCallback } from 'react';

interface QueuedUpload {
  id: string;
  file: File;
  path: string;
  timestamp: number;
  retryCount: number;
  status: 'queued' | 'uploading' | 'completed' | 'failed';
  error?: string;
}

interface OfflineQueueState {
  queuedUploads: QueuedUpload[];
  isOnline: boolean;
  isProcessing: boolean;
  totalQueued: number;
  totalFailed: number;
}

const MAX_RETRY_COUNT = 5;
const RETRY_DELAY = 2000; // 2 seconds

export function useOfflineQueue() {
  const [state, setState] = useState<OfflineQueueState>({
    queuedUploads: [],
    isOnline: navigator.onLine,
    isProcessing: false,
    totalQueued: 0,
    totalFailed: 0
  });

  // Initialize IndexedDB
  const initDB = useCallback((): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('pocketcloud-offline-queue', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('uploads')) {
          const store = db.createObjectStore('uploads', { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }, []);

  // Load queued uploads from IndexedDB
  const loadQueuedUploads = useCallback(async () => {
    try {
      const db = await initDB();
      const transaction = db.transaction(['uploads'], 'readonly');
      const store = transaction.objectStore('uploads');
      const request = store.getAll();
      
      request.onsuccess = () => {
        const uploads = request.result as QueuedUpload[];
        setState(prev => ({
          ...prev,
          queuedUploads: uploads,
          totalQueued: uploads.filter(u => u.status === 'queued').length,
          totalFailed: uploads.filter(u => u.status === 'failed').length
        }));
      };
    } catch (error) {
      console.error('Failed to load queued uploads:', error);
    }
  }, [initDB]);

  // Save upload to IndexedDB
  const saveUploadToDB = useCallback(async (upload: QueuedUpload) => {
    try {
      const db = await initDB();
      const transaction = db.transaction(['uploads'], 'readwrite');
      const store = transaction.objectStore('uploads');
      await store.put(upload);
    } catch (error) {
      console.error('Failed to save upload to DB:', error);
    }
  }, [initDB]);

  // Remove upload from IndexedDB
  const removeUploadFromDB = useCallback(async (id: string) => {
    try {
      const db = await initDB();
      const transaction = db.transaction(['uploads'], 'readwrite');
      const store = transaction.objectStore('uploads');
      await store.delete(id);
    } catch (error) {
      console.error('Failed to remove upload from DB:', error);
    }
  }, [initDB]);

  // Queue upload for offline processing
  const queueUpload = useCallback(async (file: File, path: string = '/') => {
    const upload: QueuedUpload = {
      id: `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      path,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'queued'
    };

    await saveUploadToDB(upload);
    
    setState(prev => ({
      ...prev,
      queuedUploads: [...prev.queuedUploads, upload],
      totalQueued: prev.totalQueued + 1
    }));

    // If online, try to process immediately
    if (state.isOnline) {
      processQueue();
    }

    return upload.id;
  }, [saveUploadToDB, state.isOnline]);

  // Process upload queue
  const processQueue = useCallback(async () => {
    if (state.isProcessing || !state.isOnline) return;

    setState(prev => ({ ...prev, isProcessing: true }));

    const queuedUploads = state.queuedUploads.filter(u => u.status === 'queued');
    
    for (const upload of queuedUploads) {
      try {
        // Update status to uploading
        const updatedUpload = { ...upload, status: 'uploading' as const };
        await saveUploadToDB(updatedUpload);
        
        setState(prev => ({
          ...prev,
          queuedUploads: prev.queuedUploads.map(u => 
            u.id === upload.id ? updatedUpload : u
          )
        }));

        // Attempt upload
        const formData = new FormData();
        formData.append('file', upload.file);
        formData.append('path', upload.path);

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });

        if (response.ok) {
          // Success - remove from queue
          await removeUploadFromDB(upload.id);
          
          setState(prev => ({
            ...prev,
            queuedUploads: prev.queuedUploads.filter(u => u.id !== upload.id),
            totalQueued: prev.totalQueued - 1
          }));

          // Show success notification
          if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.ready;
            registration.showNotification('Upload completed', {
              body: `${upload.file.name} uploaded successfully`,
              icon: '/icons/icon-192.png',
              tag: 'upload-success'
            });
          }
        } else {
          throw new Error(`Upload failed: ${response.statusText}`);
        }
      } catch (error) {
        console.error('Upload failed:', error);
        
        // Increment retry count
        const failedUpload = {
          ...upload,
          retryCount: upload.retryCount + 1,
          status: upload.retryCount + 1 >= MAX_RETRY_COUNT ? 'failed' as const : 'queued' as const,
          error: error instanceof Error ? error.message : 'Unknown error'
        };

        await saveUploadToDB(failedUpload);
        
        setState(prev => ({
          ...prev,
          queuedUploads: prev.queuedUploads.map(u => 
            u.id === upload.id ? failedUpload : u
          ),
          totalQueued: failedUpload.status === 'queued' ? prev.totalQueued : prev.totalQueued - 1,
          totalFailed: failedUpload.status === 'failed' ? prev.totalFailed + 1 : prev.totalFailed
        }));

        // Wait before next retry
        if (failedUpload.status === 'queued') {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
      }
    }

    setState(prev => ({ ...prev, isProcessing: false }));
  }, [state.isProcessing, state.isOnline, state.queuedUploads, saveUploadToDB, removeUploadFromDB]);

  // Retry failed upload
  const retryUpload = useCallback(async (id: string) => {
    const upload = state.queuedUploads.find(u => u.id === id);
    if (!upload || upload.status !== 'failed') return;

    const retriedUpload = {
      ...upload,
      status: 'queued' as const,
      retryCount: 0,
      error: undefined
    };

    await saveUploadToDB(retriedUpload);
    
    setState(prev => ({
      ...prev,
      queuedUploads: prev.queuedUploads.map(u => 
        u.id === id ? retriedUpload : u
      ),
      totalQueued: prev.totalQueued + 1,
      totalFailed: prev.totalFailed - 1
    }));

    if (state.isOnline) {
      processQueue();
    }
  }, [state.queuedUploads, state.isOnline, saveUploadToDB, processQueue]);

  // Remove upload from queue
  const removeUpload = useCallback(async (id: string) => {
    await removeUploadFromDB(id);
    
    setState(prev => {
      const upload = prev.queuedUploads.find(u => u.id === id);
      return {
        ...prev,
        queuedUploads: prev.queuedUploads.filter(u => u.id !== id),
        totalQueued: upload?.status === 'queued' ? prev.totalQueued - 1 : prev.totalQueued,
        totalFailed: upload?.status === 'failed' ? prev.totalFailed - 1 : prev.totalFailed
      };
    });
  }, [removeUploadFromDB]);

  // Clear all failed uploads
  const clearFailedUploads = useCallback(async () => {
    const failedUploads = state.queuedUploads.filter(u => u.status === 'failed');
    
    for (const upload of failedUploads) {
      await removeUploadFromDB(upload.id);
    }
    
    setState(prev => ({
      ...prev,
      queuedUploads: prev.queuedUploads.filter(u => u.status !== 'failed'),
      totalFailed: 0
    }));
  }, [state.queuedUploads, removeUploadFromDB]);

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setState(prev => ({ ...prev, isOnline: true }));
      processQueue();
    };

    const handleOffline = () => {
      setState(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [processQueue]);

  // Load queued uploads on mount
  useEffect(() => {
    loadQueuedUploads();
  }, [loadQueuedUploads]);

  // Auto-process queue when coming online
  useEffect(() => {
    if (state.isOnline && state.totalQueued > 0 && !state.isProcessing) {
      processQueue();
    }
  }, [state.isOnline, state.totalQueued, state.isProcessing, processQueue]);

  return {
    ...state,
    queueUpload,
    retryUpload,
    removeUpload,
    clearFailedUploads,
    processQueue
  };
}