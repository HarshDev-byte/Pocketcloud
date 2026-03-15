import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script for PocketCloud macOS app
 * 
 * Exposes secure IPC communication between renderer and main process
 */

// Define the API interface
interface ElectronAPI {
  // Settings management
  getSettings: () => Promise<any>;
  setSetting: (key: string, value: any) => Promise<boolean>;
  
  // Device management
  getDeviceInfo: () => Promise<any>;
  testConnection: (ip: string) => Promise<boolean>;
  
  // File operations
  chooseSyncFolder: () => Promise<string | null>;
  openSyncFolder: () => Promise<void>;
  
  // Sync operations
  forceSync: () => Promise<void>;
  
  // App operations
  checkForUpdates: () => Promise<void>;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const electronAPI: ElectronAPI = {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key: string, value: any) => ipcRenderer.invoke('set-setting', key, value),
  getDeviceInfo: () => ipcRenderer.invoke('get-device-info'),
  testConnection: (ip: string) => ipcRenderer.invoke('test-connection', ip),
  chooseSyncFolder: () => ipcRenderer.invoke('choose-sync-folder'),
  openSyncFolder: () => ipcRenderer.invoke('open-sync-folder'),
  forceSync: () => ipcRenderer.invoke('force-sync'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates')
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for the renderer process
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}