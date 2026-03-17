import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { filesApi, FileItem, FolderItem } from '../api/files.api';
import { useUIStore } from '../store/ui.store';
import { toast } from '../components/ui';
import { useEffect } from 'react';

export function useFileBrowser() {
  const { folderId } = useParams<{ folderId?: string }>();
  const queryClient = useQueryClient();
  const { sortBy, sortDir, selectedIds, clearSelection } = useUIStore();

  // Fetch folder contents
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['folder', folderId],
    queryFn: () => filesApi.getFolderContents(folderId),
    staleTime: 10000, // 10 seconds
  });

  // Sort items client-side
  const sortedFiles = data?.files ? [...data.files].sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'size':
        comparison = a.size - b.size;
        break;
      case 'date':
        comparison = a.updated_at - b.updated_at;
        break;
      case 'type':
        comparison = a.mime_type.localeCompare(b.mime_type);
        break;
    }
    
    return sortDir === 'asc' ? comparison : -comparison;
  }) : [];

  const sortedFolders = data?.folders ? [...data.folders].sort((a, b) => {
    const comparison = a.name.localeCompare(b.name);
    return sortDir === 'asc' ? comparison : -comparison;
  }) : [];

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: (name: string) => filesApi.createFolder(name, folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folder', folderId] });
      toast.success('Folder created');
    },
    onError: () => {
      toast.error('Failed to create folder');
    },
  });

  // Rename mutations
  const renameFileMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      filesApi.renameFile(id, name),
    onMutate: async ({ id, name }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['folder', folderId] });
      const previous = queryClient.getQueryData(['folder', folderId]);
      
      queryClient.setQueryData(['folder', folderId], (old: any) => ({
        ...old,
        files: old.files.map((f: FileItem) =>
          f.id === id ? { ...f, name } : f
        ),
      }));
      
      return { previous };
    },
    onError: (_err, _variables, context) => {
      queryClient.setQueryData(['folder', folderId], context?.previous);
      toast.error('Failed to rename file');
    },
    onSuccess: () => {
      toast.success('File renamed');
    },
  });

  const renameFolderMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      filesApi.renameFolder(id, name),
    onMutate: async ({ id, name }) => {
      await queryClient.cancelQueries({ queryKey: ['folder', folderId] });
      const previous = queryClient.getQueryData(['folder', folderId]);
      
      queryClient.setQueryData(['folder', folderId], (old: any) => ({
        ...old,
        folders: old.folders.map((f: FolderItem) =>
          f.id === id ? { ...f, name } : f
        ),
      }));
      
      return { previous };
    },
    onError: (_err, _variables, context) => {
      queryClient.setQueryData(['folder', folderId], context?.previous);
      toast.error('Failed to rename folder');
    },
    onSuccess: () => {
      toast.success('Folder renamed');
    },
  });

  // Delete mutations
  const deleteFileMutation = useMutation({
    mutationFn: (fileId: string) => filesApi.deleteFile(fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folder', folderId] });
      clearSelection();
      toast.success('File moved to trash');
    },
    onError: () => {
      toast.error('Failed to delete file');
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (folderId: string) => filesApi.deleteFolder(folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folder', folderId] });
      clearSelection();
      toast.success('Folder moved to trash');
    },
    onError: () => {
      toast.error('Failed to delete folder');
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: ({ fileIds, folderIds }: { fileIds: string[]; folderIds: string[] }) =>
      filesApi.bulkDelete(fileIds, folderIds),
    onSuccess: (_, { fileIds, folderIds }) => {
      queryClient.invalidateQueries({ queryKey: ['folder', folderId] });
      clearSelection();
      const count = fileIds.length + folderIds.length;
      toast.success(`${count} item${count > 1 ? 's' : ''} moved to trash`);
    },
    onError: () => {
      toast.error('Failed to delete items');
    },
  });

  // Move mutations
  const moveFileMutation = useMutation({
    mutationFn: ({ fileId, targetFolderId }: { fileId: string; targetFolderId: string | null }) =>
      filesApi.moveFile(fileId, targetFolderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folder'] });
      clearSelection();
      toast.success('File moved');
    },
    onError: () => {
      toast.error('Failed to move file');
    },
  });

  const moveFolderMutation = useMutation({
    mutationFn: ({ folderId, targetFolderId }: { folderId: string; targetFolderId: string | null }) =>
      filesApi.bulkMove([], [folderId], targetFolderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folder'] });
      clearSelection();
      toast.success('Folder moved');
    },
    onError: () => {
      toast.error('Failed to move folder');
    },
  });

  const bulkMoveMutation = useMutation({
    mutationFn: ({
      fileIds,
      folderIds,
      targetFolderId,
    }: {
      fileIds: string[];
      folderIds: string[];
      targetFolderId: string | null;
    }) => filesApi.bulkMove(fileIds, folderIds, targetFolderId),
    onSuccess: (_, { fileIds, folderIds }) => {
      queryClient.invalidateQueries({ queryKey: ['folder'] });
      clearSelection();
      const count = fileIds.length + folderIds.length;
      toast.success(`${count} item${count > 1 ? 's' : ''} moved`);
    },
    onError: () => {
      toast.error('Failed to move items');
    },
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F2 - Rename
      if (e.key === 'F2' && selectedIds.size === 1) {
        e.preventDefault();
        // Trigger rename (handled by component)
      }

      // Delete - Soft delete
      if (e.key === 'Delete' && selectedIds.size > 0) {
        e.preventDefault();
        const fileIds: string[] = [];
        const folderIds: string[] = [];

        selectedIds.forEach((id) => {
          const isFile = sortedFiles.some((f) => f.id === id);
          if (isFile) {
            fileIds.push(id);
          } else {
            folderIds.push(id);
          }
        });

        if (fileIds.length + folderIds.length > 0) {
          bulkDeleteMutation.mutate({ fileIds, folderIds });
        }
      }

      // Escape - Clear selection
      if (e.key === 'Escape') {
        clearSelection();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, sortedFiles, sortedFolders]);

  return {
    // Data
    folders: sortedFolders,
    files: sortedFiles,
    currentFolder: data?.currentFolder || null,
    breadcrumb: data?.breadcrumb || [],
    isLoading,
    error,

    // Mutations
    createFolder: createFolderMutation.mutate,
    renameFile: renameFileMutation.mutate,
    renameFolder: renameFolderMutation.mutate,
    deleteFile: deleteFileMutation.mutate,
    deleteFolder: deleteFolderMutation.mutate,
    bulkDelete: bulkDeleteMutation.mutate,
    moveFile: moveFileMutation.mutate,
    moveFolder: moveFolderMutation.mutate,
    bulkMove: bulkMoveMutation.mutate,

    // Refetch
    refetch,
  };
}
