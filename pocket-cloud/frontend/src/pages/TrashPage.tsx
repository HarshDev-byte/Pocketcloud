import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  TrashIcon, 
  ArrowPathIcon, 
  XMarkIcon,
  FolderIcon,
  DocumentIcon,
  PhotoIcon,
  VideoCameraIcon,
  MusicalNoteIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { TrashContents, TrashStats, TrashItem } from '../types/files';
import { apiClient } from '../api/client';

// Format bytes to human readable
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Format date to relative time
const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
};

// Get file type icon
const getFileIcon = (mimeType?: string) => {
  if (!mimeType) return DocumentIcon;
  
  if (mimeType.startsWith('image/')) return PhotoIcon;
  if (mimeType.startsWith('video/')) return VideoCameraIcon;
  if (mimeType.startsWith('audio/')) return MusicalNoteIcon;
  return DocumentIcon;
};

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText,
  onConfirm,
  onCancel,
  isDestructive = false
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center mb-4">
          <ExclamationTriangleIcon className="h-6 w-6 text-yellow-500 mr-3" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </h3>
        </div>
        
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          {message}
        </p>
        
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isDestructive
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export const TrashPage: React.FC = () => {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    action: () => void;
    isDestructive?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: '',
    action: () => {},
    isDestructive: false
  });

  const queryClient = useQueryClient();

  // Fetch trash contents
  const { data: trashContents, isLoading, error } = useQuery<TrashContents>({
    queryKey: ['trash'],
    queryFn: async () => {
      const response = await apiClient.get('/api/trash');
      return response.data;
    }
  });

  // Fetch trash stats
  const { data: trashStats } = useQuery<TrashStats>({
    queryKey: ['trash-stats'],
    queryFn: async () => {
      const response = await apiClient.get('/api/trash/stats');
      return response.data;
    }
  });

  // Restore item mutation
  const restoreMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await apiClient.post(`/api/trash/${itemId}/restore`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      queryClient.invalidateQueries({ queryKey: ['trash-stats'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['storage-stats'] });
    }
  });

  // Permanent delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await apiClient.delete(`/api/trash/${itemId}`);
      return response.data;
    },
    onSuccess: (data, itemId) => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      queryClient.invalidateQueries({ queryKey: ['trash-stats'] });
      queryClient.invalidateQueries({ queryKey: ['storage-stats'] });
      setSelectedItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }
  });

  // Empty trash mutation
  const emptyTrashMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.delete('/api/trash/empty');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      queryClient.invalidateQueries({ queryKey: ['trash-stats'] });
      queryClient.invalidateQueries({ queryKey: ['storage-stats'] });
      setSelectedItems(new Set());
    }
  });

  // Combine files and folders for display
  const allItems: TrashItem[] = [
    ...(trashContents?.folders || []),
    ...(trashContents?.files || [])
  ].sort((a, b) => b.deleted_at - a.deleted_at);

  // Handle item selection
  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Select all items
  const selectAll = () => {
    setSelectedItems(new Set(allItems.map(item => item.id)));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  // Handle restore
  const handleRestore = (itemId: string) => {
    restoreMutation.mutate(itemId);
  };

  // Handle bulk restore
  const handleBulkRestore = () => {
    selectedItems.forEach(itemId => {
      restoreMutation.mutate(itemId);
    });
    setSelectedItems(new Set());
  };

  // Handle permanent delete
  const handlePermanentDelete = (itemId: string, itemName: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Permanently Delete Item',
      message: `Are you sure you want to permanently delete "${itemName}"? This action cannot be undone.`,
      confirmText: 'Delete Forever',
      action: () => {
        deleteMutation.mutate(itemId);
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      },
      isDestructive: true
    });
  };

  // Handle bulk permanent delete
  const handleBulkPermanentDelete = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Permanently Delete Items',
      message: `Are you sure you want to permanently delete ${selectedItems.size} items? This action cannot be undone.`,
      confirmText: 'Delete Forever',
      action: () => {
        selectedItems.forEach(itemId => {
          deleteMutation.mutate(itemId);
        });
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      },
      isDestructive: true
    });
  };

  // Handle empty trash
  const handleEmptyTrash = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Empty Trash',
      message: 'Are you sure you want to permanently delete all items in trash? This action cannot be undone.',
      confirmText: 'Empty Trash',
      action: () => {
        emptyTrashMutation.mutate();
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      },
      isDestructive: true
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <TrashIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Failed to load trash
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          There was an error loading your trash contents.
        </p>
      </div>
    );
  }

  if (!allItems.length) {
    return (
      <div className="text-center py-12">
        <TrashIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Trash is empty
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Items you delete will appear here for 30 days before being permanently removed.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Trash
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {trashStats && (
                <>
                  {trashStats.itemCount} items • {formatBytes(trashStats.totalSize)}
                </>
              )}
            </p>
          </div>
          
          <button
            onClick={handleEmptyTrash}
            disabled={emptyTrashMutation.isPending || !allItems.length}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            {emptyTrashMutation.isPending ? 'Emptying...' : 'Empty Trash'}
          </button>
        </div>

        {/* Bulk actions */}
        {selectedItems.size > 0 && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-blue-800 dark:text-blue-200">
                {selectedItems.size} items selected
              </span>
              <div className="flex space-x-2">
                <button
                  onClick={handleBulkRestore}
                  disabled={restoreMutation.isPending}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded text-sm font-medium transition-colors"
                >
                  Restore
                </button>
                <button
                  onClick={handleBulkPermanentDelete}
                  disabled={deleteMutation.isPending}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white rounded text-sm font-medium transition-colors"
                >
                  Delete Forever
                </button>
                <button
                  onClick={clearSelection}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm font-medium transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Select all */}
        <div className="flex items-center mb-4">
          <input
            type="checkbox"
            checked={selectedItems.size === allItems.length && allItems.length > 0}
            onChange={(e) => e.target.checked ? selectAll() : clearSelection()}
            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
          <label className="ml-2 text-sm text-gray-600 dark:text-gray-300">
            Select all
          </label>
        </div>
      </div>

      {/* Items list */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {allItems.map((item) => {
            const Icon = item.type === 'folder' ? FolderIcon : getFileIcon(item.mime_type);
            const isSelected = selectedItems.has(item.id);
            
            return (
              <div
                key={item.id}
                className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleItemSelection(item.id)}
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 mr-3"
                  />
                  
                  <Icon className="h-8 w-8 text-gray-400 mr-3 flex-shrink-0" />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {item.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Original location: {item.original_location}
                        </p>
                        <div className="flex items-center space-x-4 mt-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Deleted {formatRelativeTime(item.deleted_at)}
                          </span>
                          {item.size && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {formatBytes(item.size)}
                            </span>
                          )}
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {item.days_until_purge === 0 
                              ? 'Expires today' 
                              : `${item.days_until_purge} days until auto-delete`
                            }
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2 ml-4">
                        <button
                          onClick={() => handleRestore(item.id)}
                          disabled={restoreMutation.isPending}
                          className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          title="Restore"
                        >
                          <ArrowPathIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(item.id, item.name)}
                          disabled={deleteMutation.isPending}
                          className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Delete forever"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirm dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        onConfirm={confirmDialog.action}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        isDestructive={confirmDialog.isDestructive}
      />
    </div>
  );
};