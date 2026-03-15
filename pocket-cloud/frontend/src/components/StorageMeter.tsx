import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { HardDrive, Loader2 } from 'lucide-react';
import { apiClient } from '../api/client';

interface StorageStats {
  total: number;
  used: number;
  free: number;
  fileCount: number;
  breakdown: {
    images: number;
    videos: number;
    docs: number;
    other: number;
  };
}

const StorageMeter: React.FC = () => {
  const { data: stats, isLoading, error } = useQuery<StorageStats>({
    queryKey: ['storage-stats'],
    queryFn: async () => {
      const response = await apiClient.get('/storage/stats');
      return response.data.data;
    },
    refetchInterval: 60000, // Refetch every 60 seconds
    staleTime: 30000, // Consider data stale after 30 seconds
  });

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getUsagePercentage = (): number => {
    if (!stats || stats.total === 0) return 0;
    return (stats.used / stats.total) * 100;
  };

  const getUsageColor = (percentage: number): string => {
    if (percentage < 70) return 'bg-green-500';
    if (percentage < 90) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const getBreakdownPercentage = (categorySize: number): number => {
    if (!stats || stats.used === 0) return 0;
    return (categorySize / stats.used) * 100;
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <HardDrive className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Storage</span>
        </div>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <HardDrive className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Storage</span>
        </div>
        <div className="text-xs text-red-500 dark:text-red-400">
          Failed to load storage info
        </div>
      </div>
    );
  }

  const usagePercentage = getUsagePercentage();
  const usageColor = getUsageColor(usagePercentage);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center space-x-2">
        <HardDrive className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Storage</span>
      </div>

      {/* Main progress bar */}
      <div className="space-y-2">
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all duration-300 ${usageColor}`}
            style={{ width: `${Math.min(usagePercentage, 100)}%` }}
          />
        </div>
        
        <div className="flex justify-between items-center text-xs">
          <span className="text-gray-600 dark:text-gray-400">
            {Math.round(usagePercentage)}%
          </span>
          <span className="font-medium text-gray-900 dark:text-white">
            {formatBytes(stats.used)} of {formatBytes(stats.total)}
          </span>
        </div>
      </div>

      {/* Breakdown by file type */}
      <div className="space-y-2">
        {[
          { label: 'Images', size: stats.breakdown.images, color: 'bg-blue-500' },
          { label: 'Videos', size: stats.breakdown.videos, color: 'bg-purple-500' },
          { label: 'Docs', size: stats.breakdown.docs, color: 'bg-green-500' },
          { label: 'Other', size: stats.breakdown.other, color: 'bg-gray-500' },
        ].map(({ label, size, color }) => {
          const percentage = getBreakdownPercentage(size);
          
          if (size === 0) return null;
          
          return (
            <div key={label} className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2 flex-1 min-w-0">
                <div className={`w-3 h-2 rounded-sm ${color}`} />
                <span className="text-gray-600 dark:text-gray-400 truncate">{label}</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                  <div
                    className={`h-1 rounded-full ${color}`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>
                <span className="text-gray-900 dark:text-white font-medium w-12 text-right">
                  {formatBytes(size)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* File count */}
      <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center text-xs">
          <span className="text-gray-600 dark:text-gray-400">Files</span>
          <span className="text-gray-900 dark:text-white font-medium">
            {stats.fileCount.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Warning for high usage */}
      {usagePercentage >= 90 && (
        <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-xs text-red-700 dark:text-red-400">
            Storage is nearly full. Consider deleting unused files.
          </p>
        </div>
      )}

      {usagePercentage >= 70 && usagePercentage < 90 && (
        <div className="p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Storage is getting full. {formatBytes(stats.free)} remaining.
          </p>
        </div>
      )}
    </div>
  );
};

export default StorageMeter;