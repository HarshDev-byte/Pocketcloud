import { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  X,
  CheckCircle,
  Upload,
  Clock,
  XCircle,
} from 'lucide-react';
import type { UploadItem } from '../../hooks/useUpload';
import { Progress } from '../ui';

interface UploadPanelProps {
  uploads: UploadItem[];
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onClearCompleted: () => void;
}

export function UploadPanel({
  uploads,
  onRetry,
  onCancel,
  onClearCompleted,
}: UploadPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isVisible, setIsVisible] = useState(false);

  const activeUploads = uploads.filter(u => 
    ['queued', 'hashing', 'uploading', 'completing'].includes(u.status)
  );
  const completedUploads = uploads.filter(u => u.status === 'done');
  const failedUploads = uploads.filter(u => u.status === 'failed');

  const totalUploads = uploads.length;
  const hasActiveUploads = activeUploads.length > 0;

  // Show panel when there are uploads
  useEffect(() => {
    if (totalUploads > 0) {
      setIsVisible(true);
    }
  }, [totalUploads]);

  // Auto-dismiss when all complete
  useEffect(() => {
    if (
      totalUploads > 0 &&
      activeUploads.length === 0 &&
      failedUploads.length === 0 &&
      completedUploads.length > 0
    ) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClearCompleted, 300);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [totalUploads, activeUploads.length, failedUploads.length, completedUploads.length, onClearCompleted]);

  if (!isVisible || totalUploads === 0) return null;

  const formatSpeed = (bytesPerSec: number): string => {
    if (bytesPerSec === 0) return '0 B/s';
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(1024));
    return `${(bytesPerSec / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  };

  const formatEta = (seconds: number): string => {
    if (seconds === 0 || !isFinite(seconds)) return '';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${secs}s`;
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 w-96 max-w-[calc(100vw-2rem)] animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white dark:bg-surface-800 rounded-lg shadow-2xl border border-surface-200 dark:border-surface-700 overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 bg-surface-50 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-700 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-brand-500" />
            <span className="font-medium text-surface-900 dark:text-surface-100">
              {hasActiveUploads
                ? `Uploading ${activeUploads.length} file${activeUploads.length > 1 ? 's' : ''}...`
                : `${completedUploads.length} file${completedUploads.length > 1 ? 's' : ''} uploaded`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="p-1 hover:bg-surface-200 dark:hover:bg-surface-700 rounded transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsVisible(false);
                setTimeout(onClearCompleted, 300);
              }}
              className="p-1 hover:bg-surface-200 dark:hover:bg-surface-700 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Upload list */}
        {isExpanded && (
          <div className="max-h-96 overflow-y-auto">
            {uploads.map((upload) => (
              <UploadItem
                key={upload.id}
                upload={upload}
                onRetry={onRetry}
                onCancel={onCancel}
                formatSpeed={formatSpeed}
                formatEta={formatEta}
                formatSize={formatSize}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface UploadItemProps {
  upload: UploadItem;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  formatSpeed: (bytesPerSec: number) => string;
  formatEta: (seconds: number) => string;
  formatSize: (bytes: number) => string;
}

function UploadItem({
  upload,
  onRetry,
  onCancel,
  formatSpeed,
  formatEta,
  formatSize,
}: UploadItemProps) {
  const getStatusIcon = () => {
    switch (upload.status) {
      case 'done':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'queued':
        return <Clock className="w-4 h-4 text-surface-400" />;
      default:
        return <Upload className="w-4 h-4 text-brand-500 animate-pulse" />;
    }
  };

  const getStatusText = () => {
    switch (upload.status) {
      case 'hashing':
        return 'Preparing...';
      case 'queued':
        return 'Queued';
      case 'uploading':
        return `${formatSpeed(upload.speed)} · ${formatEta(upload.eta)} remaining`;
      case 'completing':
        return 'Finalizing...';
      case 'done':
        return formatSize(upload.file.size);
      case 'failed':
        return upload.error || 'Failed';
      default:
        return '';
    }
  };

  return (
    <div className="px-4 py-3 border-b border-surface-200 dark:border-surface-700 last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">{getStatusIcon()}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">
              {upload.fileName}
            </span>
            {upload.status === 'failed' && (
              <button
                onClick={() => onRetry(upload.id)}
                className="flex-shrink-0 text-xs text-brand-600 dark:text-brand-400 hover:underline"
              >
                Retry
              </button>
            )}
            {['queued', 'hashing', 'uploading'].includes(upload.status) && (
              <button
                onClick={() => onCancel(upload.id)}
                className="flex-shrink-0 p-1 hover:bg-surface-200 dark:hover:bg-surface-700 rounded transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {['hashing', 'uploading', 'completing'].includes(upload.status) && (
            <div className="mb-1">
              <Progress value={upload.progress} />
            </div>
          )}

          <div className="text-xs text-surface-500 dark:text-surface-400">
            {getStatusText()}
          </div>
        </div>
      </div>
    </div>
  );
}
