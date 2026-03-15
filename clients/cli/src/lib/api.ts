/**
 * Typed API client for PocketCloud backend
 * Handles authentication, cookies, and HTTP requests
 */

import fetch, { Response } from 'node-fetch';
import { config } from './config';
import chalk from 'chalk';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface FileInfo {
  id: string;
  name: string;
  path: string;
  size: number;
  type: 'file' | 'directory';
  mimeType?: string;
  createdAt: string;
  updatedAt: string;
  permissions?: string;
}

export interface StorageInfo {
  total: number;
  used: number;
  free: number;
  percentage: number;
}

export interface SystemStatus {
  status: 'ok' | 'error';
  version: string;
  uptime: number;
  storage: StorageInfo;
  cpu: number;
  memory: number;
  temperature?: number;
}

export interface ShareInfo {
  id: string;
  url: string;
  path: string;
  expires?: string;
  password?: boolean;
  readOnly: boolean;
  downloads: number;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  path: string;
  ip: string;
  userAgent?: string;
}

class ApiClient {
  private baseUrl: string = '';
  private token: string = '';
  private cookies: string = '';

  constructor() {
    this.updateConfig();
  }

  public updateConfig(): void {
    this.baseUrl = config.getConnectionUrl();
    this.token = config.get('token') || '';
  }

  private async request<T = any>(
    endpoint: string,
    options: {
      method?: string;
      body?: any;
      headers?: Record<string, string>;
      timeout?: number;
    } = {}
  ): Promise<ApiResponse<T>> {
    const {
      method = 'GET',
      body,
      headers = {},
      timeout = 30000
    } = options;

    const url = `${this.baseUrl}/api${endpoint}`;
    
    // Add authentication
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    if (this.cookies) {
      headers['Cookie'] = this.cookies;
    }

    // Add content type for JSON requests
    if (body && typeof body === 'object' && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method,
        headers,
        body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Update cookies from response
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) {
        this.cookies = setCookie;
      }

      const contentType = response.headers.get('content-type');
      let data: any;

      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        return {
          success: false,
          error: data.error || data.message || `HTTP ${response.status}`,
          data
        };
      }

      return {
        success: true,
        data
      };

    } catch (error: any) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timeout'
        };
      }

      return {
        success: false,
        error: error.message || 'Network error'
      };
    }
  }

  // Authentication
  public async login(username: string, password: string): Promise<ApiResponse<{ token: string }>> {
    const response = await this.request<{ token: string }>('/auth/login', {
      method: 'POST',
      body: { username, password }
    });

    if (response.success && response.data?.token) {
      this.token = response.data.token;
      config.set('token', this.token);
    }

    return response;
  }

  public async logout(): Promise<ApiResponse> {
    const response = await this.request('/auth/logout', { method: 'POST' });
    
    this.token = '';
    this.cookies = '';
    config.set('token', undefined);
    
    return response;
  }

  // File operations
  public async listFiles(path: string = '/'): Promise<ApiResponse<FileInfo[]>> {
    return this.request<FileInfo[]>(`/files?path=${encodeURIComponent(path)}`);
  }

  public async getFileInfo(path: string): Promise<ApiResponse<FileInfo>> {
    return this.request<FileInfo>(`/files/info?path=${encodeURIComponent(path)}`);
  }

  public async createFolder(path: string, name: string): Promise<ApiResponse> {
    return this.request('/files/folder', {
      method: 'POST',
      body: { path, name }
    });
  }

  public async deleteFile(path: string, permanent: boolean = false): Promise<ApiResponse> {
    return this.request('/files', {
      method: 'DELETE',
      body: { path, permanent }
    });
  }

  public async moveFile(src: string, dst: string): Promise<ApiResponse> {
    return this.request('/files/move', {
      method: 'POST',
      body: { src, dst }
    });
  }

  public async copyFile(src: string, dst: string): Promise<ApiResponse> {
    return this.request('/files/copy', {
      method: 'POST',
      body: { src, dst }
    });
  }

  // System status
  public async getStatus(): Promise<ApiResponse<SystemStatus>> {
    return this.request<SystemStatus>('/health');
  }

  public async getStorageInfo(): Promise<ApiResponse<StorageInfo>> {
    return this.request<StorageInfo>('/admin/storage');
  }

  // Search
  public async searchFiles(query: string, filters?: {
    type?: string;
    size?: string;
    modified?: string;
  }): Promise<ApiResponse<FileInfo[]>> {
    const params = new URLSearchParams({ q: query });
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
    }

    return this.request<FileInfo[]>(`/files/search?${params}`);
  }

  // Shares
  public async createShare(path: string, options: {
    expires?: number;
    password?: string;
    readOnly?: boolean;
  } = {}): Promise<ApiResponse<ShareInfo>> {
    return this.request<ShareInfo>('/shares', {
      method: 'POST',
      body: { path, ...options }
    });
  }

  public async getShares(): Promise<ApiResponse<ShareInfo[]>> {
    return this.request<ShareInfo[]>('/shares');
  }

  // Security features (Kali Linux)
  public async secureDelete(path: string, passes: number = 3): Promise<ApiResponse> {
    return this.request('/security/secure-delete', {
      method: 'POST',
      body: { path, passes }
    });
  }

  public async getAuditLog(filters?: {
    file?: string;
    user?: string;
    action?: string;
    days?: number;
  }): Promise<ApiResponse<AuditEntry[]>> {
    const params = new URLSearchParams();
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value.toString());
      });
    }

    return this.request<AuditEntry[]>(`/admin/audit?${params}`);
  }

  // Health check
  public async ping(): Promise<boolean> {
    try {
      const response = await this.request('/health', { timeout: 5000 });
      return response.success;
    } catch {
      return false;
    }
  }

  // Download URL
  public getDownloadUrl(path: string): string {
    return `${this.baseUrl}/api/files/download?path=${encodeURIComponent(path)}`;
  }

  // Upload URL
  public getUploadUrl(): string {
    return `${this.baseUrl}/api/upload`;
  }
}

export const api = new ApiClient();