import React, { useState, useRef, useCallback } from 'react';
import { 
  FileText, 
  Image, 
  Video, 
  Music, 
  Archive, 
  File as FileIcon,
  Folder,
  Check
} from 'lucide-react';
import { FileItem, FolderItem } from '../../types/files';

interface FileCardProps {
  item: FileItem | FolderItem;
  isSelected: boolean;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onDoubleClick: (item: FileItem | FolderItem) => void;
  onContextMenu: (event: React.MouseEvent, item: FileItem | FolderItem) => void;
  onHover?: (item: FileItem | FolderItem) => void;
}

// Memoized file size formatter
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Memoized date formatter
const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString();
};

// Memoized icon selector
const getFileIcon = (item: FileItem | FolderItem) => {
  const isFolder = 'path' in item;
  if (isFolder) return Folder;
  
  const fileItem = item as FileItem;
  const mimeType = fileItem.mime_type;
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.startsWith('video/')) return Video;
  if (mimeType.startsWith('audio/')) return Music;
  if (mimeType.includes('pdf') || mimeType.includes('document')) return FileText;
  if (mimeType.includes('zip') || mimeType.includes('archive')) return Archive;
  return FileIcon;
};

const FileCard: React.FC<FileCardProps> = React.memo(({
  item,
  isSelected,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onHover,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const isFolder = 'path' in item;
  const fileItem = item as FileItem;

  // Memoized event handlers
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    if (onHover) {
      onHover(item);
    }
  }, [item, onHover]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    onSelect(item.id, e);
  }, [item.id, onSelect]);

  const handleDoubleClick = useCallback(() => {
    onDoubleClick(item);
  }, [item, onDoubleClick]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    onContextMenu(e, item);
  }, [item, onContextMenu]);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
  }, []);

  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  const shouldShowThumbnail = !isFolder && fileItem.mime_type?.startsWith('image/');
  const IconComponent = getFileIcon(item);

  return (
    <div
      ref={cardRef}
      className={`
        relative group cursor-pointer rounded-lg border-2 transition-all duration-200
        ${isSelected 
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
          : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'
        }
        ${isHovered ? 'shadow-md' : ''}
        bg-white dark:bg-gray-800 p-3
      `}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      {/* Selection checkbox */}
      {(isSelected || isHovered) && (
        <div className="absolute top-2 right-2 z-10">
          <div className={`
            w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
            ${isSelected 
              ? 'bg-blue-500 border-blue-500' 
              : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'
            }
          `}>
            {isSelected && <Check className="w-3 h-3 text-white" />}
          </div>
        </div>
      )}

      {/* Thumbnail or icon */}
      <div className="flex items-center justify-center h-20 mb-3">
        {shouldShowThumbnail && !imageError ? (
          <div className="relative w-full h-full">
            <img
              src={`/api/files/${fileItem.id}/thumbnail/small`}
              alt={item.name}
              className={`
                w-full h-full object-cover rounded transition-opacity duration-200
                ${imageLoaded ? 'opacity-100' : 'opacity-0'}
              `}
              onLoad={handleImageLoad}
              onError={handleImageError}
              loading="lazy"
            />
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <IconComponent className="w-8 h-8 text-gray-400 dark:text-gray-500" />
              </div>
            )}
          </div>
        ) : (
          <IconComponent className={`
            w-12 h-12 transition-colors
            ${isFolder 
              ? 'text-blue-500' 
              : 'text-gray-400 dark:text-gray-500'
            }
          `} />
        )}
      </div>

      {/* File name */}
      <div className="text-center">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate" title={item.name}>
          {item.name}
        </h3>
        
        {/* File details */}
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {isFolder ? (
            <span>Folder</span>
          ) : (
            <div className="space-y-0.5">
              <div>{formatFileSize(fileItem.size)}</div>
              <div>{formatDate(item.updated_at)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

FileCard.displayName = 'FileCard';

export default FileCard;