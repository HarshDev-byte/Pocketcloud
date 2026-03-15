import WebSocket from 'ws';

// Mock EventEmitter for compatibility
class EventEmitter {
  private listeners: { [event: string]: Function[] } = {};

  on(event: string, listener: Function): this {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    const eventListeners = this.listeners[event];
    if (eventListeners) {
      eventListeners.forEach(listener => listener(...args));
      return true;
    }
    return false;
  }

  removeListener(event: string, listener: Function): this {
    const eventListeners = this.listeners[event];
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
    return this;
  }
}

// Event types for real-time synchronization
export interface RealtimeEvent {
  type: string;
  timestamp: number;
  data: any;
}

export interface FileCreatedEvent extends RealtimeEvent {
  type: 'FILE_CREATED';
  data: {
    fileId: string;
    folderId: string | null;
    file: FileMetadata;
  };
}

export interface FileUpdatedEvent extends RealtimeEvent {
  type: 'FILE_UPDATED';
  data: {
    fileId: string;
    changes: Partial<FileMetadata>;
  };
}

export interface FileDeletedEvent extends RealtimeEvent {
  type: 'FILE_DELETED';
  data: {
    fileId: string;
    folderId: string | null;
  };
}

export interface FileRestoredEvent extends RealtimeEvent {
  type: 'FILE_RESTORED';
  data: {
    fileId: string;
    folderId: string | null;
  };
}

export interface FolderCreatedEvent extends RealtimeEvent {
  type: 'FOLDER_CREATED';
  data: {
    folderId: string;
    parentId: string | null;
    folder: FolderMetadata;
  };
}

export interface FolderUpdatedEvent extends RealtimeEvent {
  type: 'FOLDER_UPDATED';
  data: {
    folderId: string;
    changes: Partial<FolderMetadata>;
  };
}

export interface FolderDeletedEvent extends RealtimeEvent {
  type: 'FOLDER_DELETED';
  data: {
    folderId: string;
    parentId: string | null;
  };
}

export interface UploadProgressEvent extends RealtimeEvent {
  type: 'UPLOAD_PROGRESS';
  data: {
    uploadId: string;
    fileId?: string;
    percent: number;
    speed: number; // bytes per second
    eta: number; // seconds remaining
  };
}

export interface MediaReadyEvent extends RealtimeEvent {
  type: 'MEDIA_READY';
  data: {
    fileId: string;
    thumbnailUrl?: string;
    posterUrl?: string;
    hlsUrl?: string;
  };
}

export interface StorageUpdatedEvent extends RealtimeEvent {
  type: 'STORAGE_UPDATED';
  data: {
    used: number;
    free: number;
    total: number;
  };
}

export interface UserConnectedEvent extends RealtimeEvent {
  type: 'USER_CONNECTED';
  data: {
    userId: string;
    deviceCount: number;
  };
}

// Metadata interfaces
export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  mime_type: string;
  created_at: number;
  updated_at: number;
  owner_id: string;
  folder_id: string | null;
}

export interface FolderMetadata {
  id: string;
  name: string;
  path: string;
  created_at: number;
  updated_at: number;
  owner_id: string;
  parent_id: string | null;
}

// Connection info
interface ConnectionInfo {
  ws: WebSocket;
  userId: string;
  userRole: string;
  lastPing: number;
  isAlive: boolean;
}

export class RealtimeService extends EventEmitter {
  private connections = new Map<WebSocket, ConnectionInfo>();
  private userConnections = new Map<string, Set<WebSocket>>();
  private heartbeatInterval: any | null = null;
  private storageUpdateDebounce: any | null = null;
  
  private readonly MAX_CONNECTIONS = 20;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly HEARTBEAT_TIMEOUT = 10000; // 10 seconds
  private readonly MAX_MESSAGE_SIZE = 4096; // 4KB limit

  constructor() {
    super();
    this.startHeartbeat();
  }

  /**
   * Add a WebSocket connection
   */
  public addConnection(ws: WebSocket, userId: string, userRole: string): boolean {
    // Check connection limit
    if (this.connections.size >= this.MAX_CONNECTIONS) {
      console.warn('WebSocket connection limit reached');
      return false;
    }

    // Create connection info
    const connectionInfo: ConnectionInfo = {
      ws,
      userId,
      userRole,
      lastPing: Date.now(),
      isAlive: true
    };

    // Add to connections map
    this.connections.set(ws, connectionInfo);

    // Add to user connections map
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(ws);

    // Set up WebSocket event handlers
    this.setupWebSocketHandlers(ws, connectionInfo);

    // Broadcast user connected event to admins
    if (userRole === 'admin') {
      this.broadcastToAdmins({
        type: 'USER_CONNECTED',
        timestamp: Date.now(),
        data: {
          userId,
          deviceCount: this.userConnections.get(userId)!.size
        }
      });
    }

    console.log(`WebSocket connected: user ${userId}, total connections: ${this.connections.size}`);
    return true;
  }

  /**
   * Remove a WebSocket connection
   */
  public removeConnection(ws: WebSocket): void {
    const connectionInfo = this.connections.get(ws);
    if (!connectionInfo) return;

    const { userId, userRole } = connectionInfo;

    // Remove from connections map
    this.connections.delete(ws);

    // Remove from user connections map
    const userWsSet = this.userConnections.get(userId);
    if (userWsSet) {
      userWsSet.delete(ws);
      if (userWsSet.size === 0) {
        this.userConnections.delete(userId);
      } else if (userRole === 'admin') {
        // Broadcast updated device count to admins
        this.broadcastToAdmins({
          type: 'USER_CONNECTED',
          timestamp: Date.now(),
          data: {
            userId,
            deviceCount: userWsSet.size
          }
        });
      }
    }

    console.log(`WebSocket disconnected: user ${userId}, total connections: ${this.connections.size}`);
  }

  /**
   * Set up WebSocket event handlers
   */
  private setupWebSocketHandlers(ws: WebSocket, connectionInfo: ConnectionInfo): void {
    ws.on('pong', () => {
      connectionInfo.isAlive = true;
      connectionInfo.lastPing = Date.now();
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleClientMessage(ws, message);
      } catch (error) {
        console.error('Invalid WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      this.removeConnection(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.removeConnection(ws);
    });
  }

  /**
   * Handle messages from client
   */
  private handleClientMessage(ws: WebSocket, message: any): void {
    const connectionInfo = this.connections.get(ws);
    if (!connectionInfo) return;

    switch (message.type) {
      case 'ping':
        this.sendToConnection(ws, { type: 'pong', timestamp: Date.now() });
        break;
      
      case 'subscribe':
        // Handle subscription to specific folders/files
        // This could be extended for more granular subscriptions
        break;
        
      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  /**
   * Broadcast file created event
   */
  public broadcastFileCreated(fileId: string, folderId: string | null, file: FileMetadata): void {
    const event: FileCreatedEvent = {
      type: 'FILE_CREATED',
      timestamp: Date.now(),
      data: { fileId, folderId, file }
    };

    this.broadcastToUser(file.owner_id, event);
  }

  /**
   * Broadcast file updated event
   */
  public broadcastFileUpdated(fileId: string, ownerId: string, changes: Partial<FileMetadata>): void {
    const event: FileUpdatedEvent = {
      type: 'FILE_UPDATED',
      timestamp: Date.now(),
      data: { fileId, changes }
    };

    this.broadcastToUser(ownerId, event);
  }

  /**
   * Broadcast file deleted event
   */
  public broadcastFileDeleted(fileId: string, folderId: string | null, ownerId: string): void {
    const event: FileDeletedEvent = {
      type: 'FILE_DELETED',
      timestamp: Date.now(),
      data: { fileId, folderId }
    };

    this.broadcastToUser(ownerId, event);
  }

  /**
   * Broadcast file restored event
   */
  public broadcastFileRestored(fileId: string, folderId: string | null, ownerId: string): void {
    const event: FileRestoredEvent = {
      type: 'FILE_RESTORED',
      timestamp: Date.now(),
      data: { fileId, folderId }
    };

    this.broadcastToUser(ownerId, event);
  }

  /**
   * Broadcast folder created event
   */
  public broadcastFolderCreated(folderId: string, parentId: string | null, folder: FolderMetadata): void {
    const event: FolderCreatedEvent = {
      type: 'FOLDER_CREATED',
      timestamp: Date.now(),
      data: { folderId, parentId, folder }
    };

    this.broadcastToUser(folder.owner_id, event);
  }

  /**
   * Broadcast folder updated event
   */
  public broadcastFolderUpdated(folderId: string, ownerId: string, changes: Partial<FolderMetadata>): void {
    const event: FolderUpdatedEvent = {
      type: 'FOLDER_UPDATED',
      timestamp: Date.now(),
      data: { folderId, changes }
    };

    this.broadcastToUser(ownerId, event);
  }

  /**
   * Broadcast folder deleted event
   */
  public broadcastFolderDeleted(folderId: string, parentId: string | null, ownerId: string): void {
    const event: FolderDeletedEvent = {
      type: 'FOLDER_DELETED',
      timestamp: Date.now(),
      data: { folderId, parentId }
    };

    this.broadcastToUser(ownerId, event);
  }

  /**
   * Broadcast upload progress event
   */
  public broadcastUploadProgress(userId: string, uploadId: string, fileId: string | undefined, percent: number, speed: number, eta: number): void {
    const event: UploadProgressEvent = {
      type: 'UPLOAD_PROGRESS',
      timestamp: Date.now(),
      data: { uploadId, fileId, percent, speed, eta }
    };

    this.broadcastToUser(userId, event);
  }

  /**
   * Broadcast media ready event
   */
  public broadcastMediaReady(fileId: string, ownerId: string, thumbnailUrl?: string, posterUrl?: string, hlsUrl?: string): void {
    const event: MediaReadyEvent = {
      type: 'MEDIA_READY',
      timestamp: Date.now(),
      data: { fileId, thumbnailUrl, posterUrl, hlsUrl }
    };

    this.broadcastToUser(ownerId, event);
  }

  /**
   * Broadcast storage updated event (debounced)
   */
  public broadcastStorageUpdated(used: number, free: number, total: number): void {
    // Debounce to at most once per 5 seconds
    if (this.storageUpdateDebounce) {
      clearTimeout(this.storageUpdateDebounce);
    }

    this.storageUpdateDebounce = setTimeout(() => {
      const event: StorageUpdatedEvent = {
        type: 'STORAGE_UPDATED',
        timestamp: Date.now(),
        data: { used, free, total }
      };

      this.broadcastToAll(event);
      this.storageUpdateDebounce = null;
    }, 5000);
  }

  /**
   * Broadcast update status event (admin only)
   */
  public broadcastUpdateStatus(status: { phase: string; progress: number; message: string; error?: string }): void {
    const event: RealtimeEvent = {
      type: 'UPDATE_STATUS',
      timestamp: Date.now(),
      data: status
    };

    this.broadcastToAdmins(event);
  }

  /**
   * Broadcast to all connections of a specific user
   */
  private broadcastToUser(userId: string, event: RealtimeEvent): void {
    const userConnections = this.userConnections.get(userId);
    if (!userConnections) return;

    const message = this.serializeEvent(event);
    if (!message) return;

    userConnections.forEach(ws => {
      this.sendToConnection(ws, message);
    });
  }

  /**
   * Broadcast to all admin connections
   */
  private broadcastToAdmins(event: RealtimeEvent): void {
    const message = this.serializeEvent(event);
    if (!message) return;

    this.connections.forEach((connectionInfo, ws) => {
      if (connectionInfo.userRole === 'admin') {
        this.sendToConnection(ws, message);
      }
    });
  }

  /**
   * Broadcast to all connections
   */
  private broadcastToAll(event: RealtimeEvent): void {
    const message = this.serializeEvent(event);
    if (!message) return;

    this.connections.forEach((_, ws) => {
      this.sendToConnection(ws, message);
    });
  }

  /**
   * Serialize event to JSON string with size check
   */
  private serializeEvent(event: RealtimeEvent): string | null {
    try {
      const message = JSON.stringify(event);
      
      if (message.length > this.MAX_MESSAGE_SIZE) {
        console.warn('WebSocket message too large, skipping:', event.type);
        return null;
      }

      return message;
    } catch (error) {
      console.error('Failed to serialize WebSocket event:', error);
      return null;
    }
  }

  /**
   * Send message to a specific connection
   */
  private sendToConnection(ws: WebSocket, message: string | object): void {
    if (ws.readyState !== WebSocket.OPEN) return;

    try {
      const data = typeof message === 'string' ? message : JSON.stringify(message);
      ws.send(data);
    } catch (error) {
      console.error('Failed to send WebSocket message:', error);
      this.removeConnection(ws);
    }
  }

  /**
   * Start heartbeat to detect dead connections
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();

      this.connections.forEach((connectionInfo, ws) => {
        if (!connectionInfo.isAlive || (now - connectionInfo.lastPing) > this.HEARTBEAT_TIMEOUT) {
          console.log('Terminating dead WebSocket connection');
          ws.terminate();
          this.removeConnection(ws);
          return;
        }

        connectionInfo.isAlive = false;
        ws.ping();
      });
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Get connection statistics
   */
  public getStats(): {
    totalConnections: number;
    userCount: number;
    connectionsByUser: { [userId: string]: number };
  } {
    const connectionsByUser: { [userId: string]: number } = {};
    
    this.userConnections.forEach((connections, userId) => {
      connectionsByUser[userId] = connections.size;
    });

    return {
      totalConnections: this.connections.size,
      userCount: this.userConnections.size,
      connectionsByUser
    };
  }

  /**
   * Broadcast hardware stats to admin connections
   */
  public broadcastHardwareStats(stats: any): void {
    this.broadcastToAdmins({
      type: 'HARDWARE_STATS',
      timestamp: Date.now(),
      data: stats
    });
  }

  /**
   * Broadcast thermal warning to admin connections
   */
  public broadcastThermalWarning(thermalStatus: any): void {
    this.broadcastToAdmins({
      type: thermalStatus.warningLevel === 'critical' ? 'THERMAL_CRITICAL' : 'THERMAL_WARNING',
      timestamp: Date.now(),
      data: thermalStatus
    });
  }

  /**
   * Shutdown the service
   */
  public shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.storageUpdateDebounce) {
      clearTimeout(this.storageUpdateDebounce);
      this.storageUpdateDebounce = null;
    }

    // Close all connections
    this.connections.forEach((_, ws) => {
      ws.close(1001, 'Server shutting down');
    });

    this.connections.clear();
    this.userConnections.clear();

    console.log('RealtimeService shutdown complete');
  }
}

// Singleton instance
export const realtimeService = new RealtimeService();