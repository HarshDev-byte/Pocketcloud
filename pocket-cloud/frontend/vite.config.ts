import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react({
      // Optimize React for production
      babel: {
        plugins: process.env.NODE_ENV === 'production' ? [
          ['babel-plugin-transform-remove-console', { exclude: ['error', 'warn'] }]
        ] : []
      }
    }),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          // App shell - CacheFirst with version control
          {
            urlPattern: ({ request }) => 
              request.destination === 'document' ||
              request.destination === 'script' ||
              request.destination === 'style',
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-shell-v1',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
              }
            }
          },
          // API responses - NetworkFirst with 5s timeout
          {
            urlPattern: ({ url }) => 
              url.pathname.startsWith('/api/files') || 
              url.pathname.startsWith('/api/folders') ||
              url.pathname.startsWith('/api/storage'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache-v1',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 // 60 seconds TTL
              }
            }
          },
          // Thumbnails - CacheFirst with long TTL
          {
            urlPattern: ({ url }) => 
              url.pathname.includes('/thumbnails/') || 
              url.pathname.includes('/api/media/thumbnail'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'thumbnails-v1',
              expiration: {
                maxEntries: 500, // Max 500 entries
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days TTL
              }
            }
          },
          // File downloads - NetworkOnly (never cache large files)
          {
            urlPattern: ({ url }) => 
              url.pathname.includes('/api/files/download') || 
              url.pathname.includes('/api/media/stream'),
            handler: 'NetworkOnly'
          },
          // Auth and status pages - NetworkOnly (never serve stale auth)
          {
            urlPattern: ({ url }) => 
              url.pathname.startsWith('/api/auth') ||
              url.pathname.startsWith('/api/health') ||
              url.pathname === '/login',
            handler: 'NetworkOnly'
          }
        ]
      },
      manifest: {
        name: 'PocketCloud Drive',
        short_name: 'PocketCloud',
        description: 'Your personal portable cloud storage',
        start_url: '/?source=pwa',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0f172a',
        theme_color: '#2563eb',
        scope: '/',
        lang: 'en',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        share_target: {
          action: '/upload-share',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [
              {
                name: 'files',
                accept: ['*/*']
              }
            ]
          }
        },
        shortcuts: [
          {
            name: 'Upload Files',
            url: '/files?action=upload',
            icons: [
              {
                src: '/icons/upload-96.png',
                sizes: '96x96'
              }
            ]
          },
          {
            name: 'Recent Files',
            url: '/files?view=recent',
            icons: [
              {
                src: '/icons/recent-96.png',
                sizes: '96x96'
              }
            ]
          }
        ]
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info'],
        passes: 2
      },
      mangle: {
        safari10: true
      },
      format: {
        comments: false
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk for React ecosystem
          vendor: ['react', 'react-dom', 'react-router-dom'],
          // UI components and icons
          ui: ['lucide-react', '@heroicons/react'],
          // Utilities and data fetching
          utils: ['@tanstack/react-query', '@tanstack/react-virtual', 'axios'],
          // State management
          store: ['zustand']
        },
        // Optimize chunk file names
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId ? chunkInfo.facadeModuleId.split('/').pop() : 'chunk';
          return `js/${facadeModuleId}-[hash].js`;
        },
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name!.split('.');
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `img/[name]-[hash][extname]`;
          }
          if (/css/i.test(ext)) {
            return `css/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        }
      },
      // External dependencies (if serving from CDN)
      external: process.env.NODE_ENV === 'production' ? [] : []
    },
    target: 'es2020',
    // Optimize for Pi 4B constraints
    chunkSizeWarningLimit: 400, // 400KB chunks max
    assetsInlineLimit: 4096, // 4KB inline threshold
    cssCodeSplit: true,
    // Enable gzip compression
    reportCompressedSize: true
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      '@tanstack/react-virtual',
      'zustand',
      'axios'
    ],
    exclude: ['@vite/client', '@vite/env']
  },
  // Performance optimizations
  esbuild: {
    // Remove console logs in production
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    legalComments: 'none'
  }
})