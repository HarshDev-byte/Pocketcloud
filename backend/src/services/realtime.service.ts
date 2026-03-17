import { logger } from '../utils/logger';

// WebSocket event types
export const WS_EVENTS = {
  // File events
  FILE_CREATED: 'file:created',
  FILE_UPDATED: 'file:updated',
  FILE_DELETED: 'file:deleted',
  FILE_RESTORED: 'file:restored',
  FILE_MOVED: 'file:moved',
  
  // Upload events
  UPLOAD_PROGRESS: 'upload:progress',
  UPLOAD_COMPLETE: 'upload:complete',
  UPLOAD_FAILED: 'upload:failed',
  
  // Bulk operation events
  BULK_PROGRESS: 'bulk:progress',
  BULK_COMPLETE: 'bulk:complete',
  BULK_FAILED: 'bulk:failed',
  
  // Media events
  MEDIA_PROCESSING: 'media:processing',
  MEDIA_READY: 'media:ready',
  MEDIA_FAILED: 'media:failed',
  
  // Folder events
  FOLDER_CREATED: 'folder:created',
  FOLDER_DELETED: 'folder:deleted',
  FOLDER_RENAMED: 'folder:renamed',
  
  // Storage events
  STORAGE_UPDATED: 'storage:updated',
  
  // System events (admin only)
  SYSTEM_STATS: 'system:stats',
  SYSTEM_ALERT: 'system:alert',
  USER_CONNECTED: 'user:connected',
  USER_DISCONNECTED: 'user:disconnected',
} as const;

export type WSEvent = typeof WS_EVENTS[keyof typeof WS_EVENTS];

interface ClientInfo {
  userId: string;
  username: string;
  role: string;
  joinedAt: number;
  isAlive: boolean;
  subscriptions: Map<string, string>; // type -> value (e.g., 'folder' -> folderId)
}

interface WSMessage {
  type: string;
  event?: WSEvent;
  data?: any;
  timestamp?: number;
}

// Storage update debouncing per user
const storageUpdateDebounce = new Map<string, ReturnType<typeof setTimeout>>();

class ConnectionManager {
  private connections = new Map<string, Set<any>>(); // userId -> Set of WebSocket connections
  private clients = new Map<any, ClientInfo>(); // WebSocket -> ClientInfo
  private readonly MAX_CONNECTIONS = 20; // Pi memory limit

  add(ws: any, userId: string, username: string, role: string): boolean {
    // Check capacity
    if (this.getTotalConnections() >= this.MAX_CONNECTIONS) {
      return false;
    }

    // Add to connections map
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }
    this.connections.get(userId)!.add(ws);

    // Add to clients map
    this.clients.set(ws, {
      userId,
      username,
      role,
      joinedAt: Date.now(),
      isAlive: true,
      subscriptions: new Map()
    });

    // Start heartbeat for this connection
    this.startHeartbeat(ws);

    // Notify admins of new connection
    this.sendToAdmins(WS_EVENTS.USER_CONNECTED, {
      userId,
      username,
      connectedAt: Date.now()
    });

    logger.info('WebSocket client connected', { userId, username, role });
    return true;
  }

  remove(ws: any): void {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo) return;

    const { userId, username } = clientInfo;

    // Remove from connections map
    const userConnections = this.connections.get(userId);
    if (userConnections) {
      userConnections.delete(ws);
      if (userConnections.size === 0) {
        this.connections.delete(userId);
      }
    }

    // Remove from clients map
    this.clients.delete(ws);

    // Notify admins of disconnection
    this.sendToAdmins(WS_EVENTS.USER_DISCONNECTED, {
      userId,
      username,
      disconnectedAt: Date.now()
    });

    logger.info('WebSocket client disconnected', { userId, username });
  }

  sendToUser(userId: string, event: WSEvent, data: any): void {
    const userConnections = this.connections.get(userId);
    if (!userConnections) return;

    const message: WSMessage = {
      type: 'event',
      event,
      data,
      timestamp: Date.now()
    };

    const messageStr = JSON.stringify(message);

    for (const ws of userConnections) {
      if (this.isWebSocketOpen(ws)) {
        try {
          ws.send(messageStr);
        } catch (error) {
          logger.warn('Failed to send WebSocket message', { userId, event, error });
          this.remove(ws);
        }
      }
    }
  }

  sendToAll(event: WSEvent, data: any, excludeUserId?: string): void {
    const message: WSMessage = {
      type: 'event',
      event,
      data,
      timestamp: Date.now()
    };

    const messageStr = JSON.stringify(message);

    for (const [userId, connections] of this.connections) {
      if (excludeUserId && userId === excludeUserId) continue;

      for (const ws of connections) {
        if (this.isWebSocketOpen(ws)) {
          try {
            ws.send(messageStr);
          } catch (error) {
            logger.warn('Failed to broadcast WebSocket message', { userId, event, error });
            this.remove(ws);
          }
        }
      }
    }
  }

  sendToAdmins(event: WSEvent, data: any): void {
    const message: WSMessage = {
      type: 'event',
      event,
      data,
      timestamp: Date.now()
    };

    const messageStr = JSON.stringify(message);

    for (const [ws, clientInfo] of this.clients) {
      if (clientInfo.role === 'admin' && this.isWebSocketOpen(ws)) {
        try {
          ws.send(messageStr);
        } catch (error) {
          logger.warn('Failed to send admin WebSocket message', { 
            userId: clientInfo.userId, 
            event, 
            error 
          });
          this.remove(ws);
        }
      }
    }
  }

  broadcast(event: WSEvent, data: any, excludeUserId?: string): void {
    this.sendToAll(event, data, excludeUserId);
  }

  setSubscription(ws: any, type: string, value: string): void {
    const clientInfo = this.clients.get(ws);
    if (clientInfo) {
      clientInfo.subscriptions.set(type, value);
    }
  }

  clearSubscription(ws: any, type: string): void {
    const clientInfo = this.clients.get(ws);
    if (clientInfo) {
      clientInfo.subscriptions.delete(type);
    }
  }

  getTotalConnections(): number {
    return this.clients.size;
  }

  getUniqueUsers(): number {
    return this.connections.size;
  }

  getStats(): any {
    const connectionsByUser = [];
    
    for (const [userId, connections] of this.connections) {
      const firstConnection = Array.from(connections)[0];
      const clientInfo = this.clients.get(firstConnection);
      
      if (clientInfo) {
        connectionsByUser.push({
          userId,
          username: clientInfo.username,
          connections: connections.size,
          connectedAt: clientInfo.joinedAt
        });
      }
    }

    return {
      totalConnections: this.getTotalConnections(),
      uniqueUsers: this.getUniqueUsers(),
      connectionsByUser
    };
  }

  private startHeartbeat(ws: any): void {
    // Set up ping/pong heartbeat
    const heartbeatInterval = setInterval(() => {
      const clientInfo = this.clients.get(ws);
      if (!clientInfo) {
        clearInterval(heartbeatInterval);
        return;
      }

      if (!clientInfo.isAlive) {
        logger.info('WebSocket client failed heartbeat, terminating', { 
          userId: clientInfo.userId 
        });
        clearInterval(heartbeatInterval);
        this.terminateConnection(ws);
        return;
      }

      clientInfo.isAlive = false;
      
      if (this.isWebSocketOpen(ws)) {
        try {
          ws.ping();
        } catch (error) {
          logger.warn('Failed to ping WebSocket client', { 
            userId: clientInfo.userId, 
            error 
          });
          clearInterval(heartbeatInterval);
          this.remove(ws);
        }
      } else {
        clearInterval(heartbeatInterval);
        this.remove(ws);
      }
    }, 30000); // 30 seconds

    // Handle pong response
    ws.on('pong', () => {
      const clientInfo = this.clients.get(ws);
      if (clientInfo) {
        clientInfo.isAlive = true;
      }
    });

    // Clean up interval on close
    ws.on('close', () => {
      clearInterval(heartbeatInterval);
    });
  }

  private terminateConnection(ws: any): void {
    try {
      ws.terminate();
    } catch (error) {
      logger.warn('Error terminating WebSocket connection', { error });
    }
    this.remove(ws);
  }

  private isWebSocketOpen(ws: any): boolean {
    // WebSocket.OPEN = 1
    return ws.readyState === 1;
  }
}

// Global connection manager instance
const connectionManager = new ConnectionManager();

export class RealtimeService {
  /**
   * Send event to a specific user
   */
  static sendToUser(userId: string, event: WSEvent, data: any): void {
    connectionManager.sendToUser(userId, event, data);
  }

  /**
   * Send event to all connected users
   */
  static sendToAll(event: WSEvent, data: any, excludeUserId?: string): void {
    connectionManager.sendToAll(event, data, excludeUserId);
  }

  /**
   * Send event to admin users only
   */
  static sendToAdmins(event: WSEvent, data: any): void {
    connectionManager.sendToAdmins(event, data);
  }

  /**
   * Broadcast event to all users (alias for sendToAll)
   */
  static broadcast(event: WSEvent, data: any, excludeUserId?: string): void {
    connectionManager.broadcast(event, data, excludeUserId);
  }

  /**
   * Send storage update event (debounced per user)
   */
  static sendStorageUpdate(userId: string): void {
    // Clear existing timeout for this user
    const existingTimeout = storageUpdateDebounce.get(userId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout to debounce rapid updates
    const timeout = setTimeout(() => {
      this.sendToUser(userId, WS_EVENTS.STORAGE_UPDATED, {
        timestamp: Date.now()
      });
      storageUpdateDebounce.delete(userId);
    }, 10000); // 10 second debounce

    storageUpdateDebounce.set(userId, timeout);
  }

  /**
   * Get connection statistics
   */
  static getStats(): any {
    return connectionManager.getStats();
  }

  /**
   * Get connection manager instance (for WebSocket setup)
   */
  static getConnectionManager(): ConnectionManager {
    return connectionManager;
  }
}

// Export connection manager for WebSocket setup
export { connectionManager };