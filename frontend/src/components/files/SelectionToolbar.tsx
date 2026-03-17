import { X, Download, FolderInput, Copy, Tag, Trash2 } from 'lucide-react';
import { Button } from '../ui';
import { useUIStore } from '../../store/ui.store';

interface SelectionToolbarProps {
  onDownload: () => void;
  onMove: () => void;
  onCopy: () => void;
  onTag: () => void;
  onDelete: () => void;
}

export function SelectionToolbar({
  onDownload,
  onMove,
  onCopy,
  onTag,
  onDelete,
}: SelectionToolbarProps) {
  const { selectedIds, clearSelection } = useUIStore();
  const count = selectedIds.size;

  if (count === 0) return null;

  return (
    <div className="mb-4 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-lg p-3 flex items-center gap-2 animate-in slide-in-from-top-2 duration-200">
      <button
        onClick={clearSelection}
        className="p-1 hover:bg-brand-100 dark:hover:bg-brand-800 rounded transition-colors"
        title="Clear selection"
      >
        <X className="w-4 h-4" />
      </button>

      <span className="text-sm font-medium text-surface-900 dark:text-surface-100">
        {count} selected
      </span>

      <div className="flex-1" />

      <Button onClick={onDownload} variant="secondary" size="sm">
        <Download className="w-4 h-4" />
        Download
      </Button>

      <Button onClick={onMove} variant="secondary" size="sm">
        <FolderInput className="w-4 h-4" />
        Move
      </Button>

      <Button onClick={onCopy} variant="secondary" size="sm">
        <Copy className="w-4 h-4" />
        Copy
      </Button>

      <Button onClick={onTag} variant="secondary" size="sm">
        <Tag className="w-4 h-4" />
        Tag
      </Button>

      <Button onClick={onDelete} variant="danger" size="sm">
        <Trash2 className="w-4 h-4" />
        Delete
      </Button>
    </div>
  );
}
