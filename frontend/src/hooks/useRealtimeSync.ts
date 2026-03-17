import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface RealtimeEvent {
  type: string;
  data: any;
  timestamp: number;
}

export function useRealtimeSync() {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>();
  const reconnectAttempts = useRef(0);
  const queryClient = useQueryClient();

  const reconnectDelays = [1000, 2000, 4000, 8000, 16000, 30000];

  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionStatus('connecting');
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      reconnectAttempts.current = 0;
      
      // Refetch current folder to catch any missed events
      queryClient.invalidateQueries({ queryKey: ['folder'] });
    };

    ws.onmessage = (event) => {
      try {
        const message: RealtimeEvent = JSON.parse(event.data);
        handleRealtimeEvent(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      scheduleReconnect();
    };

    ws.onerror = () => {
      setConnectionStatus('disconnected');
    };
  };

  const scheduleReconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    const delay = reconnectDelays[Math.min(reconnectAttempts.current, reconnectDelays.length - 1)];
    reconnectAttempts.current++;

    setConnectionStatus('reconnecting');

    reconnectTimeoutRef.current = window.setTimeout(() => {
      connect();
    }, delay);
  };

  const handleRealtimeEvent = (event: RealtimeEvent) => {
    switch (event.type) {
      case 'FILE_CREATED':
        // Invalidate folder queries to show new file
        queryClient.invalidateQueries({ queryKey: ['folder'] });
        break;

      case 'FILE_UPDATED':
        // Update specific file in cache
        queryClient.invalidateQueries({ queryKey: ['folder'] });
        break;

      case 'FILE_DELETED':
        // Remove file from cache
        queryClient.invalidateQueries({ queryKey: ['folder'] });
        break;

      case 'FOLDER_CREATED':
        // Add folder to listing
        queryClient.invalidateQueries({ queryKey: ['folder'] });
        break;

      case 'FOLDER_UPDATED':
        // Update folder in cache
        queryClient.invalidateQueries({ queryKey: ['folder'] });
        break;

      case 'FOLDER_DELETED':
        // Remove folder from cache
        queryClient.invalidateQueries({ queryKey: ['folder'] });
        break;

      case 'MEDIA_READY':
        // Update thumbnail URL in cache
        queryClient.invalidateQueries({ queryKey: ['folder'] });
        break;

      case 'STORAGE_UPDATED':
        // Invalidate storage stats
        queryClient.invalidateQueries({ queryKey: ['storage-stats'] });
        break;

      case 'UPLOAD_PROGRESS':
        // This would be handled by upload hook if needed
        break;

      default:
        console.log('Unknown realtime event:', event.type);
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setConnectionStatus('disconnected');
  };

  useEffect(() => {
    connect();

    // Reconnect when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && connectionStatus !== 'connected') {
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return {
    connectionStatus,
    connect,
    disconnect,
  };
}