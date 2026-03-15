import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
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
  Loader2
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { FileItem, FolderItem, ViewMode, SortConfig, ContextMenuAction, ContextMenuPosition } from '../../types/files';
import { useFileUpload } from '../../hooks/useFileUpload';
import FileCard from './FileCard';
import FileRow from './FileRow';
import ContextMenu from './ContextMenu';
import DropZone from '../Upload/DropZone';
import UploadManager from '../Upload/UploadManager';
import { ShareDialog } from '../ShareDialog';

interface FileBrowserProps {
  folderId?: string;
  viewMode: ViewMode;
  sortConfig: SortConfig;
  onSortChange: (field: string) => void;
}

const FileBrowser: React.FC<FileBrowserProps> = ({
  folderId,
  viewMode,
  sortConfig,
  onSortChange,
}) => {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    position: ContextMenuPosition;
    items: (FileItem | FolderItem)[];
  }>({
    visible: false,
    position: { x: 0, y: 0 },
    items: [],
  });
  const [isDragOver, setIsDragOver] = useState(false);
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

  const queryClient = useQueryClient();
  
  // File upload hook
  const {
    files: uploadFiles,
    isUploading,
    addFiles,
    removeFile,
    retryFile,
    pauseFile,
    resumeFile,
    clearCompleted,
  } = useFileUpload({
    folderId,
    onComplete: () => {
      // Refresh folder contents when upload completes
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
        return { folders: response.data.folders, files: [] };
      }
    },
    staleTime: 30000, // 30 seconds
  });

  // Combine and sort items
  const sortedItems = useMemo(() => {
    if (!folderData) return [];
    
    const folders = folderData.subfolders || folderData.folders || [];
    const files = folderData.files || [];
    const allItems = [...folders, ...files];
    
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
  }, [folderData, sortConfig]);

  // Virtualization for large lists
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: sortedItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (viewMode === 'grid' ? 200 : 48),
    overscan: 10,
  });

  // Selection handlers
  const handleItemSelect = useCallback((id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (event.ctrlKey || event.metaKey) {
      // Toggle selection
      setSelectedItems(prev => {
        const newSet = new Set(prev);
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
        return newSet;
      });
    } else if (event.shiftKey && selectedItems.size > 0) {
      // Range selection
      const lastSelected = Array.from(selectedItems)[selectedItems.size - 1];
      const lastIndex = sortedItems.findIndex(item => item.id === lastSelected);
      const currentIndex = sortedItems.findIndex(item => item.id === id);
      
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const rangeIds = sortedItems.slice(start, end + 1).map(item => item.id);
        
        setSelectedItems(new Set(rangeIds));
      }
    } else {
      // Single selection
      setSelectedItems(new Set([id]));
    }
  }, [selectedItems, sortedItems]);

  const handleItemDoubleClick = useCallback((item: FileItem | FolderItem) => {
    const isFolder = 'path' in item;
    
    if (isFolder) {
      // Navigate to folder
      window.location.href = `/files/${item.id}`;
    } else {
      // Download file
      window.open(`/api/files/${item.id}/download`, '_blank');
    }
  }, []);

  // Context menu handlers
  const handleContextMenu = useCallback((event: React.MouseEvent, item: FileItem | FolderItem) => {
    event.preventDefault();
    
    const items = selectedItems.has(item.id) 
      ? sortedItems.filter(i => selectedItems.has(i.id))
      : [item];
    
    if (!selectedItems.has(item.id)) {
      setSelectedItems(new Set([item.id]));
    }
    
    setContextMenu({
      visible: true,
      position: { x: event.clientX, y: event.clientY },
      items,
    });
  }, [selectedItems, sortedItems]);

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
        label: isFolder ? 'Open' : 'Download',
        icon: isFolder ? FolderOpen : Download,
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
          // TODO: Implement rename modal
          console.log('Rename', items[0]);
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
    
    if (!hasFolders) {
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
        // TODO: Implement delete confirmation
        console.log('Delete', items);
      },
      separator: true,
    });
    
    return actions;
  }, [handleItemDoubleClick]);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((files: File[]) => {
    setIsDragOver(false);
    addFiles(files);
  }, [addFiles]);

  // Clear selection when clicking outside
  const handleContainerClick = useCallback(() => {
    setSelectedItems(new Set());
  }, []);

  // Close context menu
  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-pcd-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-500 mb-4">Failed to load folder contents</div>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-pcd-blue-600 text-white rounded-md hover:bg-pcd-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const isEmpty = sortedItems.length === 0;

  return (
    <div 
      className="h-full relative"
      onClick={handleContainerClick}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      {/* Drop zone overlay */}
      <DropZone
        onFilesDropped={handleDrop}
        isOverlay
      />

      {isEmpty ? (
        <div className="h-full flex items-center justify-center">
          <DropZone
            onFilesDropped={handleDrop}
            className="w-full max-w-md mx-auto"
          />
        </div>
      ) : (
        <>
          {/* List view */}
          {viewMode === 'list' && (
            <div className="h-full overflow-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                  <tr>
                    <th className="w-8"></th>
                    {[
                      { key: 'name', label: 'Name' },
                      { key: 'type', label: 'Type' },
                      { key: 'size', label: 'Size' },
                      { key: 'modified', label: 'Modified' },
                    ].map(({ key, label }) => (
                      <th
                        key={key}
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
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
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {sortedItems.map((item) => (
                    <FileRow
                      key={item.id}
                      item={item}
                      isSelected={selectedItems.has(item.id)}
                      onSelect={handleItemSelect}
                      onDoubleClick={handleItemDoubleClick}
                      onContextMenu={handleContextMenu}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Grid view */}
          {viewMode === 'grid' && (
            <div
              ref={parentRef}
              className="h-full overflow-auto p-4"
              style={{ contain: 'strict' }}
            >
              <div
                style={{
                  height: virtualizer.getTotalSize(),
                  width: '100%',
                  position: 'relative',
                }}
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {virtualizer.getVirtualItems().map((virtualItem) => {
                    const item = sortedItems[virtualItem.index];
                    return (
                      <div
                        key={virtualItem.key}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${virtualItem.size}px`,
                          transform: `translateY(${virtualItem.start}px)`,
                        }}
                      >
                        <FileCard
                          item={item}
                          isSelected={selectedItems.has(item.id)}
                          onSelect={handleItemSelect}
                          onDoubleClick={handleItemDoubleClick}
                          onContextMenu={handleContextMenu}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Context menu */}
      <ContextMenu
        visible={contextMenu.visible}
        position={contextMenu.position}
        actions={getContextMenuActions(contextMenu.items)}
        onClose={handleCloseContextMenu}
      />

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
    </div>
  );
};

export default FileBrowser;