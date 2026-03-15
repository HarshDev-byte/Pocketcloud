import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from './store/auth.store'
import { router } from './router'
import { pwaManager, PWAUtils } from './utils/pwa'
import './index.css'

// Create a client with PWA-optimized settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        // Don't retry on 401/403 errors
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          return false;
        }
        // Reduce retries on slow connections
        const maxRetries = PWAUtils.getDeviceInfo().isDesktop ? 3 : 2;
        return failureCount < maxRetries;
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      // Longer cache time on mobile to reduce network usage
      ...(PWAUtils.getDeviceInfo().isMobile && {
        staleTime: 10 * 60 * 1000, // 10 minutes on mobile
        gcTime: 30 * 60 * 1000, // 30 minutes on mobile
      })
    },
  },
});

// App component with providers
const App: React.FC = () => {
  const checkAuth = useAuthStore((state) => state.checkAuth);

  useEffect(() => {
    // Check authentication status on app start
    checkAuth();
    
    // Register PWA service worker
    pwaManager.register();
    
    // Handle PWA updates
    pwaManager.onUpdate((info) => {
      if (info.isUpdateAvailable) {
        // Show update notification
        if (confirm('A new version is available. Update now?')) {
          info.updateSW();
        }
      }
    });

    // Handle PWA shortcuts
    const handleShortcut = () => {
      const params = new URLSearchParams(window.location.search);
      const action = params.get('action');
      
      if (action) {
        PWAUtils.handleShortcut(window.location.href);
      }
    };

    handleShortcut();

    // Listen for PWA shortcut events
    window.addEventListener('pwa-shortcut-upload', () => {
      // Trigger upload dialog
      document.dispatchEvent(new CustomEvent('open-upload-dialog'));
    });

    // Performance monitoring
    if (PWAUtils.getDeviceInfo().isMobile) {
      // Monitor performance on mobile
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'largest-contentful-paint') {
            console.log('LCP:', entry.startTime);
          }
        }
      });
      
      try {
        observer.observe({ entryTypes: ['largest-contentful-paint'] });
      } catch (error) {
        // Performance observer not supported
      }
    }

    return () => {
      window.removeEventListener('pwa-shortcut-upload', () => {});
    };
  }, [checkAuth]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)