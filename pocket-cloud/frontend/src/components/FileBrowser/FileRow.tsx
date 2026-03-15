import React, { useState } from 'react';
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

interface FileRowProps {
  item: FileItem | FolderItem;
  isSelected: boolean;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onDoubleClick: (item: FileItem | FolderItem) => void;
  onContextMenu: (event: React.MouseEvent, item: FileItem | FolderItem) => void;
}

const FileRow: React.FC<FileRowProps> = ({
  item,
  isSelected,
  onSelect,
  onDoubleClick,
  onContextMenu,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const isFolder = 'path' in item;
  const fileItem = item as FileItem;

  const getFileIcon = () => {
    if (isFolder) return Folder;
    
    const mimeType = fileItem.mime_type;
    if (mimeType.startsWith('image/')) return Image;
    if (mimeType.startsWith('video/')) return Video;
    if (mimeType.startsWith('audio/')) return Music;
    if (mimeType.includes('pdf') || mimeType.includes('document')) return FileText;
    if (mimeType.includes('zip') || mimeType.includes('archive')) return Archive;
    return FileIcon;
  };

  const getFileType = () => {
    if (isFolder) return 'Folder';
    
    const mimeType = fileItem.mime_type;
    if (mimeType.startsWith('image/')) return 'Image';
    if (mimeType.startsWith('video/')) return 'Video';
    if (mimeType.startsWith('audio/')) return 'Audio';
    if (mimeType.includes('pdf')) return 'PDF';
    if (mimeType.includes('document')) return 'Document';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return 'Archive';
    return 'File';
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const IconComponent = getFileIcon();

  return (
    <tr
      className={`
        cursor-pointer transition-colors
        ${isSelected 
          ? 'bg-pcd-blue-50 dark:bg-pcd-blue-900/20' 
          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
        }
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => onSelect(item.id, e)}
      onDoubleClick={() => onDoubleClick(item)}
      onContextMenu={(e) => onContextMenu(e, item)}
    >
      {/* Selection checkbox */}
      <td className="w-8 px-3 py-2">
        {(isSelected || isHovered) && (
          <div className={`
            w-4 h-4 rounded border flex items-center justify-center transition-colors
            ${isSelected 
              ? 'bg-pcd-blue-500 border-pcd-blue-500' 
              : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'
            }
          `}>
            {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
          </div>
        )}
      </td>

      {/* Icon and name */}
      <td className="px-3 py-2">
        <div className="flex items-center space-x-3">
          <IconComponent className={`
            w-5 h-5 flex-shrink-0
            ${isFolder 
              ? 'text-pcd-blue-500' 
              : 'text-gray-400 dark:text-gray-500'
            }
          `} />
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {item.name}
          </span>
        </div>
      </td>

      {/* Type */}
      <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
        {getFileType()}
      </td>

      {/* Size */}
      <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
        {isFolder ? '—' : formatFileSize(fileItem.size)}
      </td>

      {/* Modified date */}
      <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
        {formatDate(item.updated_at)}
      </td>
    </tr>
  );
};

export default FileRow;