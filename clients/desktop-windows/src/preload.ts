import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script for PocketCloud Windows renderer process
 * 
 * Exposes safe IPC methods to the renderer process for:
 * - Settings management via electron-store
 * - System integration (file operations, external links)
 * - App information and version checking
 */

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Store operations
  getStoreValue: (key: string) => ipcRenderer.invoke('get-store-value', key),
  setStoreValue: (key: string, value: any) => ipcRenderer.invoke('set-store-value', key, value),
  
  // App information
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // System operations
  showItemInFolder: (path: string) => ipcRenderer.invoke('show-item-in-folder', path),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  
  // Window operations
  closeWindow: () => ipcRenderer.send('close-window'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  
  // Service operations
  startSync: () => ipcRenderer.send('start-sync'),
  stopSync: () => ipcRenderer.send('stop-sync'),
  forceReconnect: () => ipcRenderer.send('force-reconnect'),
  
  // Event listeners
  onConnectionStatusChanged: (callback: (connected: boolean, deviceInfo?: any) => void) => {
    ipcRenderer.on('connection-status-changed', (_, connected, deviceInfo) => callback(connected, deviceInfo));
  },
  
  onSyncStatusChanged: (callback: (syncing: boolean) => void) => {
    ipcRenderer.on('sync-status-changed', (_, syncing) => callback(syncing));
  },
  
  onUploadProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('upload-progress', (_, progress) => callback(progress));
  },
  
  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

// Types for TypeScript
declare global {
  interface Window {
    electronAPI: {
      getStoreValue: (key: string) => Promise<any>;
      setStoreValue: (key: string, value: any) => Promise<void>;
      getAppVersion: () => Promise<string>;
      showItemInFolder: (path: string) => Promise<void>;
      openExternal: (url: string) => Promise<void>;
      closeWindow: () => void;
      minimizeWindow: () => void;
      startSync: () => void;
      stopSync: () => void;
      forceReconnect: () => void;
      onConnectionStatusChanged: (callback: (connected: boolean, deviceInfo?: any) => void) => void;
      onSyncStatusChanged: (callback: (syncing: boolean) => void) => void;
      onUploadProgress: (callback: (progress: any) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}