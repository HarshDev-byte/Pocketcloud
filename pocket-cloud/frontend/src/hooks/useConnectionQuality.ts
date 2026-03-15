import { useState, useEffect, useCallback } from 'react';

interface NetworkConnection extends EventTarget {
  downlink?: number;
  effectiveType?: '2g' | '3g' | '4g' | 'slow-2g';
  rtt?: number;
  saveData?: boolean;
  type?: 'bluetooth' | 'cellular' | 'ethernet' | 'none' | 'wifi' | 'wimax' | 'other' | 'unknown';
}

interface ConnectionQuality {
  speed: number; // Mbps
  quality: 'slow' | 'medium' | 'fast';
  type: string;
  effectiveType: string;
  rtt: number; // Round trip time in ms
  saveData: boolean;
  isOnline: boolean;
  adaptiveSettings: {
    thumbnailQuality: 'low' | 'medium' | 'high';
    videoAutoplay: boolean;
    uploadChunkSize: number; // bytes
    maxConcurrentUploads: number;
    enablePreloading: boolean;
  };
}

export function useConnectionQuality() {
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>({
    speed: 0,
    quality: 'medium',
    type: 'unknown',
    effectiveType: 'unknown',
    rtt: 0,
    saveData: false,
    isOnline: navigator.onLine,
    adaptiveSettings: {
      thumbnailQuality: 'medium',
      videoAutoplay: false,
      uploadChunkSize: 5 * 1024 * 1024, // 5MB default
      maxConcurrentUploads: 3,
      enablePreloading: true
    }
  });

  // Get network connection info
  const getConnectionInfo = useCallback((): Partial<ConnectionQuality> => {
    const connection = (navigator as any).connection as NetworkConnection | undefined;
    
    if (!connection) {
      return {
        speed: 10, // Assume decent connection if no info available
        quality: 'medium',
        type: 'unknown',
        effectiveType: 'unknown',
        rtt: 100,
        saveData: false
      };
    }

    const speed = connection.downlink || 10;
    const effectiveType = connection.effectiveType || 'unknown';
    const rtt = connection.rtt || 100;
    const saveData = connection.saveData || false;
    const type = connection.type || 'unknown';

    // Determine quality based on speed and effective type
    let quality: 'slow' | 'medium' | 'fast' = 'medium';
    
    if (speed < 1 || effectiveType === 'slow-2g' || effectiveType === '2g') {
      quality = 'slow';
    } else if (speed > 10 || effectiveType === '4g') {
      quality = 'fast';
    }

    return {
      speed,
      quality,
      type,
      effectiveType,
      rtt,
      saveData
    };
  }, []);

  // Calculate adaptive settings based on connection quality
  const calculateAdaptiveSettings = useCallback((quality: 'slow' | 'medium' | 'fast', speed: number, saveData: boolean) => {
    const settings = {
      thumbnailQuality: 'medium' as 'low' | 'medium' | 'high',
      videoAutoplay: false,
      uploadChunkSize: 5 * 1024 * 1024, // 5MB
      maxConcurrentUploads: 3,
      enablePreloading: true
    };

    if (quality === 'slow' || saveData) {
      settings.thumbnailQuality = 'low';
      settings.videoAutoplay = false;
      settings.uploadChunkSize = 1 * 1024 * 1024; // 1MB
      settings.maxConcurrentUploads = 1;
      settings.enablePreloading = false;
    } else if (quality === 'fast' && speed > 10) {
      settings.thumbnailQuality = 'high';
      settings.videoAutoplay = true;
      settings.uploadChunkSize = 10 * 1024 * 1024; // 10MB
      settings.maxConcurrentUploads = 5;
      settings.enablePreloading = true;
    }

    return settings;
  }, []);

  // Update connection quality
  const updateConnectionQuality = useCallback(() => {
    const connectionInfo = getConnectionInfo();
    const adaptiveSettings = calculateAdaptiveSettings(
      connectionInfo.quality || 'medium',
      connectionInfo.speed || 10,
      connectionInfo.saveData || false
    );

    setConnectionQuality(prev => ({
      ...prev,
      ...connectionInfo,
      isOnline: navigator.onLine,
      adaptiveSettings
    }));
  }, [getConnectionInfo, calculateAdaptiveSettings]);

  // Measure actual connection speed
  const measureConnectionSpeed = useCallback(async (): Promise<number> => {
    try {
      const startTime = performance.now();
      
      // Download a small test file (1KB)
      const response = await fetch('/api/ping', {
        method: 'GET',
        cache: 'no-cache'
      });
      
      if (!response.ok) throw new Error('Speed test failed');
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      const bytes = 1024; // 1KB test
      
      // Calculate speed in Mbps
      const bitsPerSecond = (bytes * 8) / (duration / 1000);
      const mbps = bitsPerSecond / (1024 * 1024);
      
      return Math.max(0.1, mbps); // Minimum 0.1 Mbps
    } catch (error) {
      console.error('Speed measurement failed:', error);
      return connectionQuality.speed; // Return current speed if measurement fails
    }
  }, [connectionQuality.speed]);

  // Periodic speed test
  const runSpeedTest = useCallback(async () => {
    if (!navigator.onLine) return;

    const measuredSpeed = await measureConnectionSpeed();
    
    setConnectionQuality(prev => {
      const newQuality = measuredSpeed < 1 ? 'slow' : measuredSpeed > 10 ? 'fast' : 'medium';
      const adaptiveSettings = calculateAdaptiveSettings(newQuality, measuredSpeed, prev.saveData);
      
      return {
        ...prev,
        speed: measuredSpeed,
        quality: newQuality,
        adaptiveSettings
      };
    });
  }, [measureConnectionSpeed, calculateAdaptiveSettings]);

  // Get connection status string
  const getConnectionStatus = useCallback(() => {
    if (!connectionQuality.isOnline) {
      return 'Offline';
    }

    const { type, speed, quality } = connectionQuality;
    const speedText = speed > 0 ? `${speed.toFixed(1)} Mbps` : '';
    
    let typeText = '';
    switch (type) {
      case 'wifi':
        typeText = 'WiFi';
        break;
      case 'cellular':
        typeText = 'Cellular';
        break;
      case 'ethernet':
        typeText = 'Ethernet';
        break;
      default:
        typeText = 'Connected';
    }

    const qualityEmoji = quality === 'fast' ? '🟢' : quality === 'medium' ? '🟡' : '🔴';
    
    return `${qualityEmoji} ${typeText}${speedText ? ` · ${speedText}` : ''}`;
  }, [connectionQuality]);

  // Get upload recommendations
  const getUploadRecommendations = useCallback(() => {
    const { quality, adaptiveSettings, saveData } = connectionQuality;
    
    const recommendations = {
      chunkSize: adaptiveSettings.uploadChunkSize,
      maxConcurrent: adaptiveSettings.maxConcurrentUploads,
      compressionLevel: quality === 'slow' || saveData ? 0.6 : 0.8,
      enableThumbnails: quality !== 'slow',
      showProgress: true
    };

    return recommendations;
  }, [connectionQuality]);

  // Handle connection events
  useEffect(() => {
    const handleOnline = () => {
      updateConnectionQuality();
      // Run speed test when coming online
      setTimeout(runSpeedTest, 1000);
    };

    const handleOffline = () => {
      setConnectionQuality(prev => ({ ...prev, isOnline: false }));
    };

    const handleConnectionChange = () => {
      updateConnectionQuality();
    };

    // Listen for network events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for connection changes (if supported)
    const connection = (navigator as any).connection;
    if (connection) {
      connection.addEventListener('change', handleConnectionChange);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      
      if (connection) {
        connection.removeEventListener('change', handleConnectionChange);
      }
    };
  }, [updateConnectionQuality, runSpeedTest]);

  // Initial connection quality check
  useEffect(() => {
    updateConnectionQuality();
    
    // Run initial speed test after a delay
    const timer = setTimeout(runSpeedTest, 2000);
    
    return () => clearTimeout(timer);
  }, [updateConnectionQuality, runSpeedTest]);

  // Periodic speed tests (every 5 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      if (navigator.onLine) {
        runSpeedTest();
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [runSpeedTest]);

  return {
    connectionQuality,
    getConnectionStatus,
    getUploadRecommendations,
    runSpeedTest,
    measureConnectionSpeed
  };
}