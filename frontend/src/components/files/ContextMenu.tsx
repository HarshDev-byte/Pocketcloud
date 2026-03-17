import { useEffect, useRef, useState } from 'react';
import {
  Eye,
  Download,
  Share2,
  Edit3,
  FolderInput,
  Copy,
  History,
  Star,
  Lock,
  Shield,
  Trash2,
  Archive,
} from 'lucide-react';
import { FileItem, FolderItem } from '../../api/files.api';

interface ContextMenuProps {
  x: number;
  y: number;
  item: FileItem | FolderItem | null;
  isFolder: boolean;
  selectedCount: number;
  onClose: () => void;
  onAction: (action: string) => void;
}

export function ContextMenu({
  x,
  y,
  item,
  isFolder,
  selectedCount,
  onClose,
  onAction,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    // Adjust position to prevent overflow
    if (menuRef.current) {
      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      if (rect.right > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }

      if (rect.bottom > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }

      setPosition({ x: adjustedX, y: adjustedY });
    }
  }, [x, y]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  const handleAction = (action: string) => {
    onAction(action);
    onClose();
  };

  if (!item) return null;

  // Multiple items selected
  if (selectedCount > 1) {
    return (
      <div
        ref={menuRef}
        className="fixed z-50 w-56 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg py-1 animate-in fade-in zoom-in-95 duration-100"
        style={{ left: position.x, top: position.y }}
      >
        <MenuItem
          icon={Download}
          label={`Download all (${selectedCount} items)`}
          onClick={() => handleAction('download')}
        />
        <MenuDivider />
        <MenuItem
          icon={FolderInput}
          label="Move to..."
          onClick={() => handleAction('move')}
        />
        <MenuItem
          icon={Copy}
          label="Copy to..."
          onClick={() => handleAction('copy')}
        />
        <MenuItem
          icon={Star}
          label="Add tags..."
          onClick={() => handleAction('tag')}
        />
        <MenuDivider />
        <MenuItem
          icon={Trash2}
          label={`Delete all (${selectedCount} items)`}
          onClick={() => handleAction('delete')}
          danger
        />
      </div>
    );
  }

  // Single folder
  if (isFolder) {
    return (
      <div
        ref={menuRef}
        className="fixed z-50 w-56 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg py-1 animate-in fade-in zoom-in-95 duration-100"
        style={{ left: position.x, top: position.y }}
      >
        <MenuItem
          icon={Eye}
          label="Open"
          onClick={() => handleAction('open')}
        />
        <MenuItem
          icon={Archive}
          label="Download as ZIP"
          onClick={() => handleAction('download')}
        />
        <MenuDivider />
        <MenuItem
          icon={Share2}
          label="Share folder..."
          onClick={() => handleAction('share')}
        />
        <MenuDivider />
        <MenuItem
          icon={Edit3}
          label="Rename"
          shortcut="F2"
          onClick={() => handleAction('rename')}
        />
        <MenuItem
          icon={FolderInput}
          label="Move to..."
          onClick={() => handleAction('move')}
        />
        <MenuDivider />
        <MenuItem
          icon={Trash2}
          label="Delete"
          shortcut="Del"
          onClick={() => handleAction('delete')}
          danger
        />
      </div>
    );
  }

  // Single file
  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-56 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg py-1 animate-in fade-in zoom-in-95 duration-100"
      style={{ left: position.x, top: position.y }}
    >
      <MenuItem
        icon={Eye}
        label="Open / Preview"
        onClick={() => handleAction('open')}
      />
      <MenuItem
        icon={Download}
        label="Download"
        onClick={() => handleAction('download')}
      />
      <MenuDivider />
      <MenuItem
        icon={Share2}
        label="Share link..."
        onClick={() => handleAction('share')}
      />
      <MenuDivider />
      <MenuItem
        icon={Edit3}
        label="Rename"
        shortcut="F2"
        onClick={() => handleAction('rename')}
      />
      <MenuItem
        icon={FolderInput}
        label="Move to..."
        onClick={() => handleAction('move')}
      />
      <MenuItem
        icon={Copy}
        label="Copy to..."
        onClick={() => handleAction('copy')}
      />
      <MenuDivider />
      <MenuItem
        icon={History}
        label="Version history"
        onClick={() => handleAction('versions')}
      />
      <MenuItem
        icon={Star}
        label="Add to favorites"
        onClick={() => handleAction('favorite')}
      />
      <MenuDivider />
      <MenuItem
        icon={Lock}
        label="Lock file"
        onClick={() => handleAction('lock')}
      />
      <MenuItem
        icon={Shield}
        label="Encrypt"
        onClick={() => handleAction('encrypt')}
      />
      <MenuDivider />
      <MenuItem
        icon={Trash2}
        label="Delete"
        shortcut="Del"
        onClick={() => handleAction('delete')}
        danger
      />
    </div>
  );
}

interface MenuItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
}

function MenuItem({ icon: Icon, label, shortcut, onClick, danger }: MenuItemProps) {
  return (
    <button
      className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
        danger
          ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
          : 'text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'
      }`}
      onClick={onClick}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {shortcut && (
        <span className="text-xs text-surface-500 dark:text-surface-400">
          {shortcut}
        </span>
      )}
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 border-t border-surface-200 dark:border-surface-700" />;
}
