/**
 * Pocket Cloud Drive SDK
 * Official JavaScript/TypeScript SDK for Pocket Cloud Drive
 */

// Main client
export { PocketCloudClient } from './client.js';

// Services
export { FileService } from './files.js';
export { FolderService } from './folders.js';
export { UploadService, Upload } from './upload.js';
export { SearchService } from './search.js';
export { ShareService } from './shares.js';
export { StreamService } from './stream.js';
export { RealtimeService } from './realtime.js';

// Types
export type {
  PocketCloudConfig,
  File,
  Folder,
  User,
  Share,
  UploadSession,
  SearchResult,
  StorageInfo,
  ProgressEvent,
  ChunkProgressEvent,
  DirectoryUploadProgress,
  UploadOptions,
  DownloadOptions,
  DirectoryUploadOptions,
  RealtimeEvent,
  FileEvent,
  FolderEvent,
  UploadEvent,
  SystemEvent,
  ApiResponse,
  DiscoveredDevice,
  StreamInfo,
  ErrorDetails,
  MoveOptions,
  CopyOptions,
  ListOptions,
  SearchOptions,
  Webhook,
  WebhookDelivery,
  FileVersion
} from './types.js';

// Errors
export {
  PocketCloudError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  QuotaExceededError,
  RateLimitError,
  NetworkError,
  ServerError,
  ValidationError,
  ConflictError,
  TimeoutError,
  StorageFullError,
  UploadCancelledError,
  createErrorFromResponse,
  createNetworkError,
  isPocketCloudError,
  isAuthenticationError,
  isAuthorizationError,
  isNotFoundError,
  isQuotaExceededError,
  isRateLimitError,
  isNetworkError,
  isServerError,
  isValidationError,
  isConflictError,
  isTimeoutError,
  isStorageFullError,
  isUploadCancelledError
} from './errors.js';

// Default export
export default PocketCloudClient;