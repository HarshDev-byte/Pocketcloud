import React, { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface FileVersion {
  id: string;
  fileId: string;
  versionNum: number;
  size: number;
  checksum: string;
  storagePath: string;
  createdBy: string;
  createdAt: number;
  comment?: string;
  isCurrent: boolean;
  createdByName?: string;
}

interface VersionHistoryProps {
  fileId: string;
  fileName: string;
  isOpen: boolean;
  onClose: () => void;
  onVersionRestore?: (versionNum: number) => void;
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({
  fileId,
  fileName,
  isOpen,
  onClose,
  onVersionRestore
}) => {
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalStorage, setTotalStorage] = useState(0);
  const [restoring, setRestoring] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen && fileId) {
      loadVersions();
    }
  }, [isOpen, fileId]);

  const loadVersions = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/files/${fileId}/versions`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to load versions');
      }
      
      const data = await response.json();
      setVersions(data.data.versions);
      setTotalStorage(data.data.storageUsed);
    } catch (error) {
      console.error('Load versions error:', error);
      setError('Failed to load version history');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (versionNum: number) => {
    if (restoring) return;
    
    setRestoring(versionNum);
    
    try {
      const response = await fetch(`/api/files/${fileId}/versions/${versionNum}/restore`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to restore version');
      }
      
      // Reload versions to reflect changes
      await loadVersions();
      
      // Notify parent component
      onVersionRestore?.(versionNum);
      
    } catch (error) {
      console.error('Restore version error:', error);
      setError('Failed to restore version');
    } finally {
      setRestoring(null);
    }
  };

  const handleDownload = (versionNum: number) => {
    const link = document.createElement('a');
    link.href = `/api/files/${fileId}/versions/${versionNum}/download`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteVersion = async (versionNum: number) => {
    if (!confirm('Are you sure you want to delete this version?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/files/${fileId}/versions/${versionNum}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete version');
      }
      
      await loadVersions();
    } catch (error) {
      console.error('Delete version error:', error);
      setError('Failed to delete version');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    
    if (date.toDateString() === now.toDateString()) {
      return `Today ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (date.toDateString() === new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString()) {
      return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return formatDistanceToNow(date, { addSuffix: true });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      
      {/* Side Panel */}
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-800 shadow-xl transform transition-transform duration-300 ease-in-out">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Version history
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
              {fileName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="p-4">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-red-800 dark:text-red-200">{error}</p>
                <button
                  onClick={loadVersions}
                  className="mt-2 text-red-600 hover:text-red-800 text-sm font-medium"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Version List */}
              <div className="p-4 space-y-4">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className={`border rounded-lg p-4 ${
                      version.isCurrent
                        ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    {/* Version Header */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center">
                        <div className={`w-3 h-3 rounded-full mr-3 ${
                          version.isCurrent ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                        }`} />
                        <div>
                          <h3 className="font-medium text-gray-900 dark:text-white">
                            {version.isCurrent ? 'Current version' : `Version ${version.versionNum}`}
                          </h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {formatDate(version.createdAt)} · {formatFileSize(version.size)} · {version.createdByName || 'Unknown'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Version Comment */}
                    {version.comment && (
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                        {version.comment}
                      </p>
                    )}

                    {/* Actions */}
                    {!version.isCurrent && (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleDownload(version.versionNum)}
                          className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded"
                        >
                          Download
                        </button>
                        <button
                          onClick={() => handleRestore(version.versionNum)}
                          disabled={restoring === version.versionNum}
                          className="px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-300 rounded disabled:opacity-50"
                        >
                          {restoring === version.versionNum ? 'Restoring...' : 'Restore'}
                        </button>
                        <button
                          onClick={() => handleDeleteVersion(version.versionNum)}
                          className="px-3 py-1 text-sm bg-red-100 hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800 text-red-700 dark:text-red-300 rounded"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Versions use {formatFileSize(totalStorage)} · Max {versions.length} versions kept
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};