import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  ChevronUp, 
  ChevronDown, 
  Download, 
  Edit3, 
  Move, 
  Copy, 
  Share2, 
  Trash2,
  FolderOpen,
  Loader2,
  File,
  Folder,
  Image,
  Video,
  Music,
  FileText,
  Archive,
  MoreHorizontal,
  Eye
} from 'lucide-react';
import { apiClient } from '../api/client';
import { FileItem, FolderItem, ViewMode, SortConfig, ContextMenuAction, ContextMenuPosition } from '../types/files';
import { useFileUpload } from '../hooks/useFileUpload';
import UploadManager from './Upload/UploadManager';
import { ShareDialog } from './ShareDialog';
import FilePreview from './FilePreview';

interface FileBrowserProps {
  folderId?: string;
  viewMode: ViewMode;
  sortConfig: SortConfig;
  searchQuery?: string;
  selectedItems: Set<string>;
  onSortChange: (field: string) => void;
  onSelectionChange: (items: Set<string>) => void;
}

interface ContextMenuState {
  visible: boolean;
  position: ContextMenuPosition;
  items: (FileItem | FolderItem)[];
}

const FileBrowser: React.FC<FileBrowserProps> = ({
  folderId,
  viewMode,
  sortConfig,
  searchQuery = '',
  selectedItems,
  onSortChange,
  onSelectionChange,
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    position: { x: 0, y: 0 },
    items: [],
  });
  const [shareDialog, setShareDialog] = useState<{
    isOpen: boolean;
    fileId?: string;
    folderId?: string;
    fileName: string;
    isFolder: boolean;
  }>({
    isOpen: false,
    fileName: '',
    isFolder: false,
  });
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);

  const queryClient = useQueryClient();
  
  // File upload hook
  const {
    files: uploadFiles,
    addFiles,
    removeFile,
    retryFile,
    pauseFile,
    resumeFile,
    clearCompleted,
  } = useFileUpload({
    folderId,
    onComplete: () => {
      queryClient.invalidateQueries({ queryKey: ['folder', folderId] });
    },
  });

  // Fetch folder contents
  const {
    data: folderData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['folder', folderId],
    queryFn: async () => {
      if (folderId) {
        const response = await apiClient.get(`/folders/${folderId}`);
        return response.data;
      } else {
        const response = await apiClient.get('/folders');
        return response.data;
      }
    },
    staleTime: 30000,
  });

  // Combine and sort items
  const sortedItems = useMemo(() => {
    if (!folderData) return [];
    
    const folders = folderData.folders || [];
    const files = folderData.files || [];
    let allItems = [...folders, ...files];
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      allItems = allItems.filter(item => 
        item.name.toLowerCase().includes(query)
      );
    }
    
    return allItems.sort((a, b) => {
      // Always show folders first
      const aIsFolder = 'path' in a;
      const bIsFolder = 'path' in b;
      
      if (aIsFolder && !bIsFolder) return -1;
      if (!aIsFolder && bIsFolder) return 1;
      
      // Sort by selected field
      let aValue: any, bValue: any;
      
      switch (sortConfig.field) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'size':
          aValue = aIsFolder ? 0 : (a as FileItem).size;
          bValue = bIsFolder ? 0 : (b as FileItem).size;
          break;
        case 'modified':
          aValue = a.updated_at;
          bValue = b.updated_at;
          break;
        case 'type':
          aValue = aIsFolder ? 'folder' : (a as FileItem).mime_type;
          bValue = bIsFolder ? 'folder' : (b as FileItem).mime_type;
          break;
        default:
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
      }
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [folderData, sortConfig, searchQuery]);

  // Get file icon based on mime type
  const getFileIcon = useCallback((mimeType: string) => {
    if (mimeType.startsWith('image/')) return Image;
    if (mimeType.startsWith('video/')) return Video;
    if (mimeType.startsWith('audio/')) return Music;
    if (mimeType.includes('text') || mimeType.includes('document')) return FileText;
    if (mimeType.includes('zip') || mimeType.includes('archive')) return Archive;
    return File;
  }, []);

  // Format file size
  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }, []);

  // Format date
  const formatDate = useCallback((timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString();
  }, []);

  // Selection handlers
  const handleItemSelect = useCallback((id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (event.ctrlKey || event.metaKey) {
      // Toggle selection
      const newSet = new Set(selectedItems);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      onSelectionChange(newSet);
    } else if (event.shiftKey && selectedItems.size > 0) {
      // Range selection
      const lastSelected = Array.from(selectedItems)[selectedItems.size - 1];
      const lastIndex = sortedItems.findIndex(item => item.id === lastSelected);
      const currentIndex = sortedItems.findIndex(item => item.id === id);
      
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const rangeIds = sortedItems.slice(start, end + 1).map(item => item.id);
        onSelectionChange(new Set(rangeIds));
      }
    } else {
      // Single selection
      onSelectionChange(new Set([id]));
    }
  }, [selectedItems, sortedItems, onSelectionChange]);

  const handleItemDoubleClick = useCallback((item: FileItem | FolderItem) => {
    const isFolder = 'path' in item;
    
    if (isFolder) {
      // Navigate to folder
      window.location.href = `/files/${item.id}`;
    } else {
      // Preview file
      setPreviewFile(item as FileItem);
    }
  }, []);

  // Context menu handlers
  const handleContextMenu = useCallback((event: React.MouseEvent, item: FileItem | FolderItem) => {
    event.preventDefault();
    
    const items = selectedItems.has(item.id) 
      ? sortedItems.filter(i => selectedItems.has(i.id))
      : [item];
    
    if (!selectedItems.has(item.id)) {
      onSelectionChange(new Set([item.id]));
    }
    
    setContextMenu({
      visible: true,
      position: { x: event.clientX, y: event.clientY },
      items,
    });
  }, [selectedItems, sortedItems, onSelectionChange]);

  const getContextMenuActions = useCallback((items: (FileItem | FolderItem)[]): ContextMenuAction[] => {
    const isMultiple = items.length > 1;
    const hasFiles = items.some(item => !('path' in item));
    const hasFolders = items.some(item => 'path' in item);
    
    const actions: ContextMenuAction[] = [];
    
    if (!isMultiple) {
      const item = items[0];
      const isFolder = 'path' in item;
      
      actions.push({
        id: 'open',
        label: isFolder ? 'Open' : 'Preview',
        icon: isFolder ? FolderOpen : Eye,
        onClick: () => handleItemDoubleClick(item),
      });
    }
    
    if (hasFiles && !hasFolders && !isMultiple) {
      actions.push({
        id: 'download',
        label: 'Download',
        icon: Download,
        onClick: () => {
          const file = items[0] as FileItem;
          window.open(`/api/files/${file.id}/download`, '_blank');
        },
      });
    }
    
    if (!isMultiple) {
      actions.push({
        id: 'rename',
        label: 'Rename',
        icon: Edit3,
        onClick: () => {
          const newName = prompt('Enter new name:', items[0].name);
          if (newName && newName.trim() && newName !== items[0].name) {
            // TODO: Implement rename
            console.log('Rename', items[0], 'to', newName);
          }
        },
      });
    }
    
    actions.push(
      {
        id: 'move',
        label: 'Move',
        icon: Move,
        onClick: () => {
          // TODO: Implement move modal
          console.log('Move', items);
        },
      },
      {
        id: 'copy',
        label: isMultiple ? 'Copy Items' : 'Copy',
        icon: Copy,
        onClick: () => {
          // TODO: Implement copy functionality
          console.log('Copy', items);
        },
      }
    );
    
    if (!isMultiple && !hasFolders) {
      actions.push({
        id: 'share',
        label: 'Share',
        icon: Share2,
        onClick: () => {
          const item = items[0];
          const isFolder = 'path' in item;
          setShareDialog({
            isOpen: true,
            fileId: isFolder ? undefined : item.id,
            folderId: isFolder ? item.id : undefined,
            fileName: item.name,
            isFolder,
          });
        },
      });
    }
    
    actions.push({
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      onClick: () => {
        if (confirm(`Are you sure you want to delete ${items.length === 1 ? items[0].name : `${items.length} items`}?`)) {
          // TODO: Implement delete
          console.log('Delete', items);
        }
      },
      separator: true,
    });
    
    return actions;
  }, [handleItemDoubleClick]);

  // Clear selection when clicking outside
  const handleContainerClick = useCallback(() => {
    onSelectionChange(new Set());
  }, [onSelectionChange]);

  // Close context menu
  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, []);

  // Close context menu on scroll or click outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(prev => ({ ...prev, visible: false }));
    const handleScroll = () => setContextMenu(prev => ({ ...prev, visible: false }));
    
    if (contextMenu.visible) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('scroll', handleScroll, true);
      return () => {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [contextMenu.visible]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-pcd-blue-500 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Loading files...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 mb-4">Failed to load folder contents</div>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-pcd-blue-600 text-white rounded-md hover:bg-pcd-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const isEmpty = sortedItems.length === 0;

  if (isEmpty && !searchQuery) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <Folder className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            This folder is empty
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Drag and drop files here or click the upload button to get started.
          </p>
          <button
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.multiple = true;
              input.onchange = (e) => {
                const files = Array.from((e.target as HTMLInputElement).files || []);
                if (files.length > 0) {
                  addFiles(files);
                }
              };
              input.click();
            }}
            className="px-4 py-2 bg-pcd-blue-600 text-white rounded-md hover:bg-pcd-blue-700"
          >
            Upload files
          </button>
        </div>
      </div>
    );
  }

  if (isEmpty && searchQuery) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-gray-500 dark:text-gray-400 mb-4">
            No files found for "{searchQuery}"
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="h-full relative"
      onClick={handleContainerClick}
    >
      {/* List view */}
      {viewMode === 'list' && (
        <div className="h-full overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
              <tr>
                <th className="w-8 px-3 py-2"></th>
                {[
                  { key: 'name', label: 'Name' },
                  { key: 'type', label: 'Type', className: 'hidden sm:table-cell' },
                  { key: 'size', label: 'Size', className: 'hidden md:table-cell' },
                  { key: 'modified', label: 'Modified', className: 'hidden lg:table-cell' },
                ].map(({ key, label, className = '' }) => (
                  <th
                    key={key}
                    className={`px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${className}`}
                    onClick={() => onSortChange(key)}
                  >
                    <div className="flex items-center space-x-1">
                      <span>{label}</span>
                      {sortConfig.field === key && (
                        sortConfig.direction === 'asc' ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )
                      )}
                    </div>
                  </th>
                ))}
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {sortedItems.map((item) => {
                const isFolder = 'path' in item;
                const isSelected = selectedItems.has(item.id);
                const Icon = isFolder ? Folder : getFileIcon((item as FileItem).mime_type);
                
                return (
                  <tr
                    key={item.id}
                    className={`
                      hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors
                      ${isSelected ? 'bg-pcd-blue-50 dark:bg-pcd-blue-900/20' : ''}
                    `}
                    onClick={(e) => handleItemSelect(item.id, e)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                    onContextMenu={(e) => handleContextMenu(e, item)}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="rounded border-gray-300 text-pcd-blue-600 focus:ring-pcd-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center space-x-3">
                        <Icon className={`w-5 h-5 ${isFolder ? 'text-pcd-blue-500' : 'text-gray-400'}`} />
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {item.name}
                        </span>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                      {isFolder ? 'Folder' : (item as FileItem).mime_type.split('/')[0]}
                    </td>
                    <td className="hidden md:table-cell px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                      {isFolder ? '—' : formatFileSize((item as FileItem).size)}
                    </td>
                    <td className="hidden lg:table-cell px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(item.updated_at)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleContextMenu(e, item);
                        }}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                      >
                        <MoreHorizontal className="w-4 h-4 text-gray-400" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Grid view */}
      {viewMode === 'grid' && (
        <div className="h-full overflow-auto p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {sortedItems.map((item) => {
              const isFolder = 'path' in item;
              const isSelected = selectedItems.has(item.id);
              const Icon = isFolder ? Folder : getFileIcon((item as FileItem).mime_type);
              
              return (
                <div
                  key={item.id}
                  className={`
                    relative group p-3 rounded-lg border-2 transition-all cursor-pointer
                    ${isSelected 
                      ? 'border-pcd-blue-500 bg-pcd-blue-50 dark:bg-pcd-blue-900/20' 
                      : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }
                  `}
                  onClick={(e) => handleItemSelect(item.id, e)}
                  onDoubleClick={() => handleItemDoubleClick(item)}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                >
                  {/* Thumbnail/Icon */}
                  <div className="aspect-square mb-2 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg">
                    {!isFolder && (item as FileItem).mime_type.startsWith('image/') ? (
                      <img
                        src={`/api/files/${item.id}/preview`}
                        alt={item.name}
                        className="w-full h-full object-cover rounded-lg"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          target.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <Icon className={`w-12 h-12 ${isFolder ? 'text-pcd-blue-500' : 'text-gray-400'} ${!isFolder && (item as FileItem).mime_type.startsWith('image/') ? 'hidden' : ''}`} />
                  </div>

                  {/* File info */}
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate" title={item.name}>
                      {item.name}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {isFolder ? 'Folder' : formatFileSize((item as FileItem).size)}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {formatDate(item.updated_at)}
                    </p>
                  </div>

                  {/* Selection checkbox */}
                  <div className={`absolute top-2 left-2 ${isSelected || 'group-hover:opacity-100 opacity-0'} transition-opacity`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="rounded border-gray-300 text-pcd-blue-600 focus:ring-pcd-blue-500"
                    />
                  </div>

                  {/* More options */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleContextMenu(e, item);
                    }}
                    className="absolute top-2 right-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreHorizontal className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu.visible && (
        <div
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-48"
          style={{
            left: contextMenu.position.x,
            top: contextMenu.position.y,
          }}
        >
          {getContextMenuActions(contextMenu.items).map((action, index) => (
            <React.Fragment key={action.id}>
              {action.separator && index > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
              )}
              <button
                onClick={() => {
                  action.onClick();
                  handleCloseContextMenu();
                }}
                disabled={action.disabled}
                className="w-full flex items-center space-x-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <action.icon className="w-4 h-4" />
                <span>{action.label}</span>
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Upload manager */}
      <UploadManager
        files={uploadFiles}
        onRemoveFile={removeFile}
        onRetryFile={retryFile}
        onPauseFile={pauseFile}
        onResumeFile={resumeFile}
        onClearCompleted={clearCompleted}
      />

      {/* Share Dialog */}
      <ShareDialog
        isOpen={shareDialog.isOpen}
        onClose={() => setShareDialog(prev => ({ ...prev, isOpen: false }))}
        fileId={shareDialog.fileId}
        folderId={shareDialog.folderId}
        fileName={shareDialog.fileName}
        isFolder={shareDialog.isFolder}
      />

      {/* File Preview */}
      {previewFile && (
        <FilePreview
          file={previewFile}
          files={sortedItems.filter(item => !('path' in item)) as FileItem[]}
          onClose={() => setPreviewFile(null)}
          onNavigate={setPreviewFile}
        />
      )}
    </div>
  );
};

export default FileBrowser;