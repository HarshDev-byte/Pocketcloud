const socketIO = require('socket.io');
const sessionService = require('../security/sessionService');
const { getDatabase } = require('../../config/database');

class WebSocketService {
  constructor() {
    this.io = null;
    this.connections = new Map(); // userId -> Set of socket IDs
    this.socketUsers = new Map(); // socketId -> userId
  }

  /**
   * Initialize WebSocket server
   */
  initialize(server) {
    this.io = socketIO(server, {
      cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:5173',
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.io.use(this.authenticateSocket.bind(this));
    this.io.on('connection', this.handleConnection.bind(this));

    console.log('✓ WebSocket server initialized');
  }

  /**
   * Authenticate socket connection
   */
  async authenticateSocket(socket, next) {
    try {
      const sessionId = socket.handshake.auth.sessionId;
      
      if (!sessionId) {
        return next(new Error('Authentication required'));
      }

      // Verify session
      const session = await sessionService.getSession(sessionId);
      
      if (!session) {
        return next(new Error('Invalid session'));
      }

      // Attach user info to socket
      socket.userId = session.userId;
      socket.sessionId = sessionId;
      
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  }

  /**
   * Handle new socket connection
   */
  handleConnection(socket) {
    const userId = socket.userId;
    
    console.log(`User ${userId} connected: ${socket.id}`);

    // Track connection
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }
    this.connections.get(userId).add(socket.id);
    this.socketUsers.set(socket.id, userId);

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Update presence
    this.updateUserPresence(userId, 'online', socket.id);

    // Broadcast user online
    this.broadcastToAll('user:online', { userId });

    // Setup event handlers
    this.setupEventHandlers(socket);

    // Handle disconnect
    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  /**
   * Setup event handlers for socket
   */
  setupEventHandlers(socket) {
    const userId = socket.userId;

    // Heartbeat
    socket.on('heartbeat', () => {
      socket.emit('heartbeat:ack');
      this.updateUserActivity(userId);
    });

    // File watching
    socket.on('file:watch', (fileId) => {
      socket.join(`file:${fileId}`);
    });

    socket.on('file:unwatch', (fileId) => {
      socket.leave(`file:${fileId}`);
    });

    // Folder watching
    socket.on('folder:watch', (folderId) => {
      socket.join(`folder:${folderId}`);
    });

    socket.on('folder:unwatch', (folderId) => {
      socket.leave(`folder:${folderId}`);
    });

    // Typing indicators
    socket.on('typing:start', (data) => {
      socket.to(`file:${data.fileId}`).emit('user:typing', {
        userId,
        fileId: data.fileId,
        typing: true
      });
    });

    socket.on('typing:stop', (data) => {
      socket.to(`file:${data.fileId}`).emit('user:typing', {
        userId,
        fileId: data.fileId,
        typing: false
      });
    });

    // Presence updates
    socket.on('presence:update', (status) => {
      this.updateUserPresence(userId, status, socket.id);
      this.broadcastToAll('user:status', { userId, status });
    });
  }

  /**
   * Handle socket disconnect
   */
  handleDisconnect(socket) {
    const userId = socket.userId;
    
    console.log(`User ${userId} disconnected: ${socket.id}`);

    // Remove from tracking
    if (this.connections.has(userId)) {
      this.connections.get(userId).delete(socket.id);
      
      // If no more connections, mark offline
      if (this.connections.get(userId).size === 0) {
        this.connections.delete(userId);
        this.updateUserPresence(userId, 'offline', null);
        this.broadcastToAll('user:offline', { userId });
      }
    }
    
    this.socketUsers.delete(socket.id);
  }

  /**
   * Update user presence in database
   */
  async updateUserPresence(userId, status, socketId) {
    try {
      const db = getDatabase();
      
      const existing = db.exec(
        `SELECT id FROM user_presence WHERE user_id = ${userId}`
      )[0];

      if (existing && existing.values.length > 0) {
        db.run(
          `UPDATE user_presence 
           SET status = ?, last_seen = CURRENT_TIMESTAMP, socket_id = ?
           WHERE user_id = ?`,
          [status, socketId, userId]
        );
      } else {
        db.run(
          `INSERT INTO user_presence (user_id, status, socket_id)
           VALUES (?, ?, ?)`,
          [userId, status, socketId]
        );
      }

      require('../../config/database').saveDatabase();
    } catch (error) {
      console.error('Error updating user presence:', error);
    }
  }

  /**
   * Update user activity timestamp
   */
  async updateUserActivity(userId) {
    try {
      const db = getDatabase();
      
      db.run(
        `UPDATE user_presence 
         SET last_seen = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [userId]
      );

      require('../../config/database').saveDatabase();
    } catch (error) {
      console.error('Error updating user activity:', error);
    }
  }

  /**
   * Emit event to specific user
   */
  emitToUser(userId, event, data) {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, data);
    }
  }

  /**
   * Emit event to multiple users
   */
  emitToUsers(userIds, event, data) {
    userIds.forEach(userId => this.emitToUser(userId, event, data));
  }

  /**
   * Emit event to all connected users
   */
  broadcastToAll(event, data) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  /**
   * Emit event to file watchers
   */
  emitToFileWatchers(fileId, event, data) {
    if (this.io) {
      this.io.to(`file:${fileId}`).emit(event, data);
    }
  }

  /**
   * Emit event to folder watchers
   */
  emitToFolderWatchers(folderId, event, data) {
    if (this.io) {
      this.io.to(`folder:${folderId}`).emit(event, data);
    }
  }

  /**
   * Get online users
   */
  getOnlineUsers() {
    return Array.from(this.connections.keys());
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId) {
    return this.connections.has(userId);
  }

  /**
   * Get connection count
   */
  getConnectionCount() {
    return this.socketUsers.size;
  }

  /**
   * Get online user count
   */
  getOnlineUserCount() {
    return this.connections.size;
  }

  /**
   * Get user's socket IDs
   */
  getUserSockets(userId) {
    return Array.from(this.connections.get(userId) || []);
  }

  /**
   * Disconnect user
   */
  disconnectUser(userId) {
    const sockets = this.getUserSockets(userId);
    sockets.forEach(socketId => {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
    });
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalConnections: this.getConnectionCount(),
      onlineUsers: this.getOnlineUserCount(),
      rooms: this.io ? this.io.sockets.adapter.rooms.size : 0
    };
  }
}

module.exports = new WebSocketService();
