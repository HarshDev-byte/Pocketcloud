import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { Server } from 'http';
import { AuthService, SafeUser } from './services/auth.service';
import { parse as parseCookie } from 'cookie';
import { connectionManager, WS_EVENTS } from './services/realtime.service';
import { logger } from './utils/logger';

const MAX_CONNECTIONS = 20; // Pi memory limit

interface ClientMessage {
  type: string;
  folderId?: string;
  [key: string]: any;
}

export let wss: WebSocketServer;

export function setupWebSocket(httpServer: Server): WebSocketServer {
  wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws',
    maxPayload: 65536 // 64KB max message size
  });

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    // AUTH: Read session cookie from upgrade request
    const cookies = parseCookie(req.headers.cookie ?? '');
    const token = cookies['pcd_session'];
    
    if (!token) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      }));
      ws.close(4001, 'Authentication required');
      return;
    }

    let user: SafeUser;
    try {
      user = await AuthService.validateSession(token);
    } catch (error) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        code: 'INVALID_SESSION',
        message: 'Invalid session'
      }));
      ws.close(4001, 'Invalid session');
      return;
    }

    // Check capacity
    if (connectionManager.getTotalConnections() >= MAX_CONNECTIONS) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        code: 'CAPACITY',
        message: 'Server at capacity'
      }));
      ws.close(1013, 'Try again later');
      return;
    }

    // Register connection
    const success = connectionManager.add(ws, user.id, user.username, user.role);
    if (!success) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        code: 'CAPACITY',
        message: 'Server at capacity'
      }));
      ws.close(1013, 'Try again later');
      return;
    }

    // Send initial connection confirmation
    ws.send(JSON.stringify({
      type: 'connected',
      userId: user.id,
      username: user.username,
      role: user.role,
      serverTime: Date.now()
    }));

    logger.info('WebSocket client connected', {
      userId: user.id,
      username: user.username,
      role: user.role,
      totalConnections: connectionManager.getTotalConnections()
    });

    // Handle messages from client
    ws.on('message', (data) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());
        handleClientMessage(ws, user, msg);
      } catch (error) {
        logger.warn('Invalid WebSocket message received', { 
          userId: user.id, 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Ignore malformed messages
      }
    });

    ws.on('close', (code, reason) => {
      connectionManager.remove(ws);
      logger.info('WebSocket client disconnected', {
        userId: user.id,
        username: user.username,
        code,
        reason: reason.toString(),
        totalConnections: connectionManager.getTotalConnections()
      });
    });

    ws.on('error', (err) => {
      logger.error('WebSocket error', { 
        userId: user.id, 
        error: err.message 
      });
      connectionManager.remove(ws);
    });
  });

  logger.info('WebSocket server initialized', {
    path: '/ws',
    maxConnections: MAX_CONNECTIONS,
    maxPayload: '64KB'
  });

  return wss;
}

function handleClientMessage(ws: WebSocket, user: any, msg: ClientMessage): void {
  switch (msg.type) {
    case 'pong':
      // Mark connection as alive (handled by connection manager)
      break;
      
    case 'subscribe_folder':
      if (msg.folderId && typeof msg.folderId === 'string') {
        connectionManager.setSubscription(ws, 'folder', msg.folderId);
        logger.debug('Client subscribed to folder', { 
          userId: user.id, 
          folderId: msg.folderId 
        });
      }
      break;
      
    case 'unsubscribe_folder':
      connectionManager.clearSubscription(ws, 'folder');
      logger.debug('Client unsubscribed from folder', { 
        userId: user.id 
      });
      break;
      
    case 'ping':
      // Respond to client ping
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
      
    default:
      logger.debug('Unknown WebSocket message type', { 
        userId: user.id, 
        type: msg.type 
      });
      // Ignore unknown message types
  }
}