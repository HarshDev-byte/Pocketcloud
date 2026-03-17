import { apiGet, apiPost, apiPatch, apiDelete, api } from '../lib/api';

export interface FileItem {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  folder_id: string | null;
  owner_id: string;
  is_deleted: number;
  created_at: number;
  updated_at: number;
  checksum?: string;
  thumbnail_path?: string;
  dominant_color?: string;
  tags?: string[];
  exif_date?: number;
}

export interface FolderItem {
  id: string;
  name: string;
  parent_id: string | null;
  owner_id: string;
  is_deleted: number;
  created_at: number;
  updated_at: number;
  item_count?: number;
}

export interface FolderContents {
  folders: FolderItem[];
  files: FileItem[];
  currentFolder: FolderItem | null;
  breadcrumb: FolderItem[];
}

export const filesApi = {
  // Get folder contents
  getFolderContents: (folderId?: string) =>
    apiGet<FolderContents>(
      folderId ? `/api/files/folder/${folderId}` : '/api/files/folder'
    ),

  // Create folder
  createFolder: (name: string, parentId?: string) =>
    apiPost<FolderItem>('/api/files/folder', { name, parentId }),

  // Rename file/folder
  renameFile: (fileId: string, newName: string) =>
    apiPatch<FileItem>(`/api/files/${fileId}/rename`, { name: newName }),

  renameFolder: (folderId: string, newName: string) =>
    apiPatch<FolderItem>(`/api/files/folder/${folderId}/rename`, { name: newName }),

  // Move file/folder
  moveFile: (fileId: string, targetFolderId: string | null) =>
    apiPatch<FileItem>(`/api/files/${fileId}/move`, { folderId: targetFolderId }),

  // Note: Use bulkMove for moving folders

  // Copy file
  copyFile: (fileId: string, targetFolderId: string | null) =>
    apiPost<FileItem>(`/api/files/${fileId}/copy`, { folderId: targetFolderId }),

  // Delete file/folder (soft delete)
  deleteFile: (fileId: string) => apiDelete(`/api/files/${fileId}`),

  deleteFolder: (folderId: string) => apiDelete(`/api/files/folder/${folderId}`),

  // Bulk operations
  bulkDelete: (fileIds: string[], folderIds: string[]) => {
    const items = [
      ...fileIds.map(id => ({ id, type: 'file' as const })),
      ...folderIds.map(id => ({ id, type: 'folder' as const }))
    ];
    return apiPost('/api/bulk/delete', { items });
  },

  bulkMove: (fileIds: string[], folderIds: string[], targetFolderId: string | null) => {
    const items = [
      ...fileIds.map(id => ({ id, type: 'file' as const })),
      ...folderIds.map(id => ({ id, type: 'folder' as const }))
    ];
    return apiPost('/api/bulk/move', { items, targetFolderId });
  },

  bulkCopy: (fileIds: string[], targetFolderId: string | null) =>
    apiPost('/api/bulk/copy', { fileIds, targetFolderId }),

  // Download
  getDownloadUrl: (fileId: string) => `/api/files/${fileId}/download`,

  downloadMultiple: (fileIds: string[]) =>
    api.post('/api/bulk/download', { fileIds }, { responseType: 'blob' }),

  // Thumbnail
  getThumbnailUrl: (fileId: string, size: 'sm' | 'md' | 'lg' = 'sm') =>
    `/api/files/${fileId}/thumbnail?size=${size}`,

  // Tags
  addTags: (fileId: string, tags: string[]) =>
    apiPost(`/api/files/${fileId}/tags`, { tags }),

  removeTags: (fileId: string, tags: string[]) =>
    apiPost(`/api/files/${fileId}/tags/remove`, { tags }),

  // Favorites
  addToFavorites: (fileId: string) =>
    apiPost('/api/favorites', { fileId }),

  removeFromFavorites: (fileId: string) =>
    apiDelete(`/api/favorites/${fileId}`),
};
