import { useState, useEffect, useCallback } from 'react';

interface UploadProgress {
  uploadId: string;
  fileId?: string;
  percent: number;
  speed: number; // bytes per second
  eta: number; // seconds remaining
}

interface UploadProgressState {
  [uploadId: string]: UploadProgress;
}

export function useUploadProgress() {
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState>({});

  const handleUploadProgress = useCallback((event: CustomEvent) => {
    const progress: UploadProgress = event.detail;
    
    setUploadProgress(prev => ({
      ...prev,
      [progress.uploadId]: progress
    }));

    // Remove completed uploads after 3 seconds
    if (progress.percent >= 100) {
      setTimeout(() => {
        setUploadProgress(prev => {
          const { [progress.uploadId]: removed, ...rest } = prev;
          return rest;
        });
      }, 3000);
    }
  }, []);

  useEffect(() => {
    // Listen for upload progress events from WebSocket
    window.addEventListener('upload-progress', handleUploadProgress as EventListener);
    
    return () => {
      window.removeEventListener('upload-progress', handleUploadProgress as EventListener);
    };
  }, [handleUploadProgress]);

  const formatSpeed = useCallback((bytesPerSecond: number): string => {
    if (bytesPerSecond === 0) return '0 B/s';
    
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const unitIndex = Math.floor(Math.log(bytesPerSecond) / Math.log(1024));
    const value = bytesPerSecond / Math.pow(1024, unitIndex);
    
    return `${value.toFixed(1)} ${units[unitIndex]}`;
  }, []);

  const formatETA = useCallback((seconds: number): string => {
    if (seconds === 0 || !isFinite(seconds)) return '0s';
    
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
  }, []);

  const getUploadSummary = useCallback((uploadId: string): string | null => {
    const progress = uploadProgress[uploadId];
    if (!progress) return null;

    if (progress.percent >= 100) {
      return 'Upload complete';
    }

    const speed = formatSpeed(progress.speed);
    const eta = formatETA(progress.eta);
    
    return `${speed} · ${eta} remaining`;
  }, [uploadProgress, formatSpeed, formatETA]);

  const removeUpload = useCallback((uploadId: string) => {
    setUploadProgress(prev => {
      const { [uploadId]: removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const clearAllUploads = useCallback(() => {
    setUploadProgress({});
  }, []);

  return {
    uploadProgress,
    getUploadSummary,
    formatSpeed,
    formatETA,
    removeUpload,
    clearAllUploads,
    hasActiveUploads: Object.keys(uploadProgress).length > 0
  };
}