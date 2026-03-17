import { useState, useEffect, useCallback } from 'react';
import { CloudUpload } from 'lucide-react';

interface DropZoneProps {
  onFilesDropped: (files: File[], folderId: string | null) => void;
  currentFolderId: string | null;
  currentFolderName: string;
}

export function DropZone({ onFilesDropped, currentFolderId, currentFolderName }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [, setDragCounter] = useState(0);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if dragging files
    if (e.dataTransfer?.types.includes('Files')) {
      setDragCounter(prev => prev + 1);
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setDragCounter(prev => {
      const next = prev - 1;
      if (next === 0) {
        setIsDragging(false);
      }
      return next;
    });
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragging(false);
    setDragCounter(0);

    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) {
      onFilesDropped(files, currentFolderId);
    }
  }, [onFilesDropped, currentFolderId]);

  useEffect(() => {
    // Add global drag-and-drop listeners
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  if (!isDragging) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="max-w-lg w-full mx-4">
        <div className="bg-white dark:bg-surface-800 rounded-2xl p-12 border-4 border-dashed border-brand-500 shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="relative">
              <CloudUpload className="w-24 h-24 text-brand-500 animate-bounce" />
              <div className="absolute inset-0 bg-brand-500/20 rounded-full blur-2xl animate-pulse" />
            </div>

            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                Drop files to upload
              </h3>
              <p className="text-lg text-surface-600 dark:text-surface-400">
                to <span className="font-semibold text-brand-600 dark:text-brand-400">
                  {currentFolderName || 'My Files'}
                </span>
              </p>
            </div>

            <p className="text-sm text-surface-500 dark:text-surface-500">
              Or drop on a specific folder to upload there
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
