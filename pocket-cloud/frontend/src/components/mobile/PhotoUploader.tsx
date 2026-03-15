import React, { useState, useRef, useCallback } from 'react';
import { useFileUpload } from '../../hooks/useFileUpload';
import { useHapticFeedback } from '../../hooks/useMobileGestures';

interface PhotoUploaderProps {
  onClose: () => void;
  onUploadComplete?: (files: File[]) => void;
}

interface PhotoFile extends File {
  id: string;
  preview: string;
  selected: boolean;
  compressed?: File;
  originalSize: number;
  compressedSize?: number;
}

export const PhotoUploader: React.FC<PhotoUploaderProps> = ({ onClose, onUploadComplete }) => {
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [selectedCount, setSelectedCount] = useState(0);
  const [compressionEnabled, setCompressionEnabled] = useState(true);
  const [stripExif, setStripExif] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { files, isUploading, addFiles } = useFileUpload();
  const { light, success } = useHapticFeedback();

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setIsProcessing(true);
    
    const photoFiles: PhotoFile[] = await Promise.all(
      files.map(async (file, index) => {
        const id = `photo-${Date.now()}-${index}`;
        const preview = URL.createObjectURL(file);
        
        // Compress image if enabled
        let compressed: File | undefined;
        let compressedSize: number | undefined;
        
        if (compressionEnabled && file.type.startsWith('image/')) {
          compressed = await compressImage(file, 0.8, 1920);
          compressedSize = compressed.size;
        }

        return {
          ...file,
          id,
          preview,
          selected: false,
          compressed,
          originalSize: file.size,
          compressedSize
        } as PhotoFile;
      })
    );

    setPhotos(prev => [...prev, ...photoFiles]);
    setIsProcessing(false);
  }, [compressionEnabled]);

  const compressImage = async (file: File, quality: number, maxWidth: number): Promise<File> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const img = new Image();

      img.onload = () => {
        // Calculate new dimensions
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;

        // Draw and compress
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: file.lastModified
            });
            resolve(compressedFile);
          } else {
            resolve(file);
          }
        }, file.type, quality);
      };

      img.src = URL.createObjectURL(file);
    });
  };

  const stripExifData = async (file: File): Promise<File> => {
    if (!file.type.startsWith('image/')) return file;

    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const img = new Image();

      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const strippedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: file.lastModified
            });
            resolve(strippedFile);
          } else {
            resolve(file);
          }
        }, file.type, 0.95);
      };

      img.src = URL.createObjectURL(file);
    });
  };

  const togglePhotoSelection = (id: string) => {
    light(); // Haptic feedback
    
    setPhotos(prev => prev.map(photo => {
      if (photo.id === id) {
        const newSelected = !photo.selected;
        setSelectedCount(count => newSelected ? count + 1 : count - 1);
        return { ...photo, selected: newSelected };
      }
      return photo;
    }));
  };

  const selectAll = () => {
    light();
    setPhotos(prev => prev.map(photo => ({ ...photo, selected: true })));
    setSelectedCount(photos.length);
  };

  const deselectAll = () => {
    light();
    setPhotos(prev => prev.map(photo => ({ ...photo, selected: false })));
    setSelectedCount(0);
  };

  const handleUpload = async () => {
    const selectedPhotos = photos.filter(photo => photo.selected);
    if (selectedPhotos.length === 0) return;

    setIsProcessing(true);
    
    try {
      // Process files based on settings
      const filesToUpload = await Promise.all(
        selectedPhotos.map(async (photo) => {
          let fileToUpload = compressionEnabled && photo.compressed ? photo.compressed : photo;
          
          if (stripExif) {
            fileToUpload = await stripExifData(fileToUpload);
          }
          
          return fileToUpload;
        })
      );

      addFiles(filesToUpload);
      success(); // Success haptic feedback
      onUploadComplete?.(filesToUpload);
      onClose();
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end">
      <div className="bg-white dark:bg-gray-800 w-full max-h-[90vh] rounded-t-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            Cancel
          </button>
          <h2 className="text-lg font-semibold">Camera Roll</h2>
          <button
            onClick={handleUpload}
            disabled={selectedCount === 0 || isUploading || isProcessing}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg disabled:opacity-50"
          >
            Upload ({selectedCount})
          </button>
        </div>

        {/* Selection Controls */}
        <div className="p-4 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <div className="flex items-center justify-between mb-3">
            <div className="flex space-x-2">
              <button
                onClick={selectAll}
                className="text-blue-500 text-sm font-medium"
              >
                Select All
              </button>
              <button
                onClick={deselectAll}
                className="text-gray-500 text-sm font-medium"
              >
                Deselect All
              </button>
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {selectedCount} selected
            </span>
          </div>

          {/* Upload Options */}
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={compressionEnabled}
                onChange={(e) => setCompressionEnabled(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm">Compress images (saves bandwidth)</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={stripExif}
                onChange={(e) => setStripExif(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm">Remove location data</span>
            </label>
          </div>
        </div>

        {/* Photo Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {photos.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-500 mb-4">No photos selected</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-blue-500 text-white px-6 py-2 rounded-lg"
              >
                Choose Photos
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative aspect-square"
                  onClick={() => togglePhotoSelection(photo.id)}
                >
                  <img
                    src={photo.preview}
                    alt={photo.name}
                    className="w-full h-full object-cover rounded-lg"
                  />
                  
                  {/* Selection Overlay */}
                  <div className={`absolute inset-0 rounded-lg border-2 ${
                    photo.selected 
                      ? 'border-blue-500 bg-blue-500 bg-opacity-20' 
                      : 'border-transparent'
                  }`}>
                    {photo.selected && (
                      <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* File Size Info */}
                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 rounded-b-lg">
                    <div>{formatFileSize(photo.originalSize)}</div>
                    {compressionEnabled && photo.compressedSize && (
                      <div className="text-green-300">→ {formatFileSize(photo.compressedSize)}</div>
                    )}
                  </div>

                  {/* Upload Progress */}
                  {isUploading && photo.selected && (() => {
                    const uploadFile = files.find(f => f.file.name === photo.name);
                    return uploadFile && uploadFile.status === 'uploading' ? (
                      <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg">
                        <div className="text-white text-center">
                          <div className="text-sm">{Math.round(uploadFile.progress)}%</div>
                          <div className="w-12 h-1 bg-gray-600 rounded-full mt-1">
                            <div 
                              className="h-1 bg-blue-500 rounded-full transition-all"
                              style={{ width: `${uploadFile.progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add More Photos Button */}
        {photos.length > 0 && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 hover:border-blue-500 hover:text-blue-500"
            >
              Add More Photos
            </button>
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Android File System Access API */}
        {typeof (window as any).showDirectoryPicker === 'function' && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={async () => {
                try {
                  const dirHandle = await (window as any).showDirectoryPicker();
                  // Handle directory selection for sync
                  console.log('Selected directory:', dirHandle.name);
                } catch (error) {
                  console.log('User cancelled directory selection');
                }
              }}
              className="w-full py-3 border-2 border-dashed border-blue-300 dark:border-blue-600 rounded-lg text-blue-500 hover:border-blue-500 hover:text-blue-600"
            >
              📁 Choose Folder to Sync (Android Chrome)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};