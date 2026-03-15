/**
 * Core types for Pocket Cloud Drive SDK
 */

export interface PocketCloudConfig {
  /** Base URL of the Pocket Cloud Drive instance */
  baseUrl: string;
  /** API key for authentication (preferred) */
  apiKey?: string;
  /** Username for session authentication */
  username?: string;
  /** Password for session authentication */
  password?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Number of retry attempts for failed requests (default: 3) */
  retries?: number;
  /** Custom headers to include with requests */
  headers?: Record<string, string>;
}

export interface File {
  id: string;
  name: string;
  originalName: string;
  size: number;
  mimeType: string;
  checksum: string;
  folderId: string | null;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
  deletedAt: number | null;
  versionCount: number;
  currentVersion: number;
  /** File path for display purposes */
  path?: string;
  /** Thumbnail URL if available */
  thumbnailUrl?: string;
  /** Preview URL if available */
  previewUrl?: string;
}

export interface Folder {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
  deletedAt: number | null;
  /** Number of files in folder */
  fileCount?: number;
  /** Number of subfolders */
  folderCount?: number;
  /** Total size of all files in folder */
  totalSize?: number;
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
  createdAt: number;
  lastLogin: number | null;
  isActive: boolean;
}

export interface Share {
  id: string;
  fileId: string;
  ownerId: string;
  token: string;
  password: string | null;
  expiresAt: number | null;
  downloadCount: number;
  maxDownloads: number | null;
  createdAt: number;
  isActive: boolean;
  /** Public share URL */
  url: string;
}

export interface UploadSession {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  folderId: string | null;
  chunkSize: number;
  totalChunks: number;
  receivedChunks: number[];
  createdAt: number;
}

export interface SearchResult {
  files: File[];
  folders: Folder[];
  total: number;
  query: string;
  took: number;
}

export interface StorageInfo {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usagePercentage: number;
  fileCount: number;
}

// Progress callback types
export interface ProgressEvent {
  /** Progress percentage (0-100) */
  percent: number;
  /** Transfer speed in bytes per second */
  speed: number;
  /** Estimated time remaining in seconds */
  eta: number;
  /** Bytes transferred */
  transferred: number;
  /** Total bytes */
  total: number;
}

export interface ChunkProgressEvent {
  /** Chunk index */
  index: number;
  /** Total number of chunks */
  total: number;
  /** Chunk size in bytes */
  size: number;
}

export interface DirectoryUploadProgress {
  /** Current file being uploaded */
  current: number;
  /** Total files to upload */
  total: number;
  /** Current file name */
  fileName: string;
  /** Overall progress percentage */
  percent: number;
}

// Upload options
export interface UploadOptions {
  /** Target folder ID */
  folderId?: string;
  /** Progress callback */
  onProgress?: (progress: ProgressEvent) => void;
  /** Chunk completion callback */
  onChunkComplete?: (chunk: ChunkProgressEvent) => void;
  /** Chunk size in bytes (default: 5MB) */
  chunkSize?: number;
  /** Number of concurrent chunk uploads (default: 3) */
  concurrency?: number;
  /** Whether to overwrite existing files (default: false) */
  overwrite?: boolean;
}

export interface DownloadOptions {
  /** Destination file path (Node.js only) */
  destination?: string;
  /** Progress callback */
  onProgress?: (progress: ProgressEvent) => void;
  /** Custom headers */
  headers?: Record<string, string>;
}

export interface DirectoryUploadOptions extends UploadOptions {
  /** Remote path prefix */
  remotePath?: string;
  /** Whether to upload recursively (default: true) */
  recursive?: boolean;
  /** File filter function */
  filter?: (filePath: string) => boolean;
  /** Directory progress callback */
  onDirectoryProgress?: (progress: DirectoryUploadProgress) => void;
}

// Realtime event types
export interface RealtimeEvent {
  type: string;
  timestamp: number;
  data: any;
}

export interface FileEvent extends RealtimeEvent {
  type: 'file:created' | 'file:updated' | 'file:deleted' | 'file:restored';
  data: {
    file: File;
    user: User;
  };
}

export interface FolderEvent extends RealtimeEvent {
  type: 'folder:created' | 'folder:updated' | 'folder:deleted';
  data: {
    folder: Folder;
    user: User;
  };
}

export interface UploadEvent extends RealtimeEvent {
  type: 'upload:started' | 'upload:progress' | 'upload:complete' | 'upload:failed';
  data: {
    uploadId: string;
    filename: string;
    percent?: number;
    speed?: number;
    eta?: number;
    error?: string;
  };
}

export interface SystemEvent extends RealtimeEvent {
  type: 'system:storage_warning' | 'system:thermal_warning';
  data: {
    message: string;
    severity: 'warning' | 'critical';
    details: any;
  };
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    requestId: string;
    timestamp: number;
    version: string;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      hasMore: boolean;
    };
  };
}

// Discovery types
export interface DiscoveredDevice {
  name: string;
  host: string;
  port: number;
  version: string;
  deviceId: string;
  capabilities: string[];
  discovered: number;
}

// Stream types
export interface StreamInfo {
  url: string;
  mimeType: string;
  duration?: number;
  bitrate?: number;
  resolution?: {
    width: number;
    height: number;
  };
}

// Error types for better error handling
export interface ErrorDetails {
  code: string;
  message: string;
  statusCode?: number;
  details?: any;
}

// File operation types
export interface MoveOptions {
  folderId?: string | null;
}

export interface CopyOptions {
  folderId?: string | null;
  name?: string;
}

export interface ListOptions {
  /** Folder ID to list (null for root) */
  folderId?: string | null;
  /** Page number (1-based) */
  page?: number;
  /** Items per page */
  limit?: number;
  /** Sort field */
  sortBy?: 'name' | 'size' | 'createdAt' | 'updatedAt';
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
  /** File type filter */
  mimeType?: string;
}

export interface SearchOptions {
  /** Search query */
  query: string;
  /** File type filter */
  mimeType?: string;
  /** Folder to search in */
  folderId?: string;
  /** Maximum results */
  limit?: number;
  /** Include file content in search */
  includeContent?: boolean;
}

// Webhook types
export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: number;
  lastFiredAt?: number;
  lastStatus?: number;
  failCount: number;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: string;
  status?: number;
  response?: string;
  durationMs?: number;
  createdAt: number;
  deliveredAt?: number;
}

// Version types
export interface FileVersion {
  id: string;
  fileId: string;
  version: number;
  size: number;
  checksum: string;
  storagePath: string;
  comment: string;
  createdAt: number;
  createdBy: string;
}