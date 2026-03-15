import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { BreadcrumbItem } from '../../types/files';

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className = '' }) => {
  return (
    <nav className={`flex items-center space-x-1 text-sm ${className}`} aria-label="Breadcrumb">
      <ol className="flex items-center space-x-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const href = item.id ? `/files/${item.id}` : '/files';

          return (
            <li key={item.id || 'root'} className="flex items-center">
              {index > 0 && (
                <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 mx-1" />
              )}
              
              {isLast ? (
                <span className="text-gray-900 dark:text-white font-medium">
                  {index === 0 ? (
                    <span className="flex items-center">
                      <Home className="w-4 h-4 mr-1" />
                      {item.name}
                    </span>
                  ) : (
                    item.name
                  )}
                </span>
              ) : (
                <Link
                  to={href}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                  {index === 0 ? (
                    <span className="flex items-center">
                      <Home className="w-4 h-4 mr-1" />
                      {item.name}
                    </span>
                  ) : (
                    item.name
                  )}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumb;