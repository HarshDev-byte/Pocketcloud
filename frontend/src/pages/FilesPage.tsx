import { useState, useRef } from 'react';
import { Upload as UploadIcon } from 'lucide-react';
import { EmptyState } from '../components/ui';
import { useFileBrowser } from '../hooks/useFileBrowser';
import { useUpload } from '../hooks/useUpload';
import { useUIStore } from '../store/ui.store';
import { Breadcrumb } from '../components/files/Breadcrumb';
import { Toolbar } from '../components/files/Toolbar';
import { SelectionToolbar } from '../components/files/SelectionToolbar';
import { FileGrid } from '../components/files/FileGrid';
import { FileList } from '../components/files/FileList';
import { ContextMenu } from '../components/files/ContextMenu';
import { MoveDialog } from '../components/files/MoveDialog';
import { DropZone } from '../components/upload/DropZone';
import { UploadPanel } from '../components/upload/UploadPanel';
import { FileViewer } from '../components/viewer/FileViewer';
import { FileItem, FolderItem, filesApi } from '../api/files.api';
import { toast } from '../components/ui';
import { useParams } from 'react-router-dom';

export default function FilesPage() {
  const { folderId } = useParams<{ folderId?: string }>();
  
  const {
    folders,
    files,
    breadcrumb,
    isLoading,
    createFolder,
    renameFile,
    renameFolder,
    deleteFile,
    deleteFolder,
    bulkDelete,
    moveFile,
    moveFolder,
    bulkMove,
  } = useFileBrowser();

  const { viewMode, selectedIds } = useUIStore();
  
  // Upload system
  const { uploads, addFiles, retryUpload, cancelUpload, clearCompleted } = useUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: FileItem | FolderItem | null;
    isFolder: boolean;
  } | null>(null);

  // Move dialog state
  const [moveDialog, setMoveDialog] = useState<{
    isOpen: boolean;
    items: Array<{ id: string; isFolder: boolean }>;
    itemName: string;
  }>({
    isOpen: false,
    items: [],
    itemName: '',
  });

  // File viewer state
  const [viewerFile, setViewerFile] = useState<FileItem | null>(null);

  const currentFolderName = breadcrumb.length > 0
    ? breadcrumb[breadcrumb.length - 1].name
    : 'My Files';

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      addFiles(files, folderId || null);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFilesDropped = (files: File[], targetFolderId: string | null) => {
    addFiles(files, targetFolderId);
  };

  const handleNewFolderClick = () => {
    const name = prompt('Enter folder name:');
    if (name) {
      createFolder(name);
    }
  };

  const handleContextMenu = (
    e: React.MouseEvent,
    item: FileItem | FolderItem,
    isFolder: boolean
  ) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item,
      isFolder,
    });
  };

  const handleContextAction = (action: string) => {
    if (!contextMenu?.item) return;

    const { item, isFolder } = contextMenu;

    switch (action) {
      case 'open':
        if (isFolder) {
          window.location.href = `/files/${item.id}`;
        } else {
          // Open file viewer
          setViewerFile(item as FileItem);
        }
        break;

      case 'download':
        if (selectedIds.size > 1) {
          // Bulk download
          const fileIds = Array.from(selectedIds);
          filesApi.downloadMultiple(fileIds).then((response) => {
            const url = window.URL.createObjectURL(response.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'files.zip';
            a.click();
          });
        } else {
          // Single download
          const url = filesApi.getDownloadUrl(item.id);
          window.open(url, '_blank');
        }
        break;

      case 'rename':
        const newName = prompt('Enter new name:', item.name);
        if (newName && newName !== item.name) {
          if (isFolder) {
            renameFolder({ id: item.id, name: newName });
          } else {
            renameFile({ id: item.id, name: newName });
          }
        }
        break;

      case 'move':
        if (selectedIds.size > 1) {
          setMoveDialog({
            isOpen: true,
            items: Array.from(selectedIds).map((id) => ({
              id,
              isFolder: folders.some((f) => f.id === id),
            })),
            itemName: `${selectedIds.size} items`,
          });
        } else {
          setMoveDialog({
            isOpen: true,
            items: [{ id: item.id, isFolder }],
            itemName: item.name,
          });
        }
        break;

      case 'copy':
        console.log('Copy not implemented yet');
        break;

      case 'delete':
        if (selectedIds.size > 1) {
          const fileIds: string[] = [];
          const folderIds: string[] = [];

          selectedIds.forEach((id) => {
            const isFile = files.some((f) => f.id === id);
            if (isFile) {
              fileIds.push(id);
            } else {
              folderIds.push(id);
            }
          });

          if (confirm(`Delete ${selectedIds.size} items?`)) {
            bulkDelete({ fileIds, folderIds });
          }
        } else {
          if (confirm(`Delete "${item.name}"?`)) {
            if (isFolder) {
              deleteFolder(item.id);
            } else {
              deleteFile(item.id);
            }
          }
        }
        break;

      case 'favorite':
        filesApi.addToFavorites(item.id).then(() => {
          toast.success('Added to favorites');
        });
        break;

      default:
        console.log('Action not implemented:', action);
    }

    setContextMenu(null);
  };

  const handleMove = (targetFolderId: string | null) => {
    if (moveDialog.items.length === 1) {
      const { id, isFolder } = moveDialog.items[0];
      if (isFolder) {
        moveFolder({ folderId: id, targetFolderId });
      } else {
        moveFile({ fileId: id, targetFolderId });
      }
    } else {
      const fileIds = moveDialog.items
        .filter((item) => !item.isFolder)
        .map((item) => item.id);
      const folderIds = moveDialog.items
        .filter((item) => item.isFolder)
        .map((item) => item.id);

      bulkMove({ fileIds, folderIds, targetFolderId });
    }

    setMoveDialog({ isOpen: false, items: [], itemName: '' });
  };

  const handleRename = (item: FileItem | FolderItem, isFolder: boolean) => {
    const newName = prompt('Enter new name:', item.name);
    if (newName && newName !== item.name) {
      if (isFolder) {
        renameFolder({ id: item.id, name: newName });
      } else {
        renameFile({ id: item.id, name: newName });
      }
    }
  };

  const handleFileOpen = (file: FileItem) => {
    setViewerFile(file);
  };

  const handleViewerNavigate = (direction: 'prev' | 'next') => {
    if (!viewerFile) return;

    const currentIndex = files.findIndex(f => f.id === viewerFile.id);
    let newIndex = currentIndex;

    if (direction === 'prev' && currentIndex > 0) {
      newIndex = currentIndex - 1;
    } else if (direction === 'next' && currentIndex < files.length - 1) {
      newIndex = currentIndex + 1;
    }

    if (newIndex !== currentIndex) {
      setViewerFile(files[newIndex]);
    }
  };

  // Empty state
  if (!isLoading && folders.length === 0 && files.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState
          icon={<UploadIcon className="w-12 h-12" />}
          title="No files yet"
          description="Upload your first file to get started with PocketCloud"
          action={{
            label: 'Upload Files',
            onClick: handleUploadClick,
          }}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Drop zone overlay */}
      <DropZone
        onFilesDropped={handleFilesDropped}
        currentFolderId={folderId || null}
        currentFolderName={currentFolderName}
      />

      {/* Upload panel */}
      <UploadPanel
        uploads={uploads}
        onRetry={retryUpload}
        onCancel={cancelUpload}
        onClearCompleted={clearCompleted}
      />

      {/* Breadcrumb */}
      <Breadcrumb items={breadcrumb} />

      {/* Selection toolbar or regular toolbar */}
      {selectedIds.size > 0 ? (
        <SelectionToolbar
          onDownload={() => handleContextAction('download')}
          onMove={() => handleContextAction('move')}
          onCopy={() => handleContextAction('copy')}
          onTag={() => console.log('Tag')}
          onDelete={() => handleContextAction('delete')}
        />
      ) : (
        <Toolbar
          onUploadClick={handleUploadClick}
          onNewFolderClick={handleNewFolderClick}
        />
      )}

      {/* File grid or list */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'grid' ? (
          <FileGrid
            folders={folders}
            files={files}
            onContextMenu={handleContextMenu}
            onRename={handleRename}
            onFileOpen={handleFileOpen}
          />
        ) : (
          <FileList
            folders={folders}
            files={files}
            onContextMenu={handleContextMenu}
            onFileOpen={handleFileOpen}
          />
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextMenu.item}
          isFolder={contextMenu.isFolder}
          selectedCount={selectedIds.size}
          onClose={() => setContextMenu(null)}
          onAction={handleContextAction}
        />
      )}

      {/* Move dialog */}
      <MoveDialog
        isOpen={moveDialog.isOpen}
        onClose={() => setMoveDialog({ isOpen: false, items: [], itemName: '' })}
        onMove={handleMove}
        itemName={moveDialog.itemName}
      />

      {/* File viewer */}
      {viewerFile && (
        <FileViewer
          file={viewerFile}
          files={files}
          onClose={() => setViewerFile(null)}
          onNavigate={handleViewerNavigate}
        />
      )}
    </div>
  );
}
