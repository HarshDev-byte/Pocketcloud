// Mock Node.js modules
const mockUrl = {
  parse: (url: string, parseQuery?: boolean) => {
    try {
      const urlObj = new URL(url, 'http://localhost');
      const query: { [key: string]: string } = {};
      if (parseQuery) {
        urlObj.searchParams.forEach((value, key) => {
          query[key] = value;
        });
      }
      return {
        pathname: urlObj.pathname,
        search: urlObj.search,
        query: parseQuery ? query : urlObj.search,
        href: urlObj.href
      };
    } catch {
      return { pathname: '/', search: '', query: parseQuery ? {} : '', href: url };
    }
  }
};

const mockCookie = {
  parse: (cookieString: string) => {
    const cookies: { [key: string]: string } = {};
    if (!cookieString) return cookies;
    
    cookieString.split(';').forEach(cookie => {
      const [name, ...rest] = cookie.trim().split('=');
      if (name && rest.length > 0) {
        cookies[name] = rest.join('=');
      }
    });
    return cookies;
  }
};

const mockProcess = {
  env: {
    JWT_SECRET: '[jwt_secret]'
  }
};

import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { realtimeService } from '../services/realtime.service';

// Use mocks
const { parse: parseUrl } = mockUrl;
const { parse: parseCookie } = mockCookie;
const process = mockProcess;

export interface AuthenticatedWebSocket {
  userId?: string;
  userRole?: string;
  close: (code?: number, reason?: string) => void;
  send: (data: string | Uint8Array) => void;
}

/**
 * Initialize WebSocket server and attach to HTTP server
 */
export function initializeWebSocketServer(httpServer: any): WebSocketServer {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    verifyClient: (_info: any) => {
      // Basic verification - detailed auth happens in connection handler
      return true;
    }
  });

  wss.on('connection', async (ws: any, request: any) => {
    try {
      // Parse cookies
      const cookies = parseCookie(request.headers.cookie || '');
      
      // Extract JWT token from cookie
      const token = cookies.session;
      if (!token) {
        console.warn('WebSocket connection rejected: No session token');
        ws.close(4001, 'Authentication required');
        return;
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      if (!decoded || !decoded.userId) {
        console.warn('WebSocket connection rejected: Invalid token');
        ws.close(4001, 'Invalid authentication');
        return;
      }

      // Add connection to realtime service
      const success = realtimeService.addConnection(ws, decoded.userId, decoded.role || 'user');
      if (!success) {
        console.warn('WebSocket connection rejected: Connection limit reached');
        ws.close(4013, 'Connection limit reached');
        return;
      }

      // Store user info on WebSocket (safe casting)
      const authWs = ws as unknown as AuthenticatedWebSocket;
      authWs.userId = decoded.userId;
      authWs.userRole = decoded.role || 'user';

      console.log(`WebSocket authenticated: user ${decoded.userId}`);

    } catch (error) {
      console.error('WebSocket authentication error:', error);
      ws.close(4001, 'Authentication failed');
    }
  });

  wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
  });

  console.log('WebSocket server initialized on path /ws');
  return wss;
}

/**
 * Shutdown WebSocket server gracefully
 */
export function shutdownWebSocketServer(wss: WebSocketServer): Promise<void> {
  return new Promise((resolve) => {
    console.log('Shutting down WebSocket server...');
    
    // Close all connections
    wss.clients.forEach((ws: any) => {
      ws.close(1001, 'Server shutting down');
    });

    // Close the server
    wss.close(() => {
      console.log('WebSocket server closed');
      resolve();
    });
  });
}