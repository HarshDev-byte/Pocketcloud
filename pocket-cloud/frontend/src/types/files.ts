// Extended file and folder types for the frontend
export interface FileItem {
  id: string;
  name: string;
  original_name: string;
  mime_type: string;
  size: number;
  checksum: string;
  folder_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface FolderItem {
  id: string;
  name: string;
  path: string;
  parent_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface FolderContents {
  folder?: FolderItem;
  subfolders: FolderItem[];
  files: FileItem[];
}

export interface BreadcrumbItem {
  id: string | null;
  name: string;
  path: string;
}

// Trash types
export interface TrashItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  mime_type?: string;
  original_location: string;
  deleted_at: number;
  days_until_purge: number;
}

export interface TrashContents {
  files: TrashItem[];
  folders: TrashItem[];
}

export interface TrashStats {
  itemCount: number;
  totalSize: number;
}

export type ViewMode = 'grid' | 'list';

export type SortField = 'name' | 'size' | 'modified' | 'type';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

// Upload types
export interface UploadFile {
  id: string;
  file: File;
  status: 'pending' | 'initializing' | 'uploading' | 'completing' | 'completed' | 'error' | 'paused';
  progress: number;
  speed: number; // bytes per second
  eta: number; // seconds
  error?: string;
  uploadId?: string;
  totalChunks?: number;
  uploadedChunks?: number[];
}

export interface UploadProgress {
  uploadId: string;
  received: number[];
  total: number;
  percentage: number;
}

// Context menu types
export interface ContextMenuAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  separator?: boolean;
}

export interface ContextMenuPosition {
  x: number;
  y: number;
}