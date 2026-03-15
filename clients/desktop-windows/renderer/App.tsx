import React, { useState, useEffect } from 'react';
import './App.css';

/**
 * PocketCloud Windows Settings Application
 * 
 * React-based settings interface for Windows system tray app with:
 * - Connection settings and device discovery
 * - Sync folder configuration and status
 * - WebDAV mount management
 * - Notification preferences
 * - Storage usage and system information
 * - Auto-start and advanced options
 */

interface DeviceInfo {
  host: string;
  ip: string;
  port: number;
  version: string;
  deviceName: string;
  storageUsed: number;
  storageTotal: number;
  uptime: number;
}

interface ConnectionSettings {
  host: string;
  ip: string;
  port: number;
  username: string;
  password: string;
}

interface NotificationSettings {
  uploadComplete: boolean;
  syncComplete: boolean;
  lowStorage: boolean;
  connectionLost: boolean;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('connection');
  const [isConnected, setIsConnected] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [connectionSettings, setConnectionSettings] = useState<ConnectionSettings>({
    host: 'pocketcloud.local',
    ip: '192.168.4.1',
    port: 3000,
    username: '',
    password: ''
  });
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [syncFolder, setSyncFolder] = useState('');
  const [notifications, setNotifications] = useState<NotificationSettings>({
    uploadComplete: true,
    syncComplete: true,
    lowStorage: true,
    connectionLost: true
  });
  const [autoStart, setAutoStart] = useState(true);
  const [bandwidthLimit, setBandwidthLimit] = useState(10);
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    loadSettings();
    setupEventListeners();
    
    return () => {
      // Cleanup event listeners
      window.electronAPI?.removeAllListeners('connection-status-changed');
      window.electronAPI?.removeAllListeners('sync-status-changed');
    };
  }, []);

  const loadSettings = async () => {
    try {
      const [
        connection,
        syncEnabledValue,
        syncFolderValue,
        notificationSettings,
        autoStartValue,
        bandwidthValue,
        version
      ] = await Promise.all([
        window.electronAPI.getStoreValue('connection'),
        window.electronAPI.getStoreValue('syncEnabled'),
        window.electronAPI.getStoreValue('syncFolder'),
        window.electronAPI.getStoreValue('notifications'),
        window.electronAPI.getStoreValue('autoStart'),
        window.electronAPI.getStoreValue('bandwidthLimit'),
        window.electronAPI.getAppVersion()
      ]);

      if (connection) setConnectionSettings(connection);
      if (syncEnabledValue !== undefined) setSyncEnabled(syncEnabledValue);
      if (syncFolderValue) setSyncFolder(syncFolderValue);
      if (notificationSettings) setNotifications(notificationSettings);
      if (autoStartValue !== undefined) setAutoStart(autoStartValue);
      if (bandwidthValue) setBandwidthLimit(bandwidthValue);
      if (version) setAppVersion(version);

    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const setupEventListeners = () => {
    window.electronAPI?.onConnectionStatusChanged((connected, deviceInfo) => {
      setIsConnected(connected);
      setDeviceInfo(deviceInfo || null);
    });

    window.electronAPI?.onSyncStatusChanged((syncing) => {
      // Update sync status in UI if needed
    });
  };

  const saveConnectionSettings = async () => {
    try {
      await window.electronAPI.setStoreValue('connection', connectionSettings);
      window.electronAPI.forceReconnect();
    } catch (error) {
      console.error('Failed to save connection settings:', error);
    }
  };

  const toggleSync = async () => {
    try {
      const newSyncEnabled = !syncEnabled;
      setSyncEnabled(newSyncEnabled);
      await window.electronAPI.setStoreValue('syncEnabled', newSyncEnabled);
      
      if (newSyncEnabled) {
        window.electronAPI.startSync();
      } else {
        window.electronAPI.stopSync();
      }
    } catch (error) {
      console.error('Failed to toggle sync:', error);
    }
  };

  const selectSyncFolder = async () => {
    // This would typically open a folder picker dialog
    // For now, we'll use a simple prompt
    const newFolder = prompt('Enter sync folder path:', syncFolder);
    if (newFolder) {
      setSyncFolder(newFolder);
      await window.electronAPI.setStoreValue('syncFolder', newFolder);
    }
  };

  const saveNotificationSettings = async () => {
    try {
      await window.electronAPI.setStoreValue('notifications', notifications);
    } catch (error) {
      console.error('Failed to save notification settings:', error);
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
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const renderConnectionTab = () => (
    <div className="tab-content">
      <div className="section">
        <h3>Device Status</h3>
        <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
          <div className="status-dot"></div>
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
        
        {deviceInfo && (
          <div className="device-info">
            <div className="info-row">
              <span>Device:</span>
              <span>{deviceInfo.deviceName}</span>
            </div>
            <div className="info-row">
              <span>Host:</span>
              <span>{deviceInfo.host}:{deviceInfo.port}</span>
            </div>
            <div className="info-row">
              <span>Version:</span>
              <span>{deviceInfo.version}</span>
            </div>
            <div className="info-row">
              <span>Uptime:</span>
              <span>{formatUptime(deviceInfo.uptime)}</span>
            </div>
            <div className="info-row">
              <span>Storage:</span>
              <span>{formatBytes(deviceInfo.storageTotal - deviceInfo.storageUsed)} free of {formatBytes(deviceInfo.storageTotal)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="section">
        <h3>Connection Settings</h3>
        <div className="form-group">
          <label>Hostname:</label>
          <input
            type="text"
            value={connectionSettings.host}
            onChange={(e) => setConnectionSettings({...connectionSettings, host: e.target.value})}
            placeholder="pocketcloud.local"
          />
        </div>
        <div className="form-group">
          <label>IP Address:</label>
          <input
            type="text"
            value={connectionSettings.ip}
            onChange={(e) => setConnectionSettings({...connectionSettings, ip: e.target.value})}
            placeholder="192.168.4.1"
          />
        </div>
        <div className="form-group">
          <label>Port:</label>
          <input
            type="number"
            value={connectionSettings.port}
            onChange={(e) => setConnectionSettings({...connectionSettings, port: parseInt(e.target.value)})}
            placeholder="3000"
          />
        </div>
        <div className="form-group">
          <label>Username:</label>
          <input
            type="text"
            value={connectionSettings.username}
            onChange={(e) => setConnectionSettings({...connectionSettings, username: e.target.value})}
            placeholder="admin"
          />
        </div>
        <div className="form-group">
          <label>Password:</label>
          <input
            type="password"
            value={connectionSettings.password}
            onChange={(e) => setConnectionSettings({...connectionSettings, password: e.target.value})}
            placeholder="Enter password"
          />
        </div>
        <button onClick={saveConnectionSettings} className="btn-primary">
          Save & Reconnect
        </button>
      </div>
    </div>
  );

  const renderSyncTab = () => (
    <div className="tab-content">
      <div className="section">
        <h3>Folder Sync</h3>
        <div className="sync-toggle">
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={syncEnabled}
              onChange={toggleSync}
            />
            <span className="slider"></span>
          </label>
          <span>Enable automatic folder synchronization</span>
        </div>
        
        <div className="form-group">
          <label>Sync Folder:</label>
          <div className="folder-input">
            <input
              type="text"
              value={syncFolder}
              readOnly
              placeholder="No folder selected"
            />
            <button onClick={selectSyncFolder} className="btn-secondary">
              Browse
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>Bandwidth Limit (MB/s):</label>
          <input
            type="number"
            value={bandwidthLimit}
            onChange={(e) => setBandwidthLimit(parseInt(e.target.value))}
            min="1"
            max="100"
          />
          <small>Set to 0 for unlimited bandwidth</small>
        </div>
      </div>

      <div className="section">
        <h3>WebDAV Network Drive</h3>
        <p>Mount PocketCloud as a network drive in Windows Explorer.</p>
        <div className="webdav-info">
          <div className="info-row">
            <span>Drive Letter:</span>
            <span>P: (PocketCloud)</span>
          </div>
          <div className="info-row">
            <span>URL:</span>
            <span>http://{connectionSettings.host}:{connectionSettings.port}/webdav</span>
          </div>
        </div>
        <button className="btn-secondary">
          Mount Network Drive
        </button>
      </div>
    </div>
  );

  const renderNotificationsTab = () => (
    <div className="tab-content">
      <div className="section">
        <h3>Notification Preferences</h3>
        
        <div className="checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={notifications.uploadComplete}
              onChange={(e) => setNotifications({...notifications, uploadComplete: e.target.checked})}
            />
            <span>File upload complete</span>
          </label>
          
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={notifications.syncComplete}
              onChange={(e) => setNotifications({...notifications, syncComplete: e.target.checked})}
            />
            <span>Folder sync complete</span>
          </label>
          
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={notifications.lowStorage}
              onChange={(e) => setNotifications({...notifications, lowStorage: e.target.checked})}
            />
            <span>Low storage warnings</span>
          </label>
          
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={notifications.connectionLost}
              onChange={(e) => setNotifications({...notifications, connectionLost: e.target.checked})}
            />
            <span>Connection lost alerts</span>
          </label>
        </div>
        
        <button onClick={saveNotificationSettings} className="btn-primary">
          Save Preferences
        </button>
      </div>
    </div>
  );

  const renderAdvancedTab = () => (
    <div className="tab-content">
      <div className="section">
        <h3>Startup Options</h3>
        
        <div className="checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
            />
            <span>Start PocketCloud with Windows</span>
          </label>
        </div>
      </div>

      <div className="section">
        <h3>Application Info</h3>
        <div className="info-row">
          <span>Version:</span>
          <span>{appVersion}</span>
        </div>
        <div className="info-row">
          <span>Platform:</span>
          <span>Windows</span>
        </div>
        
        <div className="button-group">
          <button className="btn-secondary" onClick={() => window.electronAPI.openExternal('https://pocketcloud.local/help')}>
            Help & Documentation
          </button>
          <button className="btn-secondary" onClick={() => window.electronAPI.openExternal('https://github.com/pocketcloud/pocketcloud-windows')}>
            View on GitHub
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app">
      <div className="header">
        <h1>PocketCloud Drive</h1>
        <div className="window-controls">
          <button onClick={() => window.electronAPI.minimizeWindow()}>−</button>
          <button onClick={() => window.electronAPI.closeWindow()}>×</button>
        </div>
      </div>

      <div className="main-content">
        <div className="sidebar">
          <nav className="nav-tabs">
            <button
              className={activeTab === 'connection' ? 'active' : ''}
              onClick={() => setActiveTab('connection')}
            >
              Connection
            </button>
            <button
              className={activeTab === 'sync' ? 'active' : ''}
              onClick={() => setActiveTab('sync')}
            >
              Sync & Drive
            </button>
            <button
              className={activeTab === 'notifications' ? 'active' : ''}
              onClick={() => setActiveTab('notifications')}
            >
              Notifications
            </button>
            <button
              className={activeTab === 'advanced' ? 'active' : ''}
              onClick={() => setActiveTab('advanced')}
            >
              Advanced
            </button>
          </nav>
        </div>

        <div className="content">
          {activeTab === 'connection' && renderConnectionTab()}
          {activeTab === 'sync' && renderSyncTab()}
          {activeTab === 'notifications' && renderNotificationsTab()}
          {activeTab === 'advanced' && renderAdvancedTab()}
        </div>
      </div>
    </div>
  );
};

export default App;