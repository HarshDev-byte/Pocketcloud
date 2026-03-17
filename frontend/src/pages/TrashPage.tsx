import { useState } from 'react';
import { Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState } from '../components/ui';
import { FileGrid } from '../components/files/FileGrid';
import { FileList } from '../components/files/FileList';
import { useUIStore } from '../store/ui.store';
import { api } from '../lib/api';
import { toast } from '../components/ui';
import { formatFileSize } from '../lib/fileTypes';

interface TrashItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  mime_type?: string;
  size: number;
  deleted_at: number;
  days_until_purge: number;
  original_path: string;
}

interface TrashStats {
  total_items: number;
  total_size: number;
  oldest_item_days: number;
}

export default function TrashPage() {
  const queryClient = useQueryClient();
  const { viewMode } = useUIStore();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: TrashItem | null;
  } | null>(null);

  const { data: trashData, isLoading } = useQuery({
    queryKey: ['trash'],
    queryFn: async () => {
      const response = await api.get('/api/trash');
      return response.data;
    },
  });

  const { data: trashStats } = useQuery({
    queryKey: ['trash-stats'],
    queryFn: async () => {
      const response = await api.get('/api/trash/stats');
      return response.data as TrashStats;
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async ({ itemId, type }: { itemId: string; type: 'file' | 'folder' }) => {
      await api.post(`/api/trash/${itemId}/restore`, { type });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      queryClient.invalidateQueries({ queryKey: ['trash-stats'] });
      queryClient.invalidateQueries({ queryKey: ['folder'] });
      toast.success('Item restored successfully');
    },
    onError: () => {
      toast.error('Failed to restore item');
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await api.delete(`/api/trash/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      queryClient.invalidateQueries({ queryKey: ['trash-stats'] });
      toast.success('Item permanently deleted');
    },
    onError: () => {
      toast.error('Failed to delete item');
    },
  });

  const restoreAllMutation = useMutation({
    mutationFn: async () => {
      await api.post('/api/trash/restore-all');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      queryClient.invalidateQueries({ queryKey: ['trash-stats'] });
      queryClient.invalidateQueries({ queryKey: ['folder'] });
      toast.success('All items restored successfully');
    },
    onError: () => {
      toast.error('Failed to restore all items');
    },
  });

  const emptyTrashMutation = useMutation({
    mutationFn: async () => {
      await api.delete('/api/trash/empty');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] });
      queryClient.invalidateQueries({ queryKey: ['trash-stats'] });
      toast.success('Trash emptied successfully');
    },
    onError: () => {
      toast.error('Failed to empty trash');
    },
  });

  const handleContextMenu = (e: React.MouseEvent, item: any) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item,
    });
  };

  const handleContextAction = (action: string) => {
    if (!contextMenu?.item) return;

    const item = contextMenu.item;

    switch (action) {
      case 'restore':
        restoreMutation.mutate({ itemId: item.id, type: item.type });
        break;
      case 'delete':
        if (confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) {
          permanentDeleteMutation.mutate(item.id);
        }
        break;
    }

    setContextMenu(null);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-surface-600 dark:text-surface-400">Loading...</div>
      </div>
    );
  }

  const items = trashData?.items || [];

  if (items.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState
          icon={<Trash2 className="w-12 h-12" />}
          title="Trash is empty"
          description="Deleted files and folders will appear here"
        />
      </div>
    );
  }

  // Convert trash items to file/folder format for grid/list components
  const folders = items.filter((item: TrashItem) => item.type === 'folder').map((item: TrashItem) => ({
    ...item,
    parent_id: null,
    owner_id: '',
    is_deleted: 1,
    created_at: 0,
    updated_at: item.deleted_at,
  }));

  const files = items.filter((item: TrashItem) => item.type === 'file').map((item: TrashItem) => ({
    ...item,
    folder_id: null,
    owner_id: '',
    is_deleted: 1,
    created_at: 0,
    updated_at: item.deleted_at,
  }));

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
            Trash
          </h1>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                if (confirm('Restore all items from trash?')) {
                  restoreAllMutation.mutate();
                }
              }}
              variant="secondary"
              disabled={items.length === 0}
            >
              <RotateCcw className="w-4 h-4" />
              Restore All
            </Button>
            <Button
              onClick={() => {
                if (confirm('Permanently delete all items in trash? This cannot be undone.')) {
                  emptyTrashMutation.mutate();
                }
              }}
              variant="danger"
              disabled={items.length === 0}
            >
              <Trash2 className="w-4 h-4" />
              Empty Trash
            </Button>
          </div>
        </div>

        {/* Stats */}
        {trashStats && (
          <div className="text-sm text-surface-600 dark:text-surface-400 mb-4">
            {trashStats.total_items} items · {formatFileSize(trashStats.total_size)} · 
            Oldest: deleted {trashStats.oldest_item_days} days ago
          </div>
        )}

        {/* Warning banner */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <span className="text-sm text-amber-800 dark:text-amber-200">
            Items are permanently deleted after 30 days
          </span>
        </div>
      </div>

      {/* File grid or list */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'grid' ? (
          <FileGrid
            folders={folders}
            files={files}
            onContextMenu={handleContextMenu}
          />
        ) : (
          <FileList
            folders={folders}
            files={files}
            onContextMenu={handleContextMenu}
          />
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 w-48 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => handleContextAction('restore')}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Restore
          </button>
          <button
            onClick={() => handleContextAction('delete')}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Permanently
          </button>
        </div>
      )}

      {/* Click outside to close context menu */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}