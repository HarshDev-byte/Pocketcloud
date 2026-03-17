import { Folder, ChevronUp, ChevronDown, MoreVertical } from 'lucide-react';
import { FileItem, FolderItem } from '../../api/files.api';
import { getFileTypeInfo, formatFileSize, formatRelativeTime } from '../../lib/fileTypes';
import { useUIStore } from '../../store/ui.store';
import { Checkbox, Badge } from '../ui';
import { useNavigate } from 'react-router-dom';

interface FileListProps {
  folders: FolderItem[];
  files: FileItem[];
  onContextMenu: (e: React.MouseEvent, item: FileItem | FolderItem, isFolder: boolean) => void;
  onFileOpen?: (file: FileItem) => void;
}

export function FileList({ folders, files, onContextMenu, onFileOpen }: FileListProps) {
  const navigate = useNavigate();
  const { selectedIds, selectItem, sortBy, sortDir, setSort } = useUIStore();

  const handleRowClick = (item: FileItem | FolderItem, _isFolder: boolean, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      selectItem(item.id, 'multi');
    } else if (e.shiftKey) {
      selectItem(item.id, 'range');
    } else {
      selectItem(item.id, 'single');
    }
  };

  const handleRowDoubleClick = (item: FileItem | FolderItem, isFolder: boolean) => {
    if (isFolder) {
      navigate(`/files/${item.id}`);
    } else {
      onFileOpen?.(item as FileItem);
    }
  };

  const handleSort = (column: 'name' | 'size' | 'date' | 'type') => {
    if (sortBy === column) {
      setSort(column, sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(column, 'asc');
    }
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) return null;
    return sortDir === 'asc' ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    );
  };

  return (
    <div className="border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-surface-50 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700">
          <tr>
            <th className="w-10 px-4 py-3">
              <Checkbox checked={false} onChange={() => {}} />
            </th>
            <th
              className="px-4 py-3 text-left text-xs font-medium text-surface-600 dark:text-surface-400 cursor-pointer hover:text-surface-900 dark:hover:text-surface-100"
              onClick={() => handleSort('name')}
            >
              <div className="flex items-center gap-2">
                Name
                <SortIcon column="name" />
              </div>
            </th>
            <th
              className="px-4 py-3 text-left text-xs font-medium text-surface-600 dark:text-surface-400 cursor-pointer hover:text-surface-900 dark:hover:text-surface-100 hidden md:table-cell"
              onClick={() => handleSort('type')}
            >
              <div className="flex items-center gap-2">
                Type
                <SortIcon column="type" />
              </div>
            </th>
            <th
              className="px-4 py-3 text-left text-xs font-medium text-surface-600 dark:text-surface-400 cursor-pointer hover:text-surface-900 dark:hover:text-surface-100"
              onClick={() => handleSort('size')}
            >
              <div className="flex items-center gap-2">
                Size
                <SortIcon column="size" />
              </div>
            </th>
            <th
              className="px-4 py-3 text-left text-xs font-medium text-surface-600 dark:text-surface-400 cursor-pointer hover:text-surface-900 dark:hover:text-surface-100"
              onClick={() => handleSort('date')}
            >
              <div className="flex items-center gap-2">
                Modified
                <SortIcon column="date" />
              </div>
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-surface-600 dark:text-surface-400 hidden lg:table-cell">
              Tags
            </th>
            <th className="w-10 px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {folders.map((folder) => (
            <FileListRow
              key={folder.id}
              item={folder}
              isFolder={true}
              isSelected={selectedIds.has(folder.id)}
              onClick={(e) => handleRowClick(folder, true, e)}
              onDoubleClick={() => handleRowDoubleClick(folder, true)}
              onContextMenu={(e) => onContextMenu(e, folder, true)}
            />
          ))}
          {files.map((file) => (
            <FileListRow
              key={file.id}
              item={file}
              isFolder={false}
              isSelected={selectedIds.has(file.id)}
              onClick={(e) => handleRowClick(file, false, e)}
              onDoubleClick={() => handleRowDoubleClick(file, false)}
              onContextMenu={(e) => onContextMenu(e, file, false)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface FileListRowProps {
  item: FileItem | FolderItem;
  isFolder: boolean;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function FileListRow({
  item,
  isFolder,
  isSelected,
  onClick,
  onDoubleClick,
  onContextMenu,
}: FileListRowProps) {
  const { selectItem } = useUIStore();
  const fileTypeInfo = !isFolder
    ? getFileTypeInfo((item as FileItem).mime_type, item.name)
    : null;

  return (
    <tr
      className={`border-b border-surface-200 dark:border-surface-700 last:border-b-0 cursor-pointer transition-colors ${
        isSelected
          ? 'bg-brand-50 dark:bg-brand-900/20'
          : 'hover:bg-surface-50 dark:hover:bg-surface-800/50'
      }`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <td className="px-4 py-3">
        <Checkbox
          checked={isSelected}
          onChange={() => selectItem(item.id, 'multi')}
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {isFolder ? (
            <Folder className="w-5 h-5 text-brand-500 flex-shrink-0" />
          ) : (
            fileTypeInfo && (
              <fileTypeInfo.icon
                className={`w-5 h-5 ${fileTypeInfo.color} flex-shrink-0`}
              />
            )
          )}
          <span className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">
            {item.name}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-surface-600 dark:text-surface-400 hidden md:table-cell">
        {isFolder ? 'Folder' : fileTypeInfo?.label}
      </td>
      <td className="px-4 py-3 text-sm text-surface-600 dark:text-surface-400">
        {isFolder ? '—' : formatFileSize((item as FileItem).size)}
      </td>
      <td className="px-4 py-3 text-sm text-surface-600 dark:text-surface-400">
        {formatRelativeTime(item.updated_at)}
      </td>
      <td className="px-4 py-3 hidden lg:table-cell">
        {!isFolder && (item as FileItem).tags && (item as FileItem).tags!.length > 0 && (
          <div className="flex flex-wrap gap-1">
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
      </td>
      <td className="px-4 py-3">
        <button
          className="p-1 rounded hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onContextMenu(e);
          }}
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}
