import { useState } from 'react';
import { Folder, ChevronRight, Home } from 'lucide-react';
import { Modal, Button, Spinner } from '../ui';
import { useQuery } from '@tanstack/react-query';
import { filesApi } from '../../api/files.api';

interface MoveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onMove: (targetFolderId: string | null) => void;
  itemName: string;
}

export function MoveDialog({ isOpen, onClose, onMove, itemName }: MoveDialogProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['folder', currentFolderId],
    queryFn: () => filesApi.getFolderContents(currentFolderId || undefined),
    enabled: isOpen,
  });

  const handleMove = () => {
    onMove(selectedFolderId);
    onClose();
  };

  const handleFolderClick = (folderId: string) => {
    setCurrentFolderId(folderId);
    setSelectedFolderId(folderId);
  };

  const handleBreadcrumbClick = (folderId: string | null) => {
    setCurrentFolderId(folderId);
    setSelectedFolderId(folderId);
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={`Move "${itemName}"`}
      size="md"
    >
      <div className="space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm pb-3 border-b border-surface-200 dark:border-surface-700">
          <button
            onClick={() => handleBreadcrumbClick(null)}
            className="flex items-center gap-1 text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100 transition-colors"
          >
            <Home className="w-4 h-4" />
            <span>My Files</span>
          </button>

          {data?.breadcrumb.map((folder) => (
            <div key={folder.id} className="flex items-center gap-2">
              <ChevronRight className="w-4 h-4 text-surface-400 dark:text-surface-600" />
              <button
                onClick={() => handleBreadcrumbClick(folder.id)}
                className="text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100 transition-colors truncate max-w-[150px]"
              >
                {folder.name}
              </button>
            </div>
          ))}
        </div>

        {/* Folder list */}
        <div className="min-h-[300px] max-h-[400px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-[300px]">
              <Spinner size="lg" />
            </div>
          ) : data?.folders && data.folders.length > 0 ? (
            <div className="space-y-1">
              {data.folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => handleFolderClick(folder.id)}
                  onDoubleClick={() => handleFolderClick(folder.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    selectedFolderId === folder.id
                      ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
                      : 'hover:bg-surface-100 dark:hover:bg-surface-800'
                  }`}
                >
                  <Folder className="w-5 h-5 flex-shrink-0" />
                  <span className="flex-1 text-sm font-medium truncate">
                    {folder.name}
                  </span>
                  <ChevronRight className="w-4 h-4 text-surface-400 dark:text-surface-600" />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[300px] text-center">
              <Folder className="w-12 h-12 text-surface-400 dark:text-surface-600 mb-3" />
              <p className="text-sm text-surface-600 dark:text-surface-400">
                No folders here
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-surface-200 dark:border-surface-700">
          <div className="text-sm text-surface-600 dark:text-surface-400">
            {selectedFolderId === null
              ? 'Moving to: My Files (root)'
              : `Moving to: ${data?.currentFolder?.name || 'Selected folder'}`}
          </div>
          <div className="flex gap-2">
            <Button onClick={onClose} variant="secondary">
              Cancel
            </Button>
            <Button onClick={handleMove} variant="primary">
              Move Here
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
