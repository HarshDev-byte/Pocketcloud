import { Upload, FolderPlus, Grid3x3, List, ChevronDown } from 'lucide-react';
import { Button, Dropdown, DropdownItem } from '../ui';
import { useUIStore } from '../../store/ui.store';

interface ToolbarProps {
  onUploadClick: () => void;
  onNewFolderClick: () => void;
}

export function Toolbar({ onUploadClick, onNewFolderClick }: ToolbarProps) {
  const { viewMode, setViewMode, sortBy, sortDir, setSort } = useUIStore();

  const sortOptions = [
    { value: 'name', label: 'Name' },
    { value: 'date', label: 'Date Modified' },
    { value: 'size', label: 'Size' },
    { value: 'type', label: 'Type' },
  ];

  return (
    <div className="flex items-center gap-2 mb-4">
      <Button onClick={onUploadClick} variant="primary" size="sm">
        <Upload className="w-4 h-4" />
        Upload
      </Button>

      <Button onClick={onNewFolderClick} variant="secondary" size="sm">
        <FolderPlus className="w-4 h-4" />
        New Folder
      </Button>

      <div className="flex-1" />

      {/* View mode toggle */}
      <div className="flex items-center gap-1 bg-surface-100 dark:bg-surface-800 rounded-lg p-1">
        <button
          onClick={() => setViewMode('grid')}
          className={`p-1.5 rounded transition-colors ${
            viewMode === 'grid'
              ? 'bg-white dark:bg-surface-700 text-brand-600 dark:text-brand-400 shadow-sm'
              : 'text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100'
          }`}
          title="Grid view"
        >
          <Grid3x3 className="w-4 h-4" />
        </button>
        <button
          onClick={() => setViewMode('list')}
          className={`p-1.5 rounded transition-colors ${
            viewMode === 'list'
              ? 'bg-white dark:bg-surface-700 text-brand-600 dark:text-brand-400 shadow-sm'
              : 'text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100'
          }`}
          title="List view"
        >
          <List className="w-4 h-4" />
        </button>
      </div>

      {/* Sort dropdown */}
      <Dropdown
        trigger={
          <Button variant="secondary" size="sm">
            Sort: {sortOptions.find((o) => o.value === sortBy)?.label}
            <ChevronDown className="w-4 h-4 ml-1" />
          </Button>
        }
      >
        {sortOptions.map((option) => (
          <DropdownItem
            key={option.value}
            onClick={() => {
              if (sortBy === option.value) {
                setSort(sortBy, sortDir === 'asc' ? 'desc' : 'asc');
              } else {
                setSort(option.value as any, 'asc');
              }
            }}
          >
            {option.label}
            {sortBy === option.value && (
              <span className="ml-2 text-xs">
                {sortDir === 'asc' ? '↑' : '↓'}
              </span>
            )}
          </DropdownItem>
        ))}
      </Dropdown>
    </div>
  );
}
