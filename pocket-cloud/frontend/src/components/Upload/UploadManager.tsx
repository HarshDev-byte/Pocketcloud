import React, { useState, useEffect } from 'react';
import { 
  X, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  Pause, 
  Play, 
  RotateCcw,
  Minimize2,
  Maximize2,
  Trash2,
  Clock
} from 'lucide-react';
import { UploadFile } from '../../types/files';

interface UploadManagerProps {
  files: UploadFile[];
  onRemoveFile: (fileId: string) => void;
  onRetryFile: (fileId: string) => void;
  onPauseFile: (fileId: string) => void;
  onResumeFile: (fileId: string) => void;
  onClearCompleted: () => void;
}

const UploadManager: React.FC<UploadManagerProps> = ({
  files,
  onRemoveFile,
  onRetryFile,
  onPauseFile,
  onResumeFile,
  onClearCompleted,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [autoHideTimer, setAutoHideTimer] = useState<NodeJS.Timeout | null>(null);

  // Show/hide panel based on upload activity
  useEffect(() => {
    const hasActiveUploads = files.some(file => 
      ['pending', 'initializing', 'uploading', 'completing'].includes(file.status)
    );
    const hasRecentlyCompleted = files.some(file => file.status === 'completed');

    if (hasActiveUploads || hasRecentlyCompleted) {
      setIsVisible(true);
      
      // Clear any existing timer
      if (autoHideTimer) {
        clearTimeout(autoHideTimer);
        setAutoHideTimer(null);
      }

      // If no active uploads but has completed files, set auto-hide timer
      if (!hasActiveUploads && hasRecentlyCompleted) {
        const timer = setTimeout(() => {
          setIsVisible(false);
          setIsMinimized(false);
        }, 3000); // Hide after 3 seconds
        setAutoHideTimer(timer);
      }
    } else if (files.length === 0) {
      setIsVisible(false);
      setIsMinimized(false);
    }

    return () => {
      if (autoHideTimer) {
        clearTimeout(autoHideTimer);
      }
    };
  }, [files, autoHideTimer]);

  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatETA = (seconds: number): string => {
    if (!isFinite(seconds) || seconds === 0) return '—';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getStatusIcon = (file: UploadFile) => {
    switch (file.status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'paused':
        return <Pause className="w-4 h-4 text-yellow-500" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-gray-400" />;
      default:
        return <Upload className="w-4 h-4 text-pcd-blue-500" />;
    }
  };

  const getStatusText = (file: UploadFile): string => {
    switch (file.status) {
      case 'pending':
        return 'Queued';
      case 'initializing':
        return 'Initializing...';
      case 'uploading':
        return `${Math.round(file.progress)}% • ${formatSpeed(file.speed)} • ${formatETA(file.eta)}`;
      case 'completing':
        return 'Finalizing...';
      case 'completed':
        return 'Upload complete';
      case 'paused':
        return 'Paused';
      case 'error':
        return file.error || 'Upload failed';
      default:
        return '';
    }
  };

  if (!isVisible) return null;

  const activeFiles = files.filter(file => 
    ['pending', 'initializing', 'uploading', 'completing'].includes(file.status)
  );
  const completedFiles = files.filter(file => file.status === 'completed');
  const errorFiles = files.filter(file => file.status === 'error');

  return (
    <div className="fixed bottom-4 right-4 z-40 w-96 max-w-[calc(100vw-2rem)]">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <Upload className="w-4 h-4 text-pcd-blue-500" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              Uploads ({files.length})
            </span>
          </div>
          <div className="flex items-center space-x-1">
            {completedFiles.length > 0 && (
              <button
                onClick={onClearCompleted}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                title="Clear completed"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
              title={isMinimized ? 'Expand' : 'Minimize'}
            >
              {isMinimized ? (
                <Maximize2 className="w-4 h-4" />
              ) : (
                <Minimize2 className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={() => setIsVisible(false)}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        {!isMinimized && (
          <div className="max-h-80 overflow-y-auto">
            {files.map((file) => (
              <div
                key={file.id}
                className="p-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      {getStatusIcon(file)}
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {file.file.name}
                      </span>
                    </div>
                    
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      {formatFileSize(file.file.size)}
                    </div>

                    {/* Progress bar */}
                    {['pending', 'initializing', 'uploading', 'completing'].includes(file.status) && (
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-2">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            file.status === 'pending' ? 'bg-gray-400' : 'bg-pcd-blue-500'
                          }`}
                          style={{ width: `${file.progress}%` }}
                        />
                      </div>
                    )}

                    {/* Status text */}
                    <div className={`text-xs ${
                      file.status === 'error' ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {getStatusText(file)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-1 ml-2">
                    {file.status === 'uploading' && (
                      <button
                        onClick={() => onPauseFile(file.id)}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                        title="Pause"
                      >
                        <Pause className="w-3 h-3" />
                      </button>
                    )}
                    
                    {file.status === 'paused' && (
                      <button
                        onClick={() => onResumeFile(file.id)}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                        title="Resume"
                      >
                        <Play className="w-3 h-3" />
                      </button>
                    )}
                    
                    {file.status === 'error' && (
                      <button
                        onClick={() => onRetryFile(file.id)}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                        title="Retry"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                    
                    <button
                      onClick={() => onRemoveFile(file.id)}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                      title="Remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary when minimized */}
        {isMinimized && (
          <div className="p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {activeFiles.length > 0 && `${activeFiles.length} uploading`}
              {activeFiles.length > 0 && completedFiles.length > 0 && ' • '}
              {completedFiles.length > 0 && `${completedFiles.length} completed`}
              {errorFiles.length > 0 && ` • ${errorFiles.length} failed`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadManager;