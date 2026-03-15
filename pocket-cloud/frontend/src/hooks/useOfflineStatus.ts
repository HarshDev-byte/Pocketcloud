import { useState, useEffect } from 'react';

interface OfflineStatus {
  isOnline: boolean;
  wasOffline: boolean;
}

export function useOfflineStatus(): OfflineStatus {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    let healthCheckInterval: NodeJS.Timeout;
    let wasOfflineTimeout: NodeJS.Timeout;

    const updateOnlineStatus = () => {
      const online = navigator.onLine;
      
      if (!isOnline && online) {
        // Coming back online
        setWasOffline(true);
        // Clear the "was offline" flag after 30 seconds
        wasOfflineTimeout = setTimeout(() => {
          setWasOffline(false);
        }, 30000);
      }
      
      setIsOnline(online);
    };

    const performHealthCheck = async () => {
      try {
        const response = await fetch('/api/health', {
          method: 'HEAD',
          cache: 'no-cache',
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        
        const actuallyOnline = response.ok;
        
        if (!isOnline && actuallyOnline) {
          // We're actually online, update status
          setIsOnline(true);
          setWasOffline(true);
          wasOfflineTimeout = setTimeout(() => {
            setWasOffline(false);
          }, 30000);
        } else if (isOnline && !actuallyOnline) {
          // We think we're online but server is unreachable
          setIsOnline(false);
        }
      } catch (error) {
        // Health check failed, we're likely offline
        if (isOnline) {
          setIsOnline(false);
        }
      }
    };

    // Listen to browser online/offline events
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Periodic health check when we think we're offline
    const startHealthCheck = () => {
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
      }
      
      if (!isOnline) {
        // Check every 10 seconds when offline
        healthCheckInterval = setInterval(performHealthCheck, 10000);
      }
    };

    // Start health check if currently offline
    startHealthCheck();

    // Restart health check when status changes
    const statusChangeHandler = () => {
      startHealthCheck();
    };

    // Monitor online status changes
    const onlineHandler = () => {
      updateOnlineStatus();
      startHealthCheck();
    };

    const offlineHandler = () => {
      updateOnlineStatus();
      startHealthCheck();
    };

    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);

    // Perform initial health check
    if (isOnline) {
      performHealthCheck();
    }

    // Cleanup
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
      
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
      }
      
      if (wasOfflineTimeout) {
        clearTimeout(wasOfflineTimeout);
      }
    };
  }, [isOnline]);

  return { isOnline, wasOffline };
}

export default useOfflineStatus;