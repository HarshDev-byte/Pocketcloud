/**
 * Hook for WiFi network scanning
 * Calls GET /api/network/wifi/scan with SSE streaming
 */

import { useState, useCallback } from 'react';

export interface WifiNetwork {
  ssid: string;
  signal: number;
  secured: boolean;
  frequency: string;
}

export function useWifiScan() {
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setIsScanning(true);
    setError(null);
    setNetworks([]);

    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Authentication required');
      }

      const eventSource = new EventSource('/api/network/wifi/scan', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      } as any);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.status === 'scanning') {
            // Keep scanning state
          } else if (data.status === 'complete') {
            setNetworks(data.networks || []);
            setIsScanning(false);
            eventSource.close();
          } else if (data.status === 'error') {
            setError(data.message || 'WiFi scan failed');
            setIsScanning(false);
            eventSource.close();
          }
        } catch (err) {
          console.error('Error parsing SSE data:', err);
          setError('Failed to parse scan results');
          setIsScanning(false);
          eventSource.close();
        }
      };

      eventSource.onerror = (err) => {
        console.error('SSE error:', err);
        setError('Connection error during scan');
        setIsScanning(false);
        eventSource.close();
      };

      // Timeout after 30 seconds
      setTimeout(() => {
        if (isScanning) {
          eventSource.close();
          setError('Scan timeout');
          setIsScanning(false);
        }
      }, 30000);

    } catch (err) {
      console.error('WiFi scan error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start scan');
      setIsScanning(false);
    }
  }, [isScanning]);

  return {
    networks,
    isScanning,
    scan,
    error
  };
}