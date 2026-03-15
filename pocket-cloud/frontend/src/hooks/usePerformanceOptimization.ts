import { useState, useEffect, useCallback, useRef } from 'react';

export interface PerformanceMetrics {
  fcp: number | null; // First Contentful Paint
  lcp: number | null; // Largest Contentful Paint
  fid: number | null; // First Input Delay
  cls: number | null; // Cumulative Layout Shift
  ttfb: number | null; // Time to First Byte
}

export interface NetworkInfo {
  effectiveType: string;
  downlink: number;
  rtt: number;
  saveData: boolean;
}

export function usePerformanceOptimization() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fcp: null,
    lcp: null,
    fid: null,
    cls: null,
    ttfb: null
  });

  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [isSlowConnection, setIsSlowConnection] = useState(false);
  const [shouldOptimizeImages, setShouldOptimizeImages] = useState(false);

  // Measure performance metrics
  useEffect(() => {
    if (!('performance' in window)) return;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        switch (entry.entryType) {
          case 'paint':
            if (entry.name === 'first-contentful-paint') {
              setMetrics(prev => ({ ...prev, fcp: entry.startTime }));
            }
            break;
          case 'largest-contentful-paint':
            setMetrics(prev => ({ ...prev, lcp: entry.startTime }));
            break;
          case 'first-input':
            setMetrics(prev => ({ ...prev, fid: (entry as any).processingStart - entry.startTime }));
            break;
          case 'layout-shift':
            if (!(entry as any).hadRecentInput) {
              setMetrics(prev => ({ 
                ...prev, 
                cls: (prev.cls || 0) + (entry as any).value 
              }));
            }
            break;
        }
      }
    });

    // Observe different entry types
    try {
      observer.observe({ entryTypes: ['paint', 'largest-contentful-paint', 'first-input', 'layout-shift'] });
    } catch (error) {
      console.warn('Performance observer not fully supported');
    }

    // Measure TTFB
    const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navigationEntry) {
      setMetrics(prev => ({ 
        ...prev, 
        ttfb: navigationEntry.responseStart - navigationEntry.requestStart 
      }));
    }

    return () => observer.disconnect();
  }, []);

  // Monitor network conditions
  useEffect(() => {
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    
    if (connection) {
      const updateNetworkInfo = () => {
        const info: NetworkInfo = {
          effectiveType: connection.effectiveType || 'unknown',
          downlink: connection.downlink || 0,
          rtt: connection.rtt || 0,
          saveData: connection.saveData || false
        };
        
        setNetworkInfo(info);
        
        // Determine if connection is slow
        const isSlow = info.effectiveType === 'slow-2g' || 
                      info.effectiveType === '2g' || 
                      info.downlink < 1.5 || 
                      info.saveData;
        
        setIsSlowConnection(isSlow);
        setShouldOptimizeImages(isSlow || info.saveData);
      };

      updateNetworkInfo();
      connection.addEventListener('change', updateNetworkInfo);

      return () => {
        connection.removeEventListener('change', updateNetworkInfo);
      };
    }
  }, []);

  // Image optimization based on device and network
  const getOptimizedImageUrl = useCallback((originalUrl: string, width?: number, height?: number) => {
    if (!shouldOptimizeImages && !isSlowConnection) {
      return originalUrl;
    }

    const url = new URL(originalUrl, window.location.origin);
    
    // Add WebP format if supported
    if (supportsWebP()) {
      url.searchParams.set('format', 'webp');
    }
    
    // Add quality reduction for slow connections
    if (isSlowConnection) {
      url.searchParams.set('quality', '70');
    }
    
    // Add size constraints
    if (width) url.searchParams.set('w', width.toString());
    if (height) url.searchParams.set('h', height.toString());
    
    return url.toString();
  }, [shouldOptimizeImages, isSlowConnection]);

  // Generate srcSet for responsive images
  const generateSrcSet = useCallback((baseUrl: string, sizes: number[]) => {
    return sizes
      .map(size => `${getOptimizedImageUrl(baseUrl, size)} ${size}w`)
      .join(', ');
  }, [getOptimizedImageUrl]);

  // Preload critical resources
  const preloadResource = useCallback((url: string, type: 'image' | 'script' | 'style' | 'font') => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = url;
    link.as = type;
    
    if (type === 'font') {
      link.crossOrigin = 'anonymous';
    }
    
    document.head.appendChild(link);
    
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  // Lazy load images with intersection observer
  const useLazyImage = useCallback((src: string, placeholder?: string) => {
    const [imageSrc, setImageSrc] = useState(placeholder || '');
    const [isLoaded, setIsLoaded] = useState(false);
    const [isError, setIsError] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
      const img = imgRef.current;
      if (!img) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            const image = new Image();
            image.onload = () => {
              setImageSrc(getOptimizedImageUrl(src));
              setIsLoaded(true);
            };
            image.onerror = () => {
              setIsError(true);
            };
            image.src = getOptimizedImageUrl(src);
            observer.disconnect();
          }
        },
        { rootMargin: '50px' }
      );

      observer.observe(img);

      return () => observer.disconnect();
    }, [src]);

    return { imgRef, imageSrc, isLoaded, isError };
  }, [getOptimizedImageUrl]);

  // Defer non-critical JavaScript
  const deferScript = useCallback((src: string, condition?: () => boolean) => {
    const shouldLoad = condition ? condition() : true;
    
    if (!shouldLoad) return;

    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    
    // Load after main thread is idle
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        document.head.appendChild(script);
      });
    } else {
      setTimeout(() => {
        document.head.appendChild(script);
      }, 100);
    }
  }, []);

  // Monitor frame rate
  const useFrameRate = useCallback(() => {
    const [fps, setFps] = useState(60);
    const frameCount = useRef(0);
    const lastTime = useRef(performance.now());

    useEffect(() => {
      let animationId: number;

      const measureFps = () => {
        frameCount.current++;
        const currentTime = performance.now();
        
        if (currentTime - lastTime.current >= 1000) {
          setFps(frameCount.current);
          frameCount.current = 0;
          lastTime.current = currentTime;
        }
        
        animationId = requestAnimationFrame(measureFps);
      };

      animationId = requestAnimationFrame(measureFps);

      return () => cancelAnimationFrame(animationId);
    }, []);

    return fps;
  }, []);

  return {
    metrics,
    networkInfo,
    isSlowConnection,
    shouldOptimizeImages,
    getOptimizedImageUrl,
    generateSrcSet,
    preloadResource,
    useLazyImage,
    deferScript,
    useFrameRate
  };
}

// Utility functions
function supportsWebP(): boolean {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
}

// Hook for monitoring memory usage
export function useMemoryMonitor() {
  const [memoryInfo, setMemoryInfo] = useState<any>(null);

  useEffect(() => {
    const updateMemoryInfo = () => {
      if ('memory' in performance) {
        setMemoryInfo((performance as any).memory);
      }
    };

    updateMemoryInfo();
    const interval = setInterval(updateMemoryInfo, 5000);

    return () => clearInterval(interval);
  }, []);

  return memoryInfo;
}

// Hook for battery status (affects performance decisions)
export function useBatteryStatus() {
  const [batteryInfo, setBatteryInfo] = useState<{
    charging: boolean;
    level: number;
    chargingTime: number;
    dischargingTime: number;
  } | null>(null);

  useEffect(() => {
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        const updateBatteryInfo = () => {
          setBatteryInfo({
            charging: battery.charging,
            level: battery.level,
            chargingTime: battery.chargingTime,
            dischargingTime: battery.dischargingTime
          });
        };

        updateBatteryInfo();
        battery.addEventListener('chargingchange', updateBatteryInfo);
        battery.addEventListener('levelchange', updateBatteryInfo);

        return () => {
          battery.removeEventListener('chargingchange', updateBatteryInfo);
          battery.removeEventListener('levelchange', updateBatteryInfo);
        };
      });
    }
  }, []);

  return batteryInfo;
}