import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Files, 
  HardDrive, 
  Wifi, 
  TrendingUp, 
  Activity,
  RefreshCw
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { apiClient } from '../../api/client';
import BandwidthMonitor from '../../components/BandwidthMonitor';

interface DashboardStats {
  users: number;
  files: number;
  activeSessions: number;
  activeConnections: number;
  storage: {
    used: number;
    total: number;
    free: number;
  };
  searchAnalytics: Array<{
    query: string;
    count: number;
    avgTime: number;
  }>;
  recentActivity: Array<{
    timestamp: number;
    level: string;
    service: string;
    message: string;
    userId?: string;
  }>;
  uploadStats: Array<{
    date: string;
    uploads: number;
    bytes: number;
  }>;
}

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/admin/stats');
      setStats(response.data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString();
  };

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString();
  };

  // Prepare chart data
  const uploadChartData = stats?.uploadStats.map(item => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    uploads: item.uploads,
    storage: item.bytes
  })).reverse() || [];

  const storageData = stats ? [
    { name: 'Used', value: stats.storage.used, color: '#4f46e5' },
    { name: 'Free', value: stats.storage.free, color: '#e5e7eb' }
  ] : [];

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pcd-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-500 dark:text-gray-400">
            System overview and statistics
          </p>
        </div>
        <div className="flex items-center space-x-3 mt-4 sm:mt-0">
          {lastUpdated && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Updated {formatTime(lastUpdated.getTime())}
            </span>
          )}
          <button
            onClick={fetchStats}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-2 bg-pcd-blue-600 text-white rounded-md hover:bg-pcd-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Users</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.users || 0}</p>
            </div>
            <Users className="w-8 h-8 text-pcd-blue-600" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Files</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.files || 0}</p>
            </div>
            <Files className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Active Sessions</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.activeSessions || 0}</p>
            </div>
            <Activity className="w-8 h-8 text-amber-600" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Live Connections</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.activeConnections || 0}</p>
            </div>
            <Wifi className="w-8 h-8 text-purple-600" />
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Trend Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Upload Activity</h3>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={uploadChartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis 
                  dataKey="date" 
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="uploads" 
                  stroke="#4f46e5" 
                  fill="#4f46e5" 
                  fillOpacity={0.1}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Storage Usage */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Storage Usage</h3>
            <HardDrive className="w-5 h-5 text-gray-400" />
          </div>
          
          {stats && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Used</span>
                <span className="text-sm font-medium">{formatBytes(stats.storage.used)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Free</span>
                <span className="text-sm font-medium">{formatBytes(stats.storage.free)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Total</span>
                <span className="text-sm font-medium">{formatBytes(stats.storage.total)}</span>
              </div>
              
              {/* Storage Bar */}
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                <div
                  className="bg-pcd-blue-600 h-3 rounded-full transition-all duration-300"
                  style={{ 
                    width: `${stats.storage.total > 0 ? (stats.storage.used / stats.storage.total) * 100 : 0}%` 
                  }}
                />
              </div>
              
              <div className="text-center">
                <span className="text-lg font-semibold text-gray-900 dark:text-white">
                  {stats.storage.total > 0 ? 
                    ((stats.storage.used / stats.storage.total) * 100).toFixed(1) : 0}% Used
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bandwidth Monitor */}
      <BandwidthMonitor />

      {/* Search Analytics */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Top Search Queries</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Most searched terms in the last 30 days</p>
        </div>
        <div className="p-6">
          {stats?.searchAnalytics.length ? (
            <div className="space-y-3">
              {stats.searchAnalytics.map((search, index) => (
                <div key={index} className="flex items-center justify-between py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-medium text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                        #{index + 1}
                      </span>
                      <span className="text-sm text-gray-900 dark:text-white font-mono bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded">
                        "{search.query}"
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                    <span>{search.count} searches</span>
                    <span>{search.avgTime.toFixed(0)}ms avg</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              No search queries yet
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {stats?.recentActivity.length ? (
            stats.recentActivity.slice(0, 10).map((activity, index) => (
              <div key={index} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        activity.level === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                        activity.level === 'warn' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' :
                        'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                      }`}>
                        {activity.level}
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {activity.service}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                      {activity.message}
                    </p>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-4 flex-shrink-0">
                    {formatTime(activity.timestamp)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No recent activity
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;