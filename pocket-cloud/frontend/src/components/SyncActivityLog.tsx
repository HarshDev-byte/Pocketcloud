import React, { useState, useEffect } from 'react';
import { 
  Upload, Download, Trash2, AlertTriangle, CheckCircle, 
  Clock, RefreshCw, Wifi, WifiOff, Settings 
} from 'lucide-react';
import { apiClient } from '../api/client';

interface SyncActivity {
  id: string;
  operation_type: 'upload' | 'download' | 'delete' | 'conflict' | 'scan' | 'error';
  file_path: string;
  file_size?: number;
  duration_ms?: number;
  success: boolean;
  error_message?: string;
  created_at: number;
  device_name?: string;
}

interface SyncStatus {
  clientId: string;
  deviceName: string;
  deviceOs: string;
  status: 'idle' | 'scanning' | 'comparing' | 'syncing' | 'paused' | 'error';
  lastSeen: number;
  syncFolder: string;
  localPath: string;
  activeSync?: {
    status: string;
    progress: number;
  };
}

interface SyncActivityLogProps {
  clientId?: string;
  compact?: boolean;
  maxItems?: number;
  showHeader?: boolean;
}

export const SyncActivityLog: React.FC<SyncActivityLogProps> = ({
  clientId,
  compact = false,
  maxItems = 50,
  showHeader = true
}) => {
  const [activities, setActivities] = useState<SyncActivity[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadSyncActivity();
    
    if (clientId) {
      loadSyncStatus();
    }

    // Auto-refresh every 5 seconds
    const interval = setInterval(() => {
      if (autoRefresh) {
        loadSyncActivity();
        if (clientId) {
          loadSyncStatus();
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [clientId, autoRefresh]);

  const loadSyncActivity = async () => {
    try {
      const params = new URLSearchParams();
      if (clientId) params.append('clientId', clientId);
      params.append('limit', maxItems.toString());

      const response = await apiClient.get(`/api/sync/activity?${params}`);
      setActivities(response.data.activity || []);
    } catch (error) {
      console.error('Failed to load sync activity:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSyncStatus = async () => {
    if (!clientId) return;

    try {
      const response = await apiClient.get(`/api/sync/status?clientId=${clientId}`);
      setSyncStatus(response.data.status);
    } catch (error) {
      console.error('Failed to load sync status:', error);
    }
  };

  const getOperationIcon = (type: string, success: boolean) => {
    if (!success) {
      return <AlertTriangle className="text-red-500" size={16} />;
    }

    switch (type) {
      case 'upload':
        return <Upload className="text-blue-500" size={16} />;
      case 'download':
        return <Download className="text-green-500" size={16} />;
      case 'delete':
        return <Trash2 className="text-red-500" size={16} />;
      case 'conflict':
        return <AlertTriangle className="text-orange-500" size={16} />;
      case 'scan':
        return <RefreshCw className="text-gray-500" size={16} />;
      default:
        return <CheckCircle className="text-gray-500" size={16} />;
    }
  };

  const getOperationText = (activity: SyncActivity) => {
    const { operation_type, success, file_path } = activity;
    
    if (!success) {
      return `Failed to ${operation_type} ${file_path}`;
    }

    switch (operation_type) {
      case 'upload':
        return `Uploaded ${file_path}`;
      case 'download':
        return `Downloaded ${file_path}`;
      case 'delete':
        return `Deleted ${file_path}`;
      case 'conflict':
        return `Conflict detected: ${file_path}`;
      case 'scan':
        return 'Scanned for changes';
      case 'error':
        return `Error: ${activity.error_message || 'Unknown error'}`;
      default:
        return `${operation_type} ${file_path}`;
    }
  };

  const formatTimeAgo = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'syncing': return 'text-blue-600';
      case 'scanning': return 'text-yellow-600';
      case 'comparing': return 'text-orange-600';
      case 'error': return 'text-red-600';
      case 'paused': return 'text-gray-600';
      default: return 'text-green-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'syncing':
      case 'scanning':
      case 'comparing':
        return <RefreshCw className="animate-spin" size={16} />;
      case 'error':
        return <AlertTriangle size={16} />;
      case 'paused':
        return <WifiOff size={16} />;
      default:
        return <Wifi size={16} />;
    }
  };

  if (loading) {
    return (
      <div className={`${compact ? 'p-4' : 'p-6'} text-center`}>
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
        <p className="text-sm text-gray-600">Loading sync activity...</p>
      </div>
    );
  }

  return (
    <div className={`bg-white ${compact ? '' : 'rounded-lg shadow'}`}>
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center">
            <RefreshCw className="text-gray-500 mr-2" size={20} />
            <h3 className="font-medium text-gray-900">
              {compact ? 'Sync Activity' : 'Sync Activity Log'}
            </h3>
          </div>
          
          <div className="flex items-center space-x-2">
            {syncStatus && (
              <div className={`flex items-center text-sm ${getStatusColor(syncStatus.status)}`}>
                {getStatusIcon(syncStatus.status)}
                <span className="ml-1 capitalize">{syncStatus.status}</span>
              </div>
            )}
            
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`p-1 rounded ${autoRefresh ? 'text-blue-600' : 'text-gray-400'}`}
              title={autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh'}
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Current Sync Status */}
      {syncStatus?.activeSync && (
        <div className="p-4 bg-blue-50 border-b border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-900">
              {syncStatus.activeSync.status}
            </span>
            <span className="text-sm text-blue-700">
              {syncStatus.activeSync.progress}%
            </span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${syncStatus.activeSync.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Activity List */}
      <div className={`${compact ? 'max-h-64' : 'max-h-96'} overflow-y-auto`}>
        {activities.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <RefreshCw size={48} className="mx-auto mb-4 text-gray-300" />
            <p>No sync activity yet</p>
            <p className="text-sm mt-1">Activity will appear here when files are synced</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {activities.map((activity) => (
              <div key={activity.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {getOperationIcon(activity.operation_type, activity.success)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm ${activity.success ? 'text-gray-900' : 'text-red-900'}`}>
                        {getOperationText(activity)}
                      </p>
                      <div className="flex items-center text-xs text-gray-500 ml-4">
                        <Clock size={12} className="mr-1" />
                        {formatTimeAgo(activity.created_at)}
                      </div>
                    </div>
                    
                    {/* Additional Info */}
                    <div className="flex items-center mt-1 text-xs text-gray-500 space-x-4">
                      {activity.file_size && (
                        <span>{formatFileSize(activity.file_size)}</span>
                      )}
                      {activity.duration_ms && (
                        <span>{(activity.duration_ms / 1000).toFixed(1)}s</span>
                      )}
                      {activity.device_name && !clientId && (
                        <span>{activity.device_name}</span>
                      )}
                    </div>
                    
                    {/* Error Message */}
                    {!activity.success && activity.error_message && (
                      <p className="text-xs text-red-600 mt-1 bg-red-50 p-2 rounded">
                        {activity.error_message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {!compact && activities.length > 0 && (
        <div className="p-4 border-t border-gray-200 text-center">
          <button
            onClick={loadSyncActivity}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Refresh Activity
          </button>
        </div>
      )}
    </div>
  );
};