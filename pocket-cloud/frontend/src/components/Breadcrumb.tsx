import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface BreadcrumbItem {
  id: string | null;
  name: string;
  path: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({ items }) => {
  const navigate = useNavigate();

  const handleItemClick = (item: BreadcrumbItem) => {
    if (item.id === null) {
      // Root folder
      navigate('/files');
    } else {
      navigate(item.path);
    }
  };

  return (
    <nav className="flex items-center space-x-1 text-sm" aria-label="Breadcrumb">
      <ol className="flex items-center space-x-1">
        {items.map((item, index) => (
          <li key={item.id || 'root'} className="flex items-center">
            {index > 0 && (
              <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 mx-1" />
            )}
            
            <button
              onClick={() => handleItemClick(item)}
              className={`
                flex items-center space-x-1 px-2 py-1 rounded-md transition-colors min-h-touch
                ${index === items.length - 1
                  ? 'text-gray-900 dark:text-white font-medium cursor-default'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                }
              `}
              disabled={index === items.length - 1}
            >
              {item.id === null && (
                <Home className="w-4 h-4" />
              )}
              <span className="truncate max-w-[150px] sm:max-w-[200px]">
                {item.name}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumb;