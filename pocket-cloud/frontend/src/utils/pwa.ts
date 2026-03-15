export interface PWAUpdateInfo {
  isUpdateAvailable: boolean;
  updateSW: () => Promise<void>;
  offlineReady: boolean;
}

export class PWAManager {
  private registration: ServiceWorkerRegistration | null = null;
  private updateCallback: ((info: PWAUpdateInfo) => void) | null = null;

  constructor() {
    if ('serviceWorker' in navigator) {
      this.setupEventListeners();
    }
  }

  private setupEventListeners() {
    // Listen for service worker updates
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }

  private async updateServiceWorker(): Promise<void> {
    if (!this.registration) return;

    // Send message to service worker to skip waiting
    if (this.registration.waiting) {
      this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  private notifyUpdate(info: PWAUpdateInfo) {
    if (this.updateCallback) {
      this.updateCallback(info);
    }
  }

  public async register(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Worker not supported');
      return;
    }

    try {
      this.registration = await navigator.serviceWorker.register('/service-worker.js');
      
      // Check for updates
      this.registration.addEventListener('updatefound', () => {
        const newWorker = this.registration!.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              this.notifyUpdate({
                isUpdateAvailable: true,
                updateSW: this.updateServiceWorker.bind(this),
                offlineReady: true
              });
            }
          });
        }
      });

      console.log('Service Worker registered successfully');
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }

  public onUpdate(callback: (info: PWAUpdateInfo) => void) {
    this.updateCallback = callback;
  }

  public async checkForUpdates(): Promise<void> {
    if (!this.registration) return;

    try {
      await this.registration.update();
    } catch (error) {
      console.error('Failed to check for updates:', error);
    }
  }
}

// Utility functions for PWA features
export const PWAUtils = {
  // Check if app is installed
  isInstalled(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches ||
           (window.navigator as any).standalone === true;
  },

  // Check if device supports PWA installation
  canInstall(): boolean {
    return 'serviceWorker' in navigator && 
           'PushManager' in window &&
           'Notification' in window;
  },

  // Request notification permission
  async requestNotificationPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      return 'denied';
    }

    if (Notification.permission === 'default') {
      return await Notification.requestPermission();
    }

    return Notification.permission;
  },

  // Show notification
  async showNotification(title: string, options?: NotificationOptions): Promise<void> {
    const permission = await this.requestNotificationPermission();
    
    if (permission === 'granted') {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(title, {
          icon: '/icons/icon-192.png',
          badge: '/icons/badge-72.png',
          ...options
        });
      }
    }
  },

  // Get device info for analytics
  getDeviceInfo() {
    const userAgent = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    const isAndroid = /Android/.test(userAgent);
    const isMobile = /Mobi|Android/i.test(userAgent);
    const isTablet = /iPad/.test(userAgent) || (isAndroid && !/Mobile/.test(userAgent));

    return {
      isIOS,
      isAndroid,
      isMobile,
      isTablet,
      isDesktop: !isMobile && !isTablet,
      userAgent,
      screenSize: {
        width: window.screen.width,
        height: window.screen.height
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      // Android-specific capabilities
      supportsFileSystemAccess: 'showDirectoryPicker' in window,
      supportsWakeLock: 'wakeLock' in navigator,
      supportsVibration: 'vibrate' in navigator,
      supportsBackgroundFetch: 'serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype
    };
  },

  // Handle app shortcuts
  handleShortcut(url: string) {
    const params = new URLSearchParams(url.split('?')[1]);
    const action = params.get('action');
    
    switch (action) {
      case 'upload':
        // Trigger upload dialog
        window.dispatchEvent(new CustomEvent('pwa-shortcut-upload'));
        break;
      default:
        // Navigate to URL
        window.location.href = url;
    }
  },

  // Cache management
  async clearCache(): Promise<void> {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
      );
    }
  },

  // Get cache usage
  async getCacheUsage(): Promise<{ used: number; quota: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0
      };
    }
    return { used: 0, quota: 0 };
  },

  // Android-specific utilities
  async requestWakeLock(): Promise<any> {
    if ('wakeLock' in navigator) {
      try {
        return await (navigator as any).wakeLock.request('screen');
      } catch (error) {
        console.error('Wake lock request failed:', error);
        return null;
      }
    }
    return null;
  },

  // Vibration API for haptic feedback
  vibrate(pattern: number | number[]): boolean {
    if ('vibrate' in navigator) {
      return navigator.vibrate(pattern);
    }
    return false;
  },

  // File System Access API for Android Chrome
  async selectDirectory(): Promise<any> {
    if ('showDirectoryPicker' in window) {
      try {
        return await (window as any).showDirectoryPicker();
      } catch (error) {
        console.log('Directory selection cancelled or failed:', error);
        return null;
      }
    }
    return null;
  },

  // Background fetch for continuing downloads
  async registerBackgroundFetch(id: string, url: string, options: any = {}): Promise<boolean> {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if ('backgroundFetch' in registration) {
          await (registration as any).backgroundFetch.fetch(id, url, options);
          return true;
        }
      } catch (error) {
        console.error('Background fetch registration failed:', error);
      }
    }
    return false;
  }
};

// Background sync utilities
export const BackgroundSync = {
  // Queue upload for background sync
  async queueUpload(uploadData: any): Promise<void> {
    // Store upload data in IndexedDB for retry when online
    await this.storeUploadData(uploadData);
    
    // If service worker supports background sync, register it
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if ('sync' in registration) {
        try {
          await (registration as any).sync.register('upload-sync');
        } catch (error) {
          console.log('Background sync not supported, will retry on reconnect');
        }
      }
    }
  },

  // Store upload data in IndexedDB
  async storeUploadData(data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('pwa-uploads', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['uploads'], 'readwrite');
        const store = transaction.objectStore('uploads');
        
        store.add({
          ...data,
          timestamp: Date.now(),
          status: 'queued'
        });
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      };
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('uploads')) {
          db.createObjectStore('uploads', { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  },

  // Get queued uploads
  async getQueuedUploads(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('pwa-uploads', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['uploads'], 'readonly');
        const store = transaction.objectStore('uploads');
        const getAll = store.getAll();
        
        getAll.onsuccess = () => resolve(getAll.result || []);
        getAll.onerror = () => reject(getAll.error);
      };
    });
  }
};

// Create singleton instance
export const pwaManager = new PWAManager();