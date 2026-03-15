/**
 * Hook for network status monitoring
 * Polls GET /api/network/status every 10 seconds
 */

import { useState, useEffect, useCallback } from 'react';

export interface NetworkStatus {
  mode: 'hotspot' | 'client' | 'ethernet';
  hotspot: {
    active: boolean;
    ssid: string;
    password: string;
    ip: string;
    connected_devices: number;
  };
  client: {
    connected: boolean;
    ssid: string | null;
    ip: string | null;
  };
  ethernet: {
    connected: boolean;
    ip: string | null;
  };
  mdns: {
    hostname: string;
    active: boolean;
  };
  accessUrls: string[];
}

export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/network/status');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      console.error('Network status fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch network status');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refetch = useCallback(() => {
    setIsLoading(true);
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    // Initial fetch
    fetchStatus();

    // Poll every 10 seconds
    const interval = setInterval(fetchStatus, 10000);

    return () => clearInterval(interval);
  }, [fetchStatus]);

  return {
    status,
    isLoading,
    error,
    refetch
  };
}