import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface RealtimeEvent {
  type: string;
  timestamp: number;
  data: any;
}

interface FileMetadata {
  id: string;
  name: string;
  size: number;
  mime_type: string;
  created_at: number;
  updated_at: number;
  owner_id: string;
  folder_id: string | null;
}

interface FolderMetadata {
  id: string;
  name: string;
  path: string;
  created_at: number;
  updated_at: number;
  owner_id: string;
  parent_id: string | null;
}

interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  lastConnected?: number;
  reconnectAttempts: number;
}

export function useRealtimeSync() {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionStateRef = useRef<ConnectionState>({
    status: 'disconnected',
    reconnectAttempts: 0
  });

  const getWebSocketUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws`;
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const realtimeEvent: RealtimeEvent = JSON.parse(event.data);
      
      switch (realtimeEvent.type) {
        case 'FILE_CREATED': {
          const { folderId, file } = realtimeEvent.data;
          
          // Update folder contents cache
          queryClient.setQueryData(['folder', folderId], (oldData: any) => {
            if (!oldData) return oldData;
            return {
              ...oldData,
              files: [...(oldData.files || []), file]
            };
          });
          
          // Invalidate parent folder to refresh counts
          if (folderId) {
            queryClient.invalidateQueries({ queryKey: ['folder', folderId] });
          }
          break;
        }

        case 'FILE_UPDATED': {
          const { fileId, changes } = realtimeEvent.data;
          
          // Update file in all relevant caches
          queryClient.setQueriesData({ queryKey: ['folder'] }, (oldData: any) => {
            if (!oldData?.files) return oldData;
            
            return {
              ...oldData,
              files: oldData.files.map((file: FileMetadata) =>
                file.id === fileId ? { ...file, ...changes } : file
              )
            };
          });
          break;
        }

        case 'FILE_DELETED': {
          const { fileId, folderId } = realtimeEvent.data;
          
          // Remove file from folder cache
          queryClient.setQueryData(['folder', folderId], (oldData: any) => {
            if (!oldData?.files) return oldData;
            
            return {
              ...oldData,
              files: oldData.files.filter((file: FileMetadata) => file.id !== fileId)
            };
          });
          break;
        }

        case 'FILE_RESTORED': {
          const { fileId, folderId } = realtimeEvent.data;
          
          // Remove from trash cache
          queryClient.setQueryData(['trash'], (oldData: any) => {
            if (!oldData?.files) return oldData;
            
            return {
              ...oldData,
              files: oldData.files.filter((file: FileMetadata) => file.id !== fileId)
            };
          });
          
          // Invalidate target folder to show restored file
          if (folderId) {
            queryClient.invalidateQueries({ queryKey: ['folder', folderId] });
          }
          break;
        }

        case 'FOLDER_CREATED': {
          const { parentId, folder } = realtimeEvent.data;
          
          // Update parent folder cache
          queryClient.setQueryData(['folder', parentId], (oldData: any) => {
            if (!oldData) return oldData;
            return {
              ...oldData,
              folders: [...(oldData.folders || []), folder]
            };
          });
          break;
        }

        case 'FOLDER_UPDATED': {
          const { folderId, changes } = realtimeEvent.data;
          
          // Update folder in all relevant caches
          queryClient.setQueriesData({ queryKey: ['folder'] }, (oldData: any) => {
            if (!oldData?.folders) return oldData;
            
            return {
              ...oldData,
              folders: oldData.folders.map((folder: FolderMetadata) =>
                folder.id === folderId ? { ...folder, ...changes } : folder
              )
            };
          });
          break;
        }

        case 'FOLDER_DELETED': {
          const { folderId, parentId } = realtimeEvent.data;
          
          // Remove folder from parent cache
          queryClient.setQueryData(['folder', parentId], (oldData: any) => {
            if (!oldData?.folders) return oldData;
            
            return {
              ...oldData,
              folders: oldData.folders.filter((folder: FolderMetadata) => folder.id !== folderId)
            };
          });
          break;
        }

        case 'UPLOAD_PROGRESS': {
          // This will be handled by useUploadProgress hook
          window.dispatchEvent(new CustomEvent('upload-progress', {
            detail: realtimeEvent.data
          }));
          break;
        }

        case 'MEDIA_READY': {
          const { fileId } = realtimeEvent.data;
          
          // Invalidate file queries to refresh with new media URLs
          queryClient.invalidateQueries({ queryKey: ['file', fileId] });
          queryClient.invalidateQueries({ queryKey: ['folder'] });
          break;
        }

        case 'STORAGE_UPDATED': {
          // Update storage stats cache
          queryClient.setQueryData(['storage-stats'], realtimeEvent.data);
          break;
        }

        case 'pong': {
          // Heartbeat response - connection is alive
          break;
        }

        default:
          console.warn('Unknown realtime event type:', realtimeEvent.type);
      }
    } catch (error) {
      console.error('Failed to handle realtime message:', error);
    }
  }, [queryClient]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    connectionStateRef.current.status = 'connecting';
    
    try {
      const ws = new WebSocket(getWebSocketUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        connectionStateRef.current = {
          status: 'connected',
          lastConnected: Date.now(),
          reconnectAttempts: 0
        };

        // Send ping to establish connection
        ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      };

      ws.onmessage = handleMessage;

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        connectionStateRef.current.status = 'disconnected';
        
        // Don't reconnect if it was a clean close or auth failure
        if (event.code === 1000 || event.code === 4001 || event.code === 4013) {
          return;
        }

        // Auto-reconnect with exponential backoff
        scheduleReconnect();
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        connectionStateRef.current.status = 'disconnected';
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      connectionStateRef.current.status = 'disconnected';
      scheduleReconnect();
    }
  }, [getWebSocketUrl, handleMessage]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    connectionStateRef.current.status = 'reconnecting';
    const attempts = connectionStateRef.current.reconnectAttempts;
    
    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
    
    console.log(`Reconnecting in ${delay}ms (attempt ${attempts + 1})`);
    
    reconnectTimeoutRef.current = setTimeout(() => {
      connectionStateRef.current.reconnectAttempts++;
      connect();
    }, delay);
  }, [connect]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }

    connectionStateRef.current = {
      status: 'disconnected',
      reconnectAttempts: 0
    };
  }, []);

  const refetchCurrentFolder = useCallback(() => {
    // Refetch current folder data to catch any missed events
    const currentPath = window.location.pathname;
    const folderMatch = currentPath.match(/\/folder\/([^\/]+)/);
    
    if (folderMatch) {
      const folderId = folderMatch[1];
      queryClient.invalidateQueries({ queryKey: ['folder', folderId] });
    } else if (currentPath === '/' || currentPath === '/files') {
      queryClient.invalidateQueries({ queryKey: ['folder', null] });
    }
  }, [queryClient]);

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Page became visible - reconnect if needed and refetch data
        if (connectionStateRef.current.status === 'disconnected') {
          connect();
        }
        refetchCurrentFolder();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [connect, refetchCurrentFolder]);

  // Initialize connection on mount
  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Periodic ping to keep connection alive
  useEffect(() => {
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      }
    }, 25000); // Ping every 25 seconds

    return () => clearInterval(pingInterval);
  }, []);

  return {
    connectionStatus: connectionStateRef.current.status,
    connect,
    disconnect,
    refetchCurrentFolder
  };
}