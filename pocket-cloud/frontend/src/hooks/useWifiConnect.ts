/**
 * Hook for WiFi connection management
 * Calls POST /api/network/wifi/connect with SSE streaming
 */

import { useState, useCallback } from 'react';

export interface ConnectProgress {
  step: string;
  phase: 'connecting' | 'success' | 'error' | 'fallback';
  ip?: string;
  ssid?: string;
  message?: string;
}

export function useWifiConnect() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [progress, setProgress] = useState<ConnectProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (ssid: string, password: string) => {
    setIsConnecting(true);
    setError(null);
    setProgress(null);

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Authentication required');
      }

      const response = await fetch('/api/network/wifi/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({ ssid, password })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.status === 'connecting') {
                setProgress({
                  step: data.message,
                  phase: 'connecting'
                });
              } else if (data.status === 'success') {
                setProgress({
                  step: 'Connected successfully',
                  phase: 'success',
                  ip: data.ip,
                  ssid: data.ssid
                });
                setIsConnecting(false);
              } else if (data.status === 'error') {
                setProgress({
                  step: data.message || 'Connection failed',
                  phase: 'error',
                  message: data.message
                });
                setError(data.message || 'Connection failed');
              } else if (data.status === 'fallback') {
                setProgress({
                  step: data.message || 'Restored hotspot mode',
                  phase: 'fallback',
                  message: data.message
                });
                setIsConnecting(false);
              }
            } catch (err) {
              console.error('Error parsing SSE data:', err);
            }
          }
        }
      }

    } catch (err) {
      console.error('WiFi connect error:', err);
      setError(err instanceof Error ? err.message : 'Connection failed');
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Authentication required');
      }

      const response = await fetch('/api/network/wifi/disconnect', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      setProgress(null);
      setError(null);
      
      return true;
    } catch (err) {
      console.error('WiFi disconnect error:', err);
      setError(err instanceof Error ? err.message : 'Disconnect failed');
      return false;
    }
  }, []);

  return {
    connect,
    disconnect,
    isConnecting,
    progress,
    error
  };
}