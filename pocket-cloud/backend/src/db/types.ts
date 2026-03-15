/**
 * TypeScript interfaces for database tables
 * Generated from schema.sql - keep in sync with database structure
 */

export interface User {
  id: number;
  username: string;
  email: string | null;
  password_hash: string;
  role: 'admin' | 'user';
  storage_quota: number | null;
  storage_used: number;
  is_active: number;
  last_login_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface CreateUserData {
  username: string;
  email?: string;
  password_hash: string;
  role?: 'admin' | 'user';
  storage_quota?: number | null;
}

export interface Session {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: number;
  ip_address: string | null;
  user_agent: string | null;
  created_at: number;
}

export interface CreateSessionData {
  user_id: number;
  token_hash: string;
  expires_at: number;
  ip_address?: string;
  user_agent?: string;
}

export interface File {
  id: number;
  uuid: string;
  name: string;
  path: string;
  full_path: string;
  mime_type: string | null;
  size: number;
  checksum: string | null;
  owner_id: number;
  parent_folder_id: number | null;
  is_encrypted: number;
  encryption_key_hash: string | null;
  thumbnail_path: string | null;
  metadata: string | null; // JSON string
  version: number;
  is_deleted: number;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface CreateFileData {
  uuid: string;
  name: string;
  path: string;
  full_path: string;
  mime_type?: string;
  size: number;
  checksum?: string;
  owner_id: number;
  parent_folder_id?: number | null;
  is_encrypted?: number;
  encryption_key_hash?: string;
  thumbnail_path?: string;
  metadata?: string;
}

export interface Folder {
  id: number;
  uuid: string;
  name: string;
  path: string;
  full_path: string;
  owner_id: number;
  parent_folder_id: number | null;
  is_deleted: number;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface CreateFolderData {
  uuid: string;
  name: string;
  path: string;
  full_path: string;
  owner_id: number;
  parent_folder_id?: number | null;
}

export interface Share {
  id: number;
  uuid: string;
  file_id: number | null;
  folder_id: number | null;
  owner_id: number;
  share_type: 'link' | 'password' | 'user';
  password_hash: string | null;
  allowed_user_id: number | null;
  download_limit: number | null;
  download_count: number;
  expires_at: number | null;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface CreateShareData {
  uuid: string;
  file_id?: number;
  folder_id?: number;
  owner_id: number;
  share_type?: 'link' | 'password' | 'user';
  password_hash?: string;
  allowed_user_id?: number;
  download_limit?: number;
  expires_at?: number;
}

export interface NetworkConfig {
  id: number;
  mode: 'hotspot' | 'client' | 'ethernet';
  hotspot_ssid: string;
  hotspot_password: string;
  client_ssid: string | null;
  client_password: string | null;
  hotspot_also_on: number;
  updated_at: number;
}

export interface UpdateNetworkConfigData {
  mode?: 'hotspot' | 'client' | 'ethernet';
  hotspot_ssid?: string;
  hotspot_password?: string;
  client_ssid?: string;
  client_password?: string;
  hotspot_also_on?: number;
}

export interface AuditLog {
  id: number;
  user_id: number | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: string | null; // JSON string
  ip_address: string | null;
  user_agent: string | null;
  success: number;
  error_message: string | null;
  created_at: number;
}

export interface CreateAuditLogData {
  user_id?: number;
  action: string;
  resource_type?: string;
  resource_id?: string;
  details?: string;
  ip_address?: string;
  user_agent?: string;
  success?: number;
  error_message?: string;
}

export interface FileVersion {
  id: number;
  file_id: number;
  version_number: number;
  size: number;
  checksum: string;
  storage_path: string;
  created_by: number;
  created_at: number;
}

export interface CreateFileVersionData {
  file_id: number;
  version_number: number;
  size: number;
  checksum: string;
  storage_path: string;
  created_by: number;
}

export interface MediaMetadata {
  id: number;
  file_id: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  bitrate: number | null;
  codec: string | null;
  framerate: number | null;
  has_audio: number;
  has_video: number;
  thumbnail_count: number;
  hls_playlist_path: string | null;
  transcode_status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: number;
  updated_at: number;
}

export interface CreateMediaMetadataData {
  file_id: number;
  duration?: number;
  width?: number;
  height?: number;
  bitrate?: number;
  codec?: string;
  framerate?: number;
  has_audio?: number;
  has_video?: number;
  thumbnail_count?: number;
  hls_playlist_path?: string;
  transcode_status?: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface SyncState {
  id: number;
  user_id: number;
  device_id: string;
  last_sync_at: number | null;
  sync_token: string | null;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface CreateSyncStateData {
  user_id: number;
  device_id: string;
  last_sync_at?: number;
  sync_token?: string;
  is_active?: number;
}

export interface ApiKey {
  id: number;
  key_hash: string;
  name: string;
  user_id: number;
  permissions: string; // JSON string
  last_used_at: number | null;
  expires_at: number | null;
  is_active: number;
  created_at: number;
}

export interface CreateApiKeyData {
  key_hash: string;
  name: string;
  user_id: number;
  permissions: string;
  expires_at?: number;
}

export interface Webhook {
  id: number;
  uuid: string;
  name: string;
  url: string;
  events: string; // JSON string
  secret: string | null;
  is_active: number;
  last_triggered_at: number | null;
  failure_count: number;
  created_by: number;
  created_at: number;
  updated_at: number;
}

export interface CreateWebhookData {
  uuid: string;
  name: string;
  url: string;
  events: string;
  secret?: string;
  created_by: number;
}

// Utility types for API responses
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// File system types
export interface FileSystemItem {
  id: number;
  uuid: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  size?: number;
  mime_type?: string;
  thumbnail_path?: string;
  is_encrypted?: boolean;
  created_at: number;
  updated_at: number;
}

export interface UploadProgress {
  fileId: string;
  filename: string;
  bytesUploaded: number;
  totalBytes: number;
  percentage: number;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
}

// Network types
export interface WiFiNetwork {
  ssid: string;
  signal_level: number;
  frequency: number;
  security: string;
  connected: boolean;
}

export interface NetworkStatus {
  mode: 'hotspot' | 'client' | 'ethernet';
  hotspot: {
    ssid: string;
    password: string;
    ip: string;
    connected_devices: number;
    active: boolean;
  };
  client: {
    ssid: string | null;
    ip: string | null;
    connected: boolean;
  };
  ethernet: {
    ip: string | null;
    connected: boolean;
  };
}

// System monitoring types
export interface SystemStats {
  cpu: {
    usage: number;
    temperature: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  storage: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  network: {
    bytes_sent: number;
    bytes_received: number;
  };
  uptime: number;
}