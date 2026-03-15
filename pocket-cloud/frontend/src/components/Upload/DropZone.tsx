import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileText } from 'lucide-react';

interface DropZoneProps {
  onFilesDropped: (files: File[]) => void;
  isOverlay?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const DropZone: React.FC<DropZoneProps> = ({ 
  onFilesDropped, 
  isOverlay = false, 
  className = '',
  children 
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setDragCounter(prev => prev + 1);
    
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setDragCounter(prev => {
      const newCounter = prev - 1;
      if (newCounter === 0) {
        setIsDragOver(false);
      }
      return newCounter;
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragOver(false);
    setDragCounter(0);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onFilesDropped(files);
    }
  }, [onFilesDropped]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFilesDropped(files);
    }
    // Reset input value to allow selecting the same file again
    e.target.value = '';
  }, [onFilesDropped]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  if (isOverlay) {
    return (
      <div
        className={`
          fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center
          ${isDragOver ? 'opacity-100' : 'opacity-0 pointer-events-none'}
          transition-opacity duration-200
        `}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8 border-2 border-dashed border-pcd-blue-500 max-w-md mx-4">
          <div className="text-center">
            <Upload className="w-16 h-16 text-pcd-blue-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Drop files here
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Release to upload your files
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`
        relative border-2 border-dashed rounded-lg transition-all duration-200 cursor-pointer
        ${isDragOver 
          ? 'border-pcd-blue-500 bg-pcd-blue-50 dark:bg-pcd-blue-900/20' 
          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
        }
        ${className}
      `}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
      
      {children || (
        <div className="p-8 text-center">
          <Upload className={`
            w-12 h-12 mx-auto mb-4 transition-colors
            ${isDragOver ? 'text-pcd-blue-500' : 'text-gray-400 dark:text-gray-500'}
          `} />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {isDragOver ? 'Drop files here' : 'Upload files'}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {isDragOver 
              ? 'Release to upload' 
              : 'Drag and drop files here, or click to select files'
            }
          </p>
          <button className="
            inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium 
            rounded-md text-white bg-pcd-blue-600 hover:bg-pcd-blue-700 focus:outline-none 
            focus:ring-2 focus:ring-offset-2 focus:ring-pcd-blue-500 transition-colors
          ">
            <FileText className="w-4 h-4 mr-2" />
            Choose Files
          </button>
        </div>
      )}
    </div>
  );
};

export default DropZone;