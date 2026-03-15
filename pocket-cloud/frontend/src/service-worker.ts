import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { Queue } from 'workbox-background-sync';

declare const self: ServiceWorkerGlobalScope;

// Precache app shell (HTML, JS, CSS)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// 1. App Shell - CacheFirst with version control, serve stale while revalidating
registerRoute(
  ({ request }) => 
    request.destination === 'document' ||
    request.destination === 'script' ||
    request.destination === 'style',
  new CacheFirst({
    cacheName: 'app-shell-v1',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  })
);

// 2. API responses - NetworkFirst with 5s timeout, fallback to cache
registerRoute(
  ({ url }) => 
    url.pathname.startsWith('/api/files') || 
    url.pathname.startsWith('/api/folders') ||
    url.pathname.startsWith('/api/storage'),
  new NetworkFirst({
    cacheName: 'api-cache-v1',
    networkTimeoutSeconds: 5, // 5 second timeout as specified
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60, // 60 seconds TTL as specified
      }),
    ],
  })
);

// 3. Thumbnails - CacheFirst with long TTL (30 days, max 500 entries)
registerRoute(
  ({ url }) => 
    url.pathname.includes('/thumbnails/') || 
    url.pathname.includes('/api/media/thumbnail'),
  new CacheFirst({
    cacheName: 'thumbnails-v1',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 500, // Max 500 entries as specified
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days TTL as specified
      }),
    ],
  })
);

// 4. File downloads - NetworkOnly (never cache large files)
registerRoute(
  ({ url }) => 
    url.pathname.includes('/api/files/download') || 
    url.pathname.includes('/api/media/stream'),
  new NetworkOnly()
);

// 5. Auth and status pages - NetworkOnly (never serve stale auth)
registerRoute(
  ({ url }) => 
    url.pathname.startsWith('/api/auth') ||
    url.pathname.startsWith('/api/health') ||
    url.pathname === '/login',
  new NetworkOnly()
);

// 6. Static assets - StaleWhileRevalidate
registerRoute(
  ({ request }) => 
    request.destination === 'image' ||
    request.destination === 'font',
  new StaleWhileRevalidate({
    cacheName: 'static-assets-v1',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
      }),
    ],
  })
);

// Background sync for failed uploads with tag 'pocketcloud-upload-queue'
const uploadQueue = new Queue('pocketcloud-upload-queue', {
  onSync: async ({ queue }) => {
    let entry;
    while ((entry = await queue.shiftRequest())) {
      try {
        const response = await fetch(entry.request);
        if (response.ok) {
          // Show success notification
          (self as any).registration.showNotification('Upload completed', {
            body: 'File uploaded successfully when connection restored',
            icon: '/icons/icon-192.png',
            badge: '/icons/badge-72.png',
            tag: 'upload-success'
          });
        } else {
          // Re-queue if server error
          await queue.unshiftRequest(entry);
        }
      } catch (error) {
        // Re-queue if network error
        await queue.unshiftRequest(entry);
        console.error('Background sync failed:', error);
      }
    }
  }
});

// Register background sync for upload failures
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/upload'),
  async ({ request }) => {
    try {
      const response = await fetch(request);
      return response;
    } catch (error) {
      // Queue for background sync when offline
      await uploadQueue.pushRequest({ request });
      
      // Return a response indicating queued
      return new Response(
        JSON.stringify({ 
          queued: true, 
          message: 'Upload queued for when connection is restored' 
        }),
        {
          status: 202,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  }
);

// Offline fallback - show offline page with cached folder listing if available
const OFFLINE_PAGE = '/offline.html';

// Cache offline page during install
(self as any).addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open('offline-v1').then((cache) => {
      return cache.addAll([OFFLINE_PAGE]);
    })
  );
});

// Serve offline page when navigation fails, with cached data if available
registerRoute(
  ({ request }) => request.mode === 'navigate',
  async ({ event }) => {
    try {
      return await fetch(event.request);
    } catch (error) {
      // If API fails AND no cache, show offline page
      const cache = await caches.open('offline-v1');
      const offlinePage = await cache.match(OFFLINE_PAGE);
      
      if (offlinePage) {
        // Try to get cached folder listing
        const apiCache = await caches.open('api-cache-v1');
        const cachedFiles = await apiCache.match('/api/files');
        
        if (cachedFiles) {
          // Inject cached data into offline page
          let html = await offlinePage.text();
          const filesData = await cachedFiles.json();
          html = html.replace(
            '<!-- CACHED_DATA -->',
            `<script>window.cachedFiles = ${JSON.stringify(filesData)};</script>`
          );
          return new Response(html, {
            headers: { 'Content-Type': 'text/html' }
          });
        }
      }
      
      return offlinePage || new Response('Offline', { status: 503 });
    }
  }
);

// Handle push notifications
(self as any).addEventListener('push', (event: any) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    vibrate: [200, 100, 200],
    data: data.data,
    actions: data.actions || []
  };

  event.waitUntil(
    (self as any).registration.showNotification(data.title, options)
  );
});

// Handle notification clicks
(self as any).addEventListener('notificationclick', (event: any) => {
  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(
      (self as any).clients.openWindow(event.notification.data?.url || '/')
    );
  }
});

// Skip waiting and claim clients immediately
(self as any).addEventListener('message', (event: any) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    (self as any).skipWaiting();
  }
});

(self as any).addEventListener('activate', (event: any) => {
  event.waitUntil((self as any).clients.claim());
});

// Handle share target (files shared to PocketCloud from iOS/Android)
(self as any).addEventListener('fetch', (event: any) => {
  const url = new URL(event.request.url);
  
  if (url.pathname === '/upload-share' && event.request.method === 'POST') {
    event.respondWith(handleShareTarget(event.request));
  }
});

async function handleShareTarget(request: Request) {
  const formData = await request.formData();
  const files = formData.getAll('files') as File[];
  
  // Store files in IndexedDB for processing when app opens
  if (files.length > 0) {
    try {
      const db = await openDB('shared-files', 1, {
        upgrade(db: any) {
          db.createObjectStore('files', { keyPath: 'id', autoIncrement: true });
        }
      });
      
      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        await db.add('files', {
          name: file.name,
          type: file.type,
          size: file.size,
          data: arrayBuffer,
          timestamp: Date.now()
        });
      }
      
      console.log('Stored shared files:', files.length);
    } catch (error) {
      console.error('Failed to store shared files:', error);
    }
  }
  
  // Redirect to upload share target page
  const redirectUrl = new URL('/upload-share', request.url);
  redirectUrl.searchParams.set('shared', 'true');
  redirectUrl.searchParams.set('count', files.length.toString());
  
  return Response.redirect(redirectUrl.toString(), 302);
}

// Helper function to open IndexedDB
async function openDB(name: string, version: number, options: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      if (options.upgrade) {
        options.upgrade(request.result);
      }
    };
  });
}

// Export for TypeScript
export {};