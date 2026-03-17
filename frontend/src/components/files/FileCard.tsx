import { useState, useRef, useEffect } from 'react';
import { Folder, MoreVertical } from 'lucide-react';
import { FileItem, FolderItem, filesApi } from '../../api/files.api';
import { getFileTypeInfo, formatFileSize, formatRelativeTime } from '../../lib/fileTypes';
import { useUIStore } from '../../store/ui.store';
import { Checkbox, Badge } from '../ui';
import { useNavigate } from 'react-router-dom';

interface FileCardProps {
  item: FileItem | FolderItem;
  isFolder: boolean;
  onContextMenu: (e: React.MouseEvent, item: FileItem | FolderItem, isFolder: boolean) => void;
  onRename?: (item: FileItem | FolderItem, isFolder: boolean) => void;
  onFileOpen?: (file: FileItem) => void;
}

export function FileCard({ item, isFolder, onContextMenu, onRename, onFileOpen }: FileCardProps) {
  const navigate = useNavigate();
  const { selectedIds, selectItem } = useUIStore();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(item.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const isSelected = selectedIds.has(item.id);
  const showCheckbox = isSelected || selectedIds.size > 0;

  // File type info for files
  const fileTypeInfo = !isFolder
    ? getFileTypeInfo((item as FileItem).mime_type, item.name)
    : null;

  const isImage =
    !isFolder && (item as FileItem).mime_type.startsWith('image/');

  const thumbnailUrl = isImage
    ? filesApi.getThumbnailUrl(item.id, 'sm')
    : null;

  const dominantColor = !isFolder
    ? (item as FileItem).dominant_color
    : null;

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      // Select filename without extension
      const dotIndex = newName.lastIndexOf('.');
      if (dotIndex > 0) {
        inputRef.current.setSelectionRange(0, dotIndex);
      } else {
        inputRef.current.select();
      }
    }
  }, [isRenaming]);

  const handleClick = (e: React.MouseEvent) => {
    if (isRenaming) return;

    if (e.ctrlKey || e.metaKey) {
      selectItem(item.id, 'multi');
    } else if (e.shiftKey) {
      selectItem(item.id, 'range');
    } else if (isSelected && selectedIds.size === 1) {
      // Click on already selected item - do nothing (allow drag)
    } else {
      selectItem(item.id, 'single');
    }
  };

  const handleDoubleClick = () => {
    if (isRenaming) return;

    if (isFolder) {
      navigate(`/files/${item.id}`);
    } else {
      // Open file viewer
      onFileOpen?.(item as FileItem);
    }
  };

  const handleNameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSelected && selectedIds.size === 1 && !isRenaming) {
      setIsRenaming(true);
    }
  };

  const handleRenameSubmit = () => {
    if (newName && newName !== item.name) {
      onRename?.(item, isFolder);
    }
    setIsRenaming(false);
    setNewName(item.name);
  };

  const handleRenameCancel = () => {
    setIsRenaming(false);
    setNewName(item.name);
  };

  return (
    <div
      className={`group relative rounded-lg border transition-all cursor-pointer ${
        isSelected
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 ring-2 ring-brand-500'
          : 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600 hover:bg-surface-50 dark:hover:bg-surface-800/50'
      }`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => onContextMenu(e, item, isFolder)}
    >
      {/* Checkbox */}
      {showCheckbox && (
        <div className="absolute top-2 left-2 z-10">
          <Checkbox
            checked={isSelected}
            onChange={() => selectItem(item.id, 'multi')}
          />
        </div>
      )}

      {/* Thumbnail/Icon */}
      <div className="aspect-square flex items-center justify-center p-4 relative overflow-hidden rounded-t-lg">
        {isFolder ? (
          <Folder className="w-16 h-16 text-brand-500" />
        ) : thumbnailUrl && !imageError ? (
          <>
            {/* Dominant color placeholder */}
            {dominantColor && !imageLoaded && (
              <div
                className="absolute inset-0"
                style={{ backgroundColor: dominantColor }}
              />
            )}
            {/* Thumbnail */}
            <img
              src={thumbnailUrl}
              alt={item.name}
              className={`w-full h-full object-cover transition-opacity duration-200 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          </>
        ) : (
          fileTypeInfo && (
            <fileTypeInfo.icon
              className={`w-16 h-16 ${fileTypeInfo.color}`}
            />
          )
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-1">
        {/* Name */}
        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') handleRenameCancel();
            }}
            className="w-full px-2 py-1 text-sm font-medium bg-white dark:bg-surface-800 border border-brand-500 rounded focus:outline-none focus:ring-2 focus:ring-brand-500"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div
            className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate"
            onClick={handleNameClick}
            title={item.name}
          >
            {item.name}
          </div>
        )}

        {/* Metadata */}
        <div className="flex items-center gap-2 text-xs text-surface-500 dark:text-surface-400">
          {isFolder ? (
            <span>
              {(item as FolderItem).item_count
                ? `${(item as FolderItem).item_count} items`
                : 'Empty'}
            </span>
          ) : (
            <>
              <span>{formatFileSize((item as FileItem).size)}</span>
              <span>•</span>
              <span>{formatRelativeTime(item.updated_at)}</span>
            </>
          )}
        </div>

        {/* Tags */}
        {!isFolder && (item as FileItem).tags && (item as FileItem).tags!.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {(item as FileItem).tags!.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="default" size="sm">
                {tag}
              </Badge>
            ))}
            {(item as FileItem).tags!.length > 2 && (
              <Badge variant="default" size="sm">
                +{(item as FileItem).tags!.length - 2}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Actions button */}
      <button
        className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-200 dark:hover:bg-surface-700 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onContextMenu(e, item, isFolder);
        }}
      >
        <MoreVertical className="w-4 h-4" />
      </button>
    </div>
  );
}
