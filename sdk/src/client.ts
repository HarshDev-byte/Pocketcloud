/**
 * Main PocketCloudClient class
 */

import { PocketCloudConfig, ApiResponse, DiscoveredDevice } from './types.js';
import { createErrorFromResponse, createNetworkError, PocketCloudError } from './errors.js';
import { FileService } from './files.js';
import { FolderService } from './folders.js';
import { UploadService } from './upload.js';
import { SearchService } from './search.js';
import { ShareService } from './shares.js';
import { StreamService } from './stream.js';
import { RealtimeService } from './realtime.js';

/**
 * Main client for interacting with Pocket Cloud Drive
 * 
 * @example
 * ```typescript
 * // With API key (recommended)
 * const client = new PocketCloudClient({
 *   baseUrl: 'http://192.168.4.1:3000',
 *   apiKey: 'pcd_xxxxxxxxxxxx'
 * });
 * 
 * // With username/password
 * const client = new PocketCloudClient({
 *   baseUrl: 'http://pocketcloud.local:3000',
 *   username: 'alice',
 *   password: 'mypassword'
 * });
 * 
 * // Auto-discover device
 * const client = await PocketCloudClient.discover();
 * ```
 */
export class PocketCloudClient {
  private config: Required<PocketCloudConfig>;
  private sessionToken?: string;
  private _files?: FileService;
  private _folders?: FolderService;
  private _upload?: UploadService;
  private _search?: SearchService;
  private _shares?: ShareService;
  private _stream?: StreamService;
  private _realtime?: RealtimeService;

  constructor(config: PocketCloudConfig) {
    // Validate required config
    if (!config.baseUrl) {
      throw new PocketCloudError('baseUrl is required', 'INVALID_CONFIG');
    }

    if (!config.apiKey && (!config.username || !config.password)) {
      throw new PocketCloudError(
        'Either apiKey or username/password is required',
        'INVALID_CONFIG'
      );
    }

    // Set defaults
    this.config = {
      timeout: 30000,
      retries: 3,
      headers: {},
      ...config
    };

    // Normalize base URL
    this.config.baseUrl = this.config.baseUrl.replace(/\/$/, '');
  }

  /**
   * Auto-discover Pocket Cloud Drive devices on the local network
   * 
   * @example
   * ```typescript
   * const client = await PocketCloudClient.discover();
   * console.log('Connected to:', client.baseUrl);
   * ```
   */
  static async discover(options: {
    timeout?: number;
    apiKey?: string;
    username?: string;
    password?: string;
  } = {}): Promise<PocketCloudClient> {
    const timeout = options.timeout || 5000;
    const hosts = [
      'pocketcloud.local',
      '192.168.4.1',
      // Add common router IP ranges for subnet scan
      ...Array.from({ length: 254 }, (_, i) => `192.168.1.${i + 1}`),
      ...Array.from({ length: 254 }, (_, i) => `192.168.0.${i + 1}`),
    ];

    const discoveries = hosts.map(async (host) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(`http://${host}:3000/.well-known/pocketcloud`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const info = await response.json();
          return {
            host,
            port: 3000,
            info
          };
        }
      } catch (error) {
        // Ignore discovery failures
      }
      return null;
    });

    // Wait for first successful discovery
    const results = await Promise.allSettled(discoveries);
    const discovered = results
      .filter((result): result is PromiseFulfilledResult<any> => 
        result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value);

    if (discovered.length === 0) {
      throw new PocketCloudError(
        'No Pocket Cloud Drive devices found on local network',
        'DISCOVERY_FAILED'
      );
    }

    // Use first discovered device
    const device = discovered[0];
    const baseUrl = `http://${device.host}:${device.port}`;

    return new PocketCloudClient({
      baseUrl,
      apiKey: options.apiKey,
      username: options.username,
      password: options.password
    });
  }

  /**
   * Scan for all Pocket Cloud Drive devices on the network
   */
  static async scan(timeout: number = 5000): Promise<DiscoveredDevice[]> {
    const hosts = [
      'pocketcloud.local',
      '192.168.4.1',
      ...Array.from({ length: 254 }, (_, i) => `192.168.1.${i + 1}`),
      ...Array.from({ length: 254 }, (_, i) => `192.168.0.${i + 1}`),
    ];

    const discoveries = hosts.map(async (host): Promise<DiscoveredDevice | null> => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(`http://${host}:3000/.well-known/pocketcloud`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const info = await response.json();
          return {
            name: info.name || 'Pocket Cloud Drive',
            host,
            port: 3000,
            version: info.version || '1.0.0',
            deviceId: info.deviceId || 'unknown',
            capabilities: info.capabilities || [],
            discovered: Date.now()
          };
        }
      } catch (error) {
        // Ignore discovery failures
      }
      return null;
    });

    const results = await Promise.allSettled(discoveries);
    return results
      .filter((result): result is PromiseFulfilledResult<DiscoveredDevice> => 
        result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value);
  }

  /**
   * Test connection to the Pocket Cloud Drive instance
   */
  async ping(): Promise<{ success: boolean; latency: number; version: string }> {
    const start = Date.now();
    
    try {
      const response = await this.request('GET', '/api/health');
      const latency = Date.now() - start;
      
      return {
        success: true,
        latency,
        version: response.version || '1.0.0'
      };
    } catch (error) {
      return {
        success: false,
        latency: Date.now() - start,
        version: 'unknown'
      };
    }
  }

  /**
   * Authenticate with username/password (if not using API key)
   */
  async authenticate(): Promise<void> {
    if (this.config.apiKey) {
      // API key authentication doesn't need explicit auth
      return;
    }

    if (!this.config.username || !this.config.password) {
      throw new PocketCloudError(
        'Username and password required for authentication',
        'INVALID_CONFIG'
      );
    }

    const response = await this.request('POST', '/api/auth/login', {
      username: this.config.username,
      password: this.config.password
    });

    this.sessionToken = response.sessionToken;
  }

  /**
   * Make HTTP request to the API
   */
  async request<T = any>(
    method: string,
    path: string,
    data?: any,
    options: {
      headers?: Record<string, string>;
      timeout?: number;
      retries?: number;
    } = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const timeout = options.timeout || this.config.timeout;
    const retries = options.retries !== undefined ? options.retries : this.config.retries;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'PocketCloud-SDK/1.0.0',
      ...this.config.headers,
      ...options.headers
    };

    // Add authentication
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    } else if (this.sessionToken) {
      headers['Cookie'] = `pcd_session=${this.sessionToken}`;
    }

    let lastError: Error;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method,
          headers,
          body: data ? JSON.stringify(data) : undefined,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Handle response
        const contentType = response.headers.get('content-type');
        let responseData: any;

        if (contentType?.includes('application/json')) {
          responseData = await response.json();
        } else {
          responseData = await response.text();
        }

        if (!response.ok) {
          throw createErrorFromResponse(responseData, response.status);
        }

        // Return data from successful API response
        if (responseData && typeof responseData === 'object' && 'success' in responseData) {
          const apiResponse = responseData as ApiResponse<T>;
          if (!apiResponse.success) {
            throw createErrorFromResponse(apiResponse, response.status);
          }
          return apiResponse.data as T;
        }

        return responseData as T;

      } catch (error: any) {
        lastError = error;

        // Don't retry on certain errors
        if (error.statusCode === 401 || error.statusCode === 403 || error.statusCode === 404) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === retries) {
          break;
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // If we get here, all retries failed
    if (lastError instanceof PocketCloudError) {
      throw lastError;
    } else {
      throw createNetworkError(lastError);
    }
  }

  /**
   * Upload a file from various sources
   */
  async uploadFile(source: string | File | Buffer, options?: any): Promise<any> {
    return this.upload.file(source, options);
  }

  /**
   * Download a file
   */
  async downloadFile(fileId: string, options?: any): Promise<any> {
    return this.files.download(fileId, options);
  }

  // Service getters (lazy initialization)
  
  /**
   * File operations service
   */
  get files(): FileService {
    if (!this._files) {
      this._files = new FileService(this);
    }
    return this._files;
  }

  /**
   * Folder operations service
   */
  get folders(): FolderService {
    if (!this._folders) {
      this._folders = new FolderService(this);
    }
    return this._folders;
  }

  /**
   * Upload service
   */
  get upload(): UploadService {
    if (!this._upload) {
      this._upload = new UploadService(this);
    }
    return this._upload;
  }

  /**
   * Search service
   */
  get search(): SearchService {
    if (!this._search) {
      this._search = new SearchService(this);
    }
    return this._search;
  }

  /**
   * Share service
   */
  get shares(): ShareService {
    if (!this._shares) {
      this._shares = new ShareService(this);
    }
    return this._shares;
  }

  /**
   * Streaming service
   */
  get stream(): StreamService {
    if (!this._stream) {
      this._stream = new StreamService(this);
    }
    return this._stream;
  }

  /**
   * Real-time events service
   */
  get realtime(): RealtimeService {
    if (!this._realtime) {
      this._realtime = new RealtimeService(this);
    }
    return this._realtime;
  }

  /**
   * Get base URL
   */
  get baseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Get configuration
   */
  get configuration(): Readonly<Required<PocketCloudConfig>> {
    return { ...this.config };
  }
}