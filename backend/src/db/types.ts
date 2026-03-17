export interface User {
  id: string;
  username: string;
  password_hash: string;
  role: 'admin' | 'user';
  quota_bytes: number | null;
  is_active: number;
  created_at: number;
  last_login: number | null;
}

export interface Session {
  id: string;
  user_id: string;
  token_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: number;
  expires_at: number;
}

export interface Folder {
  id: string;
  owner_id: string;
  parent_id: string | null;
  name: string;
  path: string;
  is_deleted: number;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface File {
  id: string;
  owner_id: string;
  folder_id: string | null;
  name: string;
  original_name: string;
  mime_type: string;
  size: number;
  storage_path: string;
  checksum: string;
  content_checksum?: string; // For deduplication - references content_store.checksum
  is_deleted: number;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
  version_count: number;
  current_version: number;
  content_preview?: string | null;
  // Encryption fields
  is_encrypted: number;
  encryption_salt?: string;
  encryption_iv?: string;
  encryption_hint?: string;
}

export interface FileVersion {
  id: string;
  file_id: string;
  version_num: number;
  size: number;
  checksum: string;
  storage_path: string;
  created_by: string;
  created_at: number;
  label: string | null;
  is_current: number;
}

export interface UploadSession {
  id: string;
  user_id: string;
  folder_id: string | null;
  filename: string;
  mime_type: string;
  total_size: number;
  chunk_size: number;
  total_chunks: number;
  received_chunks: string;
  checksum: string;
  temp_dir: string;
  created_at: number;
  expires_at: number;
  status: string; // 'active' | 'interrupted'
}

export interface NetworkConfig {
  id: number;
  mode: 'hotspot' | 'client' | 'ethernet';
  hotspot_ssid: string;
  hotspot_password: string;
  hotspot_channel: number;
  client_ssid: string | null;
  client_ip: string | null;
  ethernet_ip: string | null;
  keep_hotspot: number;
  updated_at: number;
}

export interface Share {
  id: string;
  owner_id: string;
  file_id: string | null;
  folder_id: string | null;
  token: string;
  password_hash: string | null;
  expires_at: number | null;
  max_downloads: number | null;
  download_count: number;
  allow_upload: number;
  label: string | null;
  created_at: number;
  last_accessed: number | null;
}

export interface ActivityLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  resource_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  details: string | null;
  created_at: number;
}

export interface Vault {
  id: string;
  owner_id: string;
  folder_id: string;
  salt: string;
  hint: string | null;
  created_at: number;
}

export interface ContentStore {
  checksum: string;
  storage_path: string;
  size: number;
  ref_count: number;
  created_at: number;
}

export interface Tag {
  id: string;
  owner_id: string;
  name: string;
  color: string;
  created_at: number;
}

export interface FileTag {
  file_id: string;
  tag_id: string;
  added_at: number;
}

export interface BulkJob {
  id: string;
  user_id: string;
  operation: 'move' | 'copy' | 'delete' | 'tag' | 'untag';
  status: 'running' | 'complete' | 'failed';
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  errors: string; // JSON array of {itemId, error}
  created_at: number;
  completed_at: number | null;
}

export interface BackupDevice {
  id: string;
  user_id: string;
  device_name: string;
  device_os: 'ios' | 'android';
  last_seen: number | null;
  last_backup: number | null;
  total_backed_up: number;
  created_at: number;
}

export interface BackupManifest {
  device_id: string;
  local_id: string;
  file_id: string | null;
  checksum: string;
  backed_up_at: number;
}

export interface Webhook {
  id: string;
  user_id: string;
  name: string;
  url: string;
  secret: string;
  events: string; // JSON array
  is_active: number;
  fail_count: number;
  last_fired: number | null;
  last_status: number | null;
  created_at: number;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: string;
  http_status: number | null;
  response: string | null;
  duration_ms: number | null;
  success: number;
  delivered_at: number;
  retry_count: number;
}