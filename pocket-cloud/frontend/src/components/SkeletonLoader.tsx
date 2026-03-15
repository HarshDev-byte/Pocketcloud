import React from 'react';

interface SkeletonLoaderProps {
  variant?: 'text' | 'rectangular' | 'circular' | 'card' | 'list-item';
  width?: string | number;
  height?: string | number;
  lines?: number;
  className?: string;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  variant = 'rectangular',
  width = '100%',
  height = '1rem',
  lines = 1,
  className = ''
}) => {
  const baseClasses = 'skeleton animate-pulse bg-gray-200 dark:bg-gray-700';
  
  const getVariantClasses = () => {
    switch (variant) {
      case 'text':
        return 'rounded h-4';
      case 'circular':
        return 'rounded-full';
      case 'rectangular':
        return 'rounded';
      case 'card':
        return 'rounded-lg';
      case 'list-item':
        return 'rounded-md';
      default:
        return 'rounded';
    }
  };

  const style = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  if (variant === 'text' && lines > 1) {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            className={`${baseClasses} ${getVariantClasses()}`}
            style={{
              ...style,
              width: index === lines - 1 ? '75%' : style.width, // Last line shorter
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`${baseClasses} ${getVariantClasses()} ${className}`}
      style={style}
    />
  );
};

// Pre-built skeleton components for common use cases
export const FileCardSkeleton: React.FC = () => (
  <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
    <div className="flex items-center space-x-3">
      <SkeletonLoader variant="rectangular" width={48} height={48} />
      <div className="flex-1 space-y-2">
        <SkeletonLoader variant="text" width="80%" height={16} />
        <SkeletonLoader variant="text" width="60%" height={14} />
      </div>
    </div>
  </div>
);

export const FileListSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => (
  <div className="space-y-2">
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} className="flex items-center space-x-3 p-3">
        <SkeletonLoader variant="rectangular" width={40} height={40} />
        <div className="flex-1 space-y-1">
          <SkeletonLoader variant="text" width="70%" height={16} />
          <SkeletonLoader variant="text" width="40%" height={12} />
        </div>
        <SkeletonLoader variant="rectangular" width={24} height={24} />
      </div>
    ))}
  </div>
);

export const FileGridSkeleton: React.FC<{ count?: number }> = ({ count = 8 }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} className="space-y-2">
        <SkeletonLoader variant="rectangular" width="100%" height={120} />
        <SkeletonLoader variant="text" width="80%" height={14} />
        <SkeletonLoader variant="text" width="60%" height={12} />
      </div>
    ))}
  </div>
);

export const MediaViewerSkeleton: React.FC = () => (
  <div className="flex items-center justify-center h-full bg-black">
    <div className="text-center space-y-4">
      <SkeletonLoader variant="rectangular" width={300} height={200} className="mx-auto" />
      <SkeletonLoader variant="text" width={200} height={16} className="mx-auto" />
    </div>
  </div>
);

export const UploadProgressSkeleton: React.FC = () => (
  <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
    <div className="flex items-center space-x-3">
      <SkeletonLoader variant="circular" width={40} height={40} />
      <div className="flex-1 space-y-2">
        <SkeletonLoader variant="text" width="60%" height={14} />
        <SkeletonLoader variant="rectangular" width="100%" height={8} />
      </div>
    </div>
  </div>
);

export default SkeletonLoader;