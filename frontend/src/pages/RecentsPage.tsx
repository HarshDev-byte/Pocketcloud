import { Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '../components/ui';
import { FileGrid } from '../components/files/FileGrid';
import { FileList } from '../components/files/FileList';
import { useUIStore } from '../store/ui.store';
import { api } from '../lib/api';
import { FileItem } from '../api/files.api';

export default function RecentsPage() {
  const { viewMode } = useUIStore();

  const { data: recentFiles, isLoading } = useQuery({
    queryKey: ['recent-files'],
    queryFn: async () => {
      const response = await api.get('/api/files/recent?limit=50');
      return response.data.files as FileItem[];
    },
  });

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-surface-600 dark:text-surface-400">Loading...</div>
      </div>
    );
  }

  const files = recentFiles || [];

  if (files.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState
          icon={<Clock className="w-12 h-12" />}
          title="No recent files"
          description="Files you access will appear here"
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6">
      <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-6">
        Recently Accessed
      </h1>

      <div className="flex-1 overflow-auto">
        {viewMode === 'grid' ? (
          <FileGrid
            folders={[]}
            files={files}
            onContextMenu={() => {}}
          />
        ) : (
          <FileList
            folders={[]}
            files={files}
            onContextMenu={() => {}}
          />
        )}
      </div>
    </div>
  );
}