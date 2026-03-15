import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, FolderOpen } from 'lucide-react';
import { useFileUpload } from '../hooks/useFileUpload';

interface UploadDropZoneProps {
  folderId?: string;
  onFilesDropped?: (files: File[]) => void;
  className?: string;
  children?: React.ReactNode;
}

const UploadDropZone: React.FC<UploadDropZoneProps> = ({
  folderId,
  onFilesDropped,
  className = '',
  children,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPageDragOver, setIsPageDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { addFiles } = useFileUpload({
    folderId,
  });

  // Handle files being dropped or selected
  const handleFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length > 0) {
      if (onFilesDropped) {
        onFilesDropped(fileArray);
      } else {
        addFiles(fileArray);
      }
    }
  }, [addFiles, onFilesDropped]);

  // Drag and drop handlers for the component
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  }, [handleFiles]);

  // Page-level drag and drop handlers
  const handlePageDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    
    // Check if dragged items contain files
    if (e.dataTransfer?.types.includes('Files')) {
      setIsPageDragOver(true);
    }
  }, []);

  const handlePageDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    
    if (dragCounterRef.current === 0) {
      setIsPageDragOver(false);
    }
  }, []);

  const handlePageDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  const handlePageDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsPageDragOver(false);
    
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
  }, [handleFiles]);

  // Click to upload handler
  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
    // Reset input value to allow selecting the same files again
    e.target.value = '';
  }, [handleFiles]);

  // Set up page-level drag and drop listeners
  useEffect(() => {
    const handlePageEvents = (e: DragEvent) => {
      // Prevent default browser behavior for file drops
      e.preventDefault();
    };

    document.addEventListener('dragenter', handlePageDragEnter);
    document.addEventListener('dragleave', handlePageDragLeave);
    document.addEventListener('dragover', handlePageDragOver);
    document.addEventListener('drop', handlePageDrop);
    
    // Prevent default browser file drop behavior
    document.addEventListener('dragover', handlePageEvents);
    document.addEventListener('drop', handlePageEvents);

    return () => {
      document.removeEventListener('dragenter', handlePageDragEnter);
      document.removeEventListener('dragleave', handlePageDragLeave);
      document.removeEventListener('dragover', handlePageDragOver);
      document.removeEventListener('drop', handlePageDrop);
      document.removeEventListener('dragover', handlePageEvents);
      document.removeEventListener('drop', handlePageEvents);
    };
  }, [handlePageDragEnter, handlePageDragLeave, handlePageDragOver, handlePageDrop]);

  // Get current folder name for display
  const getFolderName = () => {
    // This would typically come from the folder data
    // For now, we'll use a simple fallback
    return folderId ? 'this folder' : 'My Files';
  };

  if (children) {
    // Render as a wrapper around children
    return (
      <>
        <div
          className={className}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {children}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />

        {/* Page-level drop overlay */}
        {isPageDragOver && (
          <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-8 mx-4 max-w-md w-full border-4 border-dashed border-pcd-blue-500">
              <div className="text-center">
                <Upload className="w-16 h-16 text-pcd-blue-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  Drop files to upload
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Drop files to upload to {getFolderName()}
                </p>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Render as a standalone drop zone (empty state)
  return (
    <>
      <div
        className={`
          border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center
          transition-colors cursor-pointer hover:border-pcd-blue-500 hover:bg-pcd-blue-50 dark:hover:bg-pcd-blue-900/20
          ${isDragOver ? 'border-pcd-blue-500 bg-pcd-blue-50 dark:bg-pcd-blue-900/20' : ''}
          ${className}
        `}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-full">
              <Upload className="w-8 h-8 text-gray-400" />
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Upload files
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Drag and drop files here, or click to browse
            </p>
            
            <div className="flex items-center justify-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
              <div className="flex items-center space-x-1">
                <FolderOpen className="w-4 h-4" />
                <span>Any file type</span>
              </div>
              <div>•</div>
              <div>Up to 10GB per file</div>
            </div>
          </div>
          
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-pcd-blue-600 hover:bg-pcd-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pcd-blue-500"
          >
            <Upload className="w-4 h-4 mr-2" />
            Choose files
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Page-level drop overlay */}
      {isPageDragOver && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 mx-4 max-w-md w-full border-4 border-dashed border-pcd-blue-500">
            <div className="text-center">
              <Upload className="w-16 h-16 text-pcd-blue-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Drop files to upload
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Drop files to upload to {getFolderName()}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UploadDropZone;