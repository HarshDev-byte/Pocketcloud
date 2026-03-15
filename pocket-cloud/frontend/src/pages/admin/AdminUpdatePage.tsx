import React, { useState, useEffect } from 'react';
import { 
  Download, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Clock,
  ArrowLeft,
  ExternalLink
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';

interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  downloadUrl?: string;
  sha256?: string;
  releaseDate?: string;
  size?: number;
}

interface UpdateStatus {
  phase: 'idle' | 'checking' | 'downloading' | 'verifying' | 'installing' | 'migrating' | 'restarting' | 'complete' | 'error' | 'rollback';
  progress: number;
  message: string;
  error?: string;
  startTime?: number;
}

interface UpdateHistoryItem {
  timestamp: number;
  level: string;
  message: string;
  userId?: string;
}

const AdminUpdatePage: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    phase: 'idle',
    progress: 0,
    message: 'Ready'
  });
  const [history, setHistory] = useState<UpdateHistoryItem[]>([]);
  const [checking, setChecking] = useState(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Listen for real-time update status
  const { connectionStatus } = useRealtimeSync();

  useEffect(() => {
    // Load initial data
    checkForUpdates();
    loadUpdateHistory();
    loadUpdateStatus();

    // Set up WebSocket listener for update status
    const handleUpdateStatus = (status: UpdateStatus) => {
      setUpdateStatus(status);
    };

    // Add WebSocket event listener (assuming it's available via realtimeSync)
    if (connectionStatus === 'connected') {
      // WebSocket listener would be set up here
      // For now, we'll poll for status during updates
    }

    return () => {
      // Clean up WebSocket listener
    };
  }, [connectionStatus]);

  // Poll for status during active updates
  useEffect(() => {
    if (updateStatus.phase !== 'idle' && updateStatus.phase !== 'complete' && updateStatus.phase !== 'error') {
      const interval = setInterval(loadUpdateStatus, 2000);
      return () => clearInterval(interval);
    }
  }, [updateStatus.phase]);

  const checkForUpdates = async () => {
    try {
      setChecking(true);
      const response = await apiClient.get('/admin/updates/check');
      setUpdateInfo(response.data);
    } catch (error) {
      console.error('Failed to check for updates:', error);
    } finally {
      setChecking(false);
    }
  };

  const loadUpdateStatus = async () => {
    try {
      const response = await apiClient.get('/admin/updates/status');
      setUpdateStatus(response.data.status);
    } catch (error) {
      console.error('Failed to load update status:', error);
    }
  };

  const loadUpdateHistory = async () => {
    try {
      const response = await apiClient.get('/admin/updates/history');
      setHistory(response.data.history);
    } catch (error) {
      console.error('Failed to load update history:', error);
    }
  };

  const applyUpdate = async () => {
    try {
      await apiClient.post('/admin/updates/apply');
      // Status will be updated via WebSocket or polling
    } catch (error) {
      console.error('Failed to start update:', error);
    }
  };

  const rollbackUpdate = async () => {
    if (!confirm('Are you sure you want to rollback to the previous version? This will restart the Pi.')) {
      return;
    }

    try {
      await apiClient.post('/admin/updates/rollback');
      // Status will be updated via WebSocket or polling
    } catch (error) {
      console.error('Failed to start rollback:', error);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getStatusIcon = () => {
    switch (updateStatus.phase) {
      case 'complete':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'idle':
        return <Clock className="w-5 h-5 text-gray-400" />;
      default:
        return <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />;
    }
  };

  const getStatusColor = () => {
    switch (updateStatus.phase) {
      case 'complete':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      case 'idle':
        return 'text-gray-600';
      default:
        return 'text-blue-600';
    }
  };

  const isUpdateInProgress = updateStatus.phase !== 'idle' && updateStatus.phase !== 'complete' && updateStatus.phase !== 'error';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Updates</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Manage Pi software updates and desktop client versions
          </p>
        </div>
        <button
          onClick={checkForUpdates}
          disabled={checking || isUpdateInProgress}
          className="flex items-center space-x-2 px-4 py-2 bg-pcd-blue-600 text-white rounded-md hover:bg-pcd-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
          <span>Check for Updates</span>
        </button>
      </div>

      {/* Current Version */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Current Version</h3>
          <div className="flex items-center space-x-2">
            {getStatusIcon()}
            <span className={`text-sm font-medium ${getStatusColor()}`}>
              {updateStatus.message}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Installed Version</p>
            <p className="text-xl font-mono font-bold text-gray-900 dark:text-white">
              v{updateInfo?.currentVersion || '1.0.0'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Installation Method</p>
            <p className="text-sm text-gray-900 dark:text-white">
              {process.env.NODE_ENV === 'development' ? 'Development' : 'Production Release'}
            </p>
          </div>
        </div>

        {/* Update Progress */}
        {isUpdateInProgress && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {updateStatus.phase.charAt(0).toUpperCase() + updateStatus.phase.slice(1)}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {updateStatus.progress}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-pcd-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${updateStatus.progress}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              {updateStatus.message}
            </p>
            {updateStatus.error && (
              <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                <p className="text-sm text-red-800 dark:text-red-200">{updateStatus.error}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Available Update */}
      {updateInfo?.available && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-green-200 dark:border-green-800">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-2">
                <Download className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Update Available
                </h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">New Version</p>
                  <p className="text-lg font-mono font-bold text-green-600">
                    v{updateInfo.latestVersion}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Release Date</p>
                  <p className="text-sm text-gray-900 dark:text-white">
                    {updateInfo.releaseDate ? formatDate(new Date(updateInfo.releaseDate).getTime()) : 'Unknown'}
                  </p>
                </div>
              </div>

              {updateInfo.size && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Download size: {formatFileSize(updateInfo.size)}
                </p>
              )}

              {updateInfo.releaseNotes && (
                <div className="mb-4">
                  <button
                    onClick={() => setShowReleaseNotes(!showReleaseNotes)}
                    className="flex items-center space-x-1 text-sm text-pcd-blue-600 hover:text-pcd-blue-700"
                  >
                    <span>Release Notes</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                  
                  {showReleaseNotes && (
                    <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                      <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                        {updateInfo.releaseNotes}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center space-x-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md mb-4">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Pi will be unavailable for ~60 seconds during update
                </p>
              </div>
            </div>

            <div className="flex flex-col space-y-2 ml-4">
              <button
                onClick={applyUpdate}
                disabled={isUpdateInProgress}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                Update Now
              </button>
              
              {updateStatus.phase === 'complete' && (
                <button
                  onClick={rollbackUpdate}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  Rollback
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* No Updates Available */}
      {updateInfo && !updateInfo.available && !checking && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Up to Date
            </h3>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Your Pocket Cloud Drive is running the latest version.
          </p>
        </div>
      )}

      {/* Update History */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-between w-full text-left"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Update History
            </h3>
            <ArrowLeft className={`w-4 h-4 transform transition-transform ${showHistory ? 'rotate-90' : ''}`} />
          </button>
        </div>
        
        {showHistory && (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {history.length > 0 ? (
              history.map((item, index) => (
                <div key={index} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm text-gray-900 dark:text-white">
                        {item.message}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {formatDate(item.timestamp)}
                      </p>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      item.level === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                      'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    }`}>
                      {item.level}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                No update history available
              </div>
            )}
          </div>
        )}
      </div>

      {/* Desktop Client Updates */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Desktop Client Updates
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Desktop clients automatically check for updates from this Pi. When you update the Pi, 
          desktop clients will be notified and can download the latest version.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
            <p className="text-sm font-medium text-gray-900 dark:text-white">macOS</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Auto-update via electron-updater</p>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
            <p className="text-sm font-medium text-gray-900 dark:text-white">Windows</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Auto-update via electron-updater</p>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
            <p className="text-sm font-medium text-gray-900 dark:text-white">Linux</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Manual download from Pi</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminUpdatePage;