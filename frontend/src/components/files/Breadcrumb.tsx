import { ChevronRight, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import { FolderItem } from '../../api/files.api';

interface BreadcrumbProps {
  items: FolderItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-2 mb-4 text-sm">
      <Link
        to="/files"
        className="flex items-center gap-1 text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100 transition-colors"
      >
        <Home className="w-4 h-4" />
        <span>My Files</span>
      </Link>

      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <ChevronRight className="w-4 h-4 text-surface-400 dark:text-surface-600" />
          <Link
            to={`/files/${item.id}`}
            className="text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100 transition-colors truncate max-w-[200px]"
          >
            {item.name}
          </Link>
        </div>
      ))}
    </nav>
  );
}
