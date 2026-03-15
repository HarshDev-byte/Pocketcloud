import React, { useState, useEffect } from 'react';

interface Settings {
  connection: {
    lastKnownIP: string;
    username: string;
    password: string;
    autoConnect: boolean;
  };
  sync: {
    enabled: boolean;
    folder: string;
    bandwidthLimit: number;
    ignorePatterns: string[];
  };
  notifications: {
    uploadComplete: boolean;
    syncComplete: boolean;
    lowStorage: boolean;
    connectionLost: boolean;
  };
  startup: {
    launchAtLogin: boolean;
  };
}

interface DeviceInfo {
  name: string;
  ip: string;
  storage: {
    total: number;
    used: number;
    free: number;
  };
  version: string;
  uptime: number;
}

const App: React.FC = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const [testingConnection, setTestingConnection] = useState(false);

  useEffect(() => {
    loadSettings();
    loadDeviceInfo();
  }, []);

  const loadSettings = async () => {
    try {
      const loadedSettings = await window.electronAPI.getSettings();
      setSettings(loadedSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadDeviceInfo = async () => {
    try {
      const info = await window.electronAPI.getDeviceInfo();
      setDeviceInfo(info);
      setConnectionStatus(info ? 'connected' : 'disconnected');
    } catch (error) {
      console.error('Failed to load device info:', error);
      setConnectionStatus('disconnected');
    }
  };

  const updateSetting = async (key: string, value: any) => {
    try {
      await window.electronAPI.setSetting(key, value);
      
      // Update local state
      setSettings(prev => {
        if (!prev) return prev;
        
        const keys = key.split('.');
        const newSettings = { ...prev };
        let current: any = newSettings;
        
        for (let i = 0; i < keys.length - 1; i++) {
          current = current[keys[i]];
        }
        
        current[keys[keys.length - 1]] = value;
        return newSettings;
      });
    } catch (error) {
      console.error('Failed to update setting:', error);
    }
  };

  const testConnection = async () => {
    if (!settings?.connection.lastKnownIP) return;
    
    setTestingConnection(true);
    setConnectionStatus('connecting');
    
    try {
      const isConnected = await window.electronAPI.testConnection(settings.connection.lastKnownIP);
      setConnectionStatus(isConnected ? 'connected' : 'disconnected');
      
      if (isConnected) {
        await loadDeviceInfo();
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      setConnectionStatus('disconnected');
    } finally {
      setTestingConnection(false);
    }
  };

  const chooseSyncFolder = async () => {
    try {
      const folder = await window.electronAPI.chooseSyncFolder();
      if (folder) {
        await updateSetting('sync.folder', folder);
      }
    } catch (error) {
      console.error('Failed to choose sync folder:', error);
    }
  };

  const openSyncFolder = async () => {
    try {
      await window.electronAPI.openSyncFolder();
    } catch (error) {
      console.error('Failed to open sync folder:', error);
    }
  };

  const forceSync = async () => {
    try {
      await window.electronAPI.forceSync();
    } catch (error) {
      console.error('Failed to force sync:', error);
    }
  };

  const checkForUpdates = async () => {
    try {
      await window.electronAPI.checkForUpdates();
    } catch (error) {
      console.error('Failed to check for updates:', error);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  if (!settings) {
    return (
      <div className="app">
        <div className="toolbar">
          <h1>Loading...</h1>
        </div>
      </div>
    );
  }

  const storageUsagePercent = deviceInfo 
    ? (deviceInfo.storage.used / deviceInfo.storage.total) * 100 
    : 0;

  return (
    <div className="app">
      <div className="toolbar">
        <h1>PocketCloud Preferences</h1>
      </div>
      
      <div className="content">
        {/* Connection Section */}
        <div className="section">
          <div className="section-header">Connection</div>
          <div className="section-content">
            <div className="form-group">
              <label>
                <span className={`status-indicator status-${connectionStatus}`}></span>
                Status: {connectionStatus === 'connected' ? 'Connected' : 
                        connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
              </label>
              {deviceInfo && (
                <div className="help-text">
                  Connected to {deviceInfo.name} ({deviceInfo.ip})
                </div>
              )}
            </div>
            
            <div className="form-group">
              <label htmlFor="ip-address">IP Address</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="ip-address"
                  type="text"
                  value={settings.connection.lastKnownIP}
                  onChange={(e) => updateSetting('connection.lastKnownIP', e.target.value)}
                  placeholder="192.168.4.1"
                />
                <button 
                  className="button" 
                  onClick={testConnection}
                  disabled={testingConnection}
                >
                  {testingConnection ? 'Testing...' : 'Test'}
                </button>
              </div>
              <div className="help-text">
                Usually auto-discovered as 192.168.4.1 or pocketcloud.local
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={settings.connection.username}
                onChange={(e) => updateSetting('connection.username', e.target.value)}
                placeholder="admin"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={settings.connection.password}
                onChange={(e) => updateSetting('connection.password', e.target.value)}
                placeholder="Enter password"
              />
            </div>
            
            <div className="checkbox-group">
              <input
                type="checkbox"
                id="auto-connect"
                checked={settings.connection.autoConnect}
                onChange={(e) => updateSetting('connection.autoConnect', e.target.checked)}
              />
              <label htmlFor="auto-connect">Connect automatically when available</label>
            </div>
          </div>
        </div>

        {/* Sync Section */}
        <div className="section">
          <div className="section-header">Folder Sync</div>
          <div className="section-content">
            <div className="checkbox-group">
              <input
                type="checkbox"
                id="sync-enabled"
                checked={settings.sync.enabled}
                onChange={(e) => updateSetting('sync.enabled', e.target.checked)}
              />
              <label htmlFor="sync-enabled">Enable automatic folder sync</label>
            </div>
            
            <div className="form-group">
              <label>Sync Folder</label>
              <div className="folder-path">
                <input
                  type="text"
                  value={settings.sync.folder}
                  readOnly
                  placeholder="Choose folder..."
                />
                <button className="button" onClick={chooseSyncFolder}>
                  Choose...
                </button>
                <button className="button" onClick={openSyncFolder}>
                  Open
                </button>
              </div>
              <div className="help-text">
                Files in this folder will be automatically synced to PocketCloud
              </div>
            </div>
            
            <div className="form-group">
              <label>Bandwidth Limit</label>
              <div className="slider-container">
                <input
                  type="range"
                  className="slider"
                  min="1"
                  max="50"
                  value={settings.sync.bandwidthLimit}
                  onChange={(e) => updateSetting('sync.bandwidthLimit', parseInt(e.target.value))}
                />
                <div className="slider-value">
                  {settings.sync.bandwidthLimit} MB/s
                </div>
              </div>
              <div className="help-text">
                Limit upload speed to avoid saturating WiFi for other users
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="button" onClick={forceSync}>
                Sync Now
              </button>
            </div>
          </div>
        </div>

        {/* Notifications Section */}
        <div className="section">
          <div className="section-header">Notifications</div>
          <div className="section-content">
            <div className="checkbox-group">
              <input
                type="checkbox"
                id="notify-upload"
                checked={settings.notifications.uploadComplete}
                onChange={(e) => updateSetting('notifications.uploadComplete', e.target.checked)}
              />
              <label htmlFor="notify-upload">Upload complete</label>
            </div>
            
            <div className="checkbox-group">
              <input
                type="checkbox"
                id="notify-sync"
                checked={settings.notifications.syncComplete}
                onChange={(e) => updateSetting('notifications.syncComplete', e.target.checked)}
              />
              <label htmlFor="notify-sync">Sync complete</label>
            </div>
            
            <div className="checkbox-group">
              <input
                type="checkbox"
                id="notify-storage"
                checked={settings.notifications.lowStorage}
                onChange={(e) => updateSetting('notifications.lowStorage', e.target.checked)}
              />
              <label htmlFor="notify-storage">Low storage warning</label>
            </div>
            
            <div className="checkbox-group">
              <input
                type="checkbox"
                id="notify-connection"
                checked={settings.notifications.connectionLost}
                onChange={(e) => updateSetting('notifications.connectionLost', e.target.checked)}
              />
              <label htmlFor="notify-connection">Connection status changes</label>
            </div>
          </div>
        </div>

        {/* Startup Section */}
        <div className="section">
          <div className="section-header">Startup</div>
          <div className="section-content">
            <div className="checkbox-group">
              <input
                type="checkbox"
                id="launch-at-login"
                checked={settings.startup.launchAtLogin}
                onChange={(e) => updateSetting('startup.launchAtLogin', e.target.checked)}
              />
              <label htmlFor="launch-at-login">Launch PocketCloud at login</label>
            </div>
            <div className="help-text">
              PocketCloud will start automatically when you log in to macOS
            </div>
          </div>
        </div>

        {/* Device Info Section */}
        {deviceInfo && (
          <div className="section">
            <div className="section-header">Device Information</div>
            <div className="section-content">
              <div className="form-group">
                <label>Device</label>
                <div>{deviceInfo.name} ({deviceInfo.ip})</div>
                <div className="help-text">Version {deviceInfo.version} • Uptime {formatUptime(deviceInfo.uptime)}</div>
              </div>
              
              <div className="form-group">
                <label>Storage</label>
                <div className="storage-bar">
                  <div 
                    className="storage-bar-fill" 
                    style={{ width: `${storageUsagePercent}%` }}
                  ></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666' }}>
                  <span>{formatBytes(deviceInfo.storage.used)} used</span>
                  <span>{formatBytes(deviceInfo.storage.free)} free</span>
                </div>
                <div className="help-text">
                  {formatBytes(deviceInfo.storage.total)} total • {Math.round(storageUsagePercent)}% used
                </div>
              </div>
            </div>
          </div>
        )}

        {/* About Section */}
        <div className="section">
          <div className="section-header">About</div>
          <div className="section-content">
            <div className="version-info">
              <div>PocketCloud Drive for macOS</div>
              <div>Version 1.0.0</div>
              <div style={{ marginTop: '8px' }}>
                <button className="button" onClick={checkForUpdates}>
                  Check for Updates
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;