import { Star } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '../components/ui';
import { FileGrid } from '../components/files/FileGrid';
import { FileList } from '../components/files/FileList';
import { useUIStore } from '../store/ui.store';
import { api } from '../lib/api';
import { FileItem, FolderItem } from '../api/files.api';

export default function FavoritesPage() {
  const { viewMode } = useUIStore();

  const { data: favoritesData, isLoading } = useQuery({
    queryKey: ['favorites'],
    queryFn: async () => {
      const response = await api.get('/api/favorites');
      return response.data;
    },
  });

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-surface-600 dark:text-surface-400">Loading...</div>
      </div>
    );
  }

  const files = (favoritesData?.files || []) as FileItem[];
  const folders = (favoritesData?.folders || []) as FolderItem[];

  if (files.length === 0 && folders.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState
          icon={<Star className="w-12 h-12" />}
          title="No starred items"
          description="Star files and folders to find them here"
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6">
      <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-6">
        Starred Items
      </h1>

      <div className="flex-1 overflow-auto">
        {viewMode === 'grid' ? (
          <FileGrid
            folders={folders}
            files={files}
            onContextMenu={() => {}}
          />
        ) : (
          <FileList
            folders={folders}
            files={files}
            onContextMenu={() => {}}
          />
        )}
      </div>
    </div>
  );
}