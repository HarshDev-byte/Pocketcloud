import React, { useState } from 'react';

interface ConflictInfo {
  fileId: string;
  fileName: string;
  clientChecksum: string;
  serverChecksum: string;
  clientModifiedAt: number;
  serverModifiedAt: number;
  clientSize: number;
  serverSize: number;
  lastModifiedBy?: string;
}

interface ConflictResolverProps {
  conflict: ConflictInfo;
  isOpen: boolean;
  onResolve: (strategy: 'keep_both' | 'last_write_wins' | 'use_server_version') => void;
  onCancel: () => void;
}

export const ConflictResolver: React.FC<ConflictResolverProps> = ({
  conflict,
  isOpen,
  onResolve,
  onCancel
}) => {
  const [selectedStrategy, setSelectedStrategy] = useState<'keep_both' | 'last_write_wins' | 'use_server_version'>('keep_both');
  const [resolving, setResolving] = useState(false);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;
    if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)} months ago`;
    return `${Math.floor(diffInSeconds / 31536000)} years ago`;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    
    if (date.toDateString() === now.toDateString()) {
      return `Today ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (date.toDateString() === new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString()) {
      return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return formatTimeAgo(date);
    }
  };

  const handleResolve = async () => {
    setResolving(true);
    try {
      onResolve(selectedStrategy);
    } finally {
      setResolving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div 
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onCancel}
        />

        {/* Dialog */}
        <div className="inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg dark:bg-gray-800">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Upload conflict detected
                </h3>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="mb-6">
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              <span className="font-medium">{conflict.fileName}</span> was modified on the server after you started editing.
            </p>

            {/* Version Comparison */}
            <div className="space-y-4">
              {/* Your Version */}
              <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
                <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Your version</h4>
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  <p>{formatFileSize(conflict.clientSize)} · Modified {formatDate(conflict.clientModifiedAt)}</p>
                </div>
              </div>

              {/* Server Version */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">Server version</h4>
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  <p>
                    {formatFileSize(conflict.serverSize)} · Modified {formatDate(conflict.serverModifiedAt)}
                    {conflict.lastModifiedBy && ` (by ${conflict.lastModifiedBy})`}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Resolution Options */}
          <div className="mb-6">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3">How would you like to resolve this?</h4>
            
            <div className="space-y-3">
              {/* Keep Both */}
              <label className="flex items-start p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <input
                  type="radio"
                  name="resolution"
                  value="keep_both"
                  checked={selectedStrategy === 'keep_both'}
                  onChange={(e) => setSelectedStrategy(e.target.value as any)}
                  className="mt-1 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <div className="ml-3">
                  <div className="font-medium text-gray-900 dark:text-white">Keep both versions</div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    Save your version with a conflict suffix (recommended)
                  </div>
                </div>
              </label>

              {/* Use Your Version */}
              <label className="flex items-start p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <input
                  type="radio"
                  name="resolution"
                  value="last_write_wins"
                  checked={selectedStrategy === 'last_write_wins'}
                  onChange={(e) => setSelectedStrategy(e.target.value as any)}
                  className="mt-1 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <div className="ml-3">
                  <div className="font-medium text-gray-900 dark:text-white">Use my version</div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    Overwrite the server version (server version will be saved in history)
                  </div>
                </div>
              </label>

              {/* Keep Server Version */}
              <label className="flex items-start p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <input
                  type="radio"
                  name="resolution"
                  value="use_server_version"
                  checked={selectedStrategy === 'use_server_version'}
                  onChange={(e) => setSelectedStrategy(e.target.value as any)}
                  className="mt-1 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <div className="ml-3">
                  <div className="font-medium text-gray-900 dark:text-white">Keep server version</div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    Discard your changes and keep the server version
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3">
            <button
              onClick={onCancel}
              disabled={resolving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={handleResolve}
              disabled={resolving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {resolving ? 'Resolving...' : 'Resolve Conflict'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};