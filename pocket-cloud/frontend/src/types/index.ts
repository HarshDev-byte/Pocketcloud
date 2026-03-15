// User types matching backend
export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
  created_at: number;
  last_login: number | null;
  is_active: number;
}

// API response types
export interface ApiResponse<T = any> {
  success?: boolean;
  error?: string;
  message?: string;
  data?: T;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  user: User;
  error?: string;
}

// File and folder types
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
  folder: FolderItem;
  subfolders: FolderItem[];
  files: FileItem[];
}

// Theme types
export type Theme = 'light' | 'dark' | 'system';