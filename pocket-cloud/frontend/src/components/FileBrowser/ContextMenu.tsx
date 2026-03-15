import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ContextMenuAction, ContextMenuPosition } from '../../types/files';

interface ContextMenuProps {
  actions: ContextMenuAction[];
  position: ContextMenuPosition;
  onClose: () => void;
  visible: boolean;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ actions, position, onClose, visible }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible, onClose]);

  useEffect(() => {
    if (visible && menuRef.current) {
      // Adjust position to keep menu within viewport
      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = position.x;
      let adjustedY = position.y;

      // Adjust horizontal position
      if (position.x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }

      // Adjust vertical position
      if (position.y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }

      menu.style.left = `${Math.max(10, adjustedX)}px`;
      menu.style.top = `${Math.max(10, adjustedY)}px`;
    }
  }, [visible, position]);

  if (!visible) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-48"
      style={{ left: position.x, top: position.y }}
    >
      {actions.map((action, index) => (
        <React.Fragment key={action.id}>
          {action.separator && index > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          )}
          <button
            onClick={() => {
              if (!action.disabled) {
                action.onClick();
                onClose();
              }
            }}
            disabled={action.disabled}
            className={`
              w-full flex items-center px-3 py-2 text-sm text-left transition-colors
              ${action.disabled
                ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }
            `}
          >
            <action.icon className="w-4 h-4 mr-3" />
            {action.label}
          </button>
        </React.Fragment>
      ))}
    </div>,
    document.body
  );
};

export default ContextMenu;