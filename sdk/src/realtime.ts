/**
 * Real-time events service using WebSocket
 */

import { PocketCloudClient } from './client.js';
import { RealtimeEvent, FileEvent, FolderEvent, UploadEvent, SystemEvent } from './types.js';

/**
 * Event emitter for real-time events
 */
class EventEmitter {
  private listeners: Map<string, Function[]> = new Map();

  on(event: string, listener: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  off(event: string, listener: Function): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  emit(event: string, ...args: any[]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(...args);
        } catch (error) {
          console.error('Error in event listener:', error);
        }
      });
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

/**
 * Service for real-time events via WebSocket
 */
export class RealtimeService extends EventEmitter {
  private ws?: WebSocket;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private watchedFolders = new Set<string>();
  private isConnected = false;
  private shouldReconnect = true;

  constructor(private client: PocketCloudClient) {
    super();
  }

  /**
   * Connect to real-time events
   * 
   * @example
   * ```typescript
   * const rt = client.realtime.connect();
   * 
   * rt.on('file:created', (event) => {
   *   console.log('New file:', event.data.file.name);
   * });
   * 
   * rt.on('upload:progress', (event) => {
   *   console.log(`Upload ${event.data.uploadId}: ${event.data.percent}%`);
   * });
   * 
   * rt.on('disconnect', () => {
   *   console.log('Disconnected from Pi');
   * });
   * 
   * rt.on('reconnect', () => {
   *   console.log('Reconnected to Pi');
   * });
   * ```
   */
  connect(): this {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return this;
    }

    this.shouldReconnect = true;
    this.createConnection();
    return this;
  }

  /**
   * Disconnect from real-time events
   * 
   * @example
   * ```typescript
   * rt.disconnect();
   * ```
   */
  disconnect(): void {
    this.shouldReconnect = false;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    this.isConnected = false;
    this.emit('disconnect');
  }

  /**
   * Watch a specific folder for changes
   * 
   * @example
   * ```typescript
   * rt.watch('folder-id-abc', (event) => {
   *   console.log('Change in folder:', event.type, event.data);
   * });
   * ```
   */
  watch(folderId: string, callback?: (event: RealtimeEvent) => void): void {
    this.watchedFolders.add(folderId);
    
    if (callback) {
      // Listen for events in this folder
      const folderListener = (event: FileEvent | FolderEvent) => {
        if (event.data.file?.folderId === folderId || 
            event.data.folder?.parentId === folderId ||
            event.data.folder?.id === folderId) {
          callback(event);
        }
      };

      this.on('file:created', folderListener);
      this.on('file:updated', folderListener);
      this.on('file:deleted', folderListener);
      this.on('file:restored', folderListener);
      this.on('folder:created', folderListener);
      this.on('folder:updated', folderListener);
      this.on('folder:deleted', folderListener);
    }

    // Send watch command if connected
    if (this.isConnected && this.ws) {
      this.send({
        type: 'watch',
        folderId
      });
    }
  }

  /**
   * Stop watching a folder
   * 
   * @example
   * ```typescript
   * rt.unwatch('folder-id-abc');
   * ```
   */
  unwatch(folderId: string): void {
    this.watchedFolders.delete(folderId);
    
    if (this.isConnected && this.ws) {
      this.send({
        type: 'unwatch',
        folderId
      });
    }
  }

  /**
   * Get connection status
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    connected: boolean;
    reconnectAttempts: number;
    watchedFolders: number;
  } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      watchedFolders: this.watchedFolders.size
    };
  }

  /**
   * Create WebSocket connection
   */
  private createConnection(): void {
    try {
      const config = this.client.configuration;
      const wsUrl = config.baseUrl.replace(/^http/, 'ws') + '/ws';
      
      // Add authentication to WebSocket URL
      const url = new URL(wsUrl);
      if (config.apiKey) {
        url.searchParams.set('token', config.apiKey);
      }

      this.ws = new WebSocket(url.toString());
      
      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit('connect');
        
        // Re-watch folders after reconnection
        this.watchedFolders.forEach(folderId => {
          this.send({
            type: 'watch',
            folderId
          });
        });

        if (this.reconnectAttempts > 0) {
          this.emit('reconnect');
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.ws = undefined;
        
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        } else {
          this.emit('disconnect');
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', error);
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('disconnect');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
    
    this.reconnectTimer = setTimeout(() => {
      this.createConnection();
    }, delay);
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: any): void {
    if (!data.type) {
      return;
    }

    // Emit the specific event type
    this.emit(data.type, data);
    
    // Emit generic 'message' event
    this.emit('message', data);

    // Handle special event types
    switch (data.type) {
      case 'ping':
        this.send({ type: 'pong' });
        break;
        
      case 'error':
        this.emit('error', new Error(data.message || 'WebSocket error'));
        break;
    }
  }

  /**
   * Send message to server
   */
  private send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  // Typed event listeners for better developer experience

  /**
   * Listen for file events
   */
  onFileCreated(callback: (event: FileEvent) => void): void {
    this.on('file:created', callback);
  }

  onFileUpdated(callback: (event: FileEvent) => void): void {
    this.on('file:updated', callback);
  }

  onFileDeleted(callback: (event: FileEvent) => void): void {
    this.on('file:deleted', callback);
  }

  onFileRestored(callback: (event: FileEvent) => void): void {
    this.on('file:restored', callback);
  }

  /**
   * Listen for folder events
   */
  onFolderCreated(callback: (event: FolderEvent) => void): void {
    this.on('folder:created', callback);
  }

  onFolderUpdated(callback: (event: FolderEvent) => void): void {
    this.on('folder:updated', callback);
  }

  onFolderDeleted(callback: (event: FolderEvent) => void): void {
    this.on('folder:deleted', callback);
  }

  /**
   * Listen for upload events
   */
  onUploadStarted(callback: (event: UploadEvent) => void): void {
    this.on('upload:started', callback);
  }

  onUploadProgress(callback: (event: UploadEvent) => void): void {
    this.on('upload:progress', callback);
  }

  onUploadComplete(callback: (event: UploadEvent) => void): void {
    this.on('upload:complete', callback);
  }

  onUploadFailed(callback: (event: UploadEvent) => void): void {
    this.on('upload:failed', callback);
  }

  /**
   * Listen for system events
   */
  onSystemEvent(callback: (event: SystemEvent) => void): void {
    this.on('system:storage_warning', callback);
    this.on('system:thermal_warning', callback);
  }

  /**
   * Listen for connection events
   */
  onConnect(callback: () => void): void {
    this.on('connect', callback);
  }

  onDisconnect(callback: () => void): void {
    this.on('disconnect', callback);
  }

  onReconnect(callback: () => void): void {
    this.on('reconnect', callback);
  }

  onError(callback: (error: Error) => void): void {
    this.on('error', callback);
  }
}