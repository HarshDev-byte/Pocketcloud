import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Trash2, 
  Filter, 
  RefreshCw, 
  Search,
  AlertCircle,
  Info,
  AlertTriangle,
  Bug
} from 'lucide-react';
import { apiClient } from '../../api/client';

interface LogEntry {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  service: string;
  userId?: string;
  message: string;
  meta?: any;
}

interface LogsData {
  logs: LogEntry[];
  services: string[];
  stats: {
    total: number;
    byLevel: Record<string, number>;
  };
  pagination: {
    page: number;
    limit: number;
    hasMore: boolean;
  };
}

const AdminLogs: React.FC = () => {
  const [logsData, setLogsData] = useState<LogsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    level: '',
    service: '',
    search: '',
    startTime: '',
    endTime: ''
  });

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params: any = {};
      
      if (filters.level) params.level = filters.level;
      if (filters.service) params.service = filters.service;
      if (filters.startTime) params.startTime = new Date(filters.startTime).getTime();
      if (filters.endTime) params.endTime = new Date(filters.endTime).getTime();

      const response = await apiClient.get('/admin/logs', { params });
      setLogsData(response.data);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filters]);

  const handleDownloadLogs = async () => {
    try {
      const response = await apiClient.get('/admin/logs/download', {
        responseType: 'blob',
        params: { date: new Date().toISOString().split('T')[0] }
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `pocket-cloud-logs-${new Date().toISOString().split('T')[0]}.log`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download logs:', error);
      alert('Failed to download logs');
    }
  };

  const handleClearLogs = async () => {
    if (!confirm('Are you sure you want to clear old log entries? This action cannot be undone.')) {
      return;
    }

    try {
      await apiClient.post('/admin/logs/clear');
      fetchLogs();
      alert('Old logs cleared successfully');
    } catch (error) {
      console.error('Failed to clear logs:', error);
      alert('Failed to clear logs');
    }
  };

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'warn':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'debug':
        return <Bug className="w-4 h-4 text-purple-500" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getLevelColor = (level: string): string => {
    switch (level) {
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'warn':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
      case 'debug':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    }
  };

  // Filter logs by search term
  const filteredLogs = logsData?.logs.filter(log => 
    !filters.search || 
    log.message.toLowerCase().includes(filters.search.toLowerCase()) ||
    log.service.toLowerCase().includes(filters.search.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Logs</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Monitor system activity and troubleshoot issues
          </p>
        </div>
        <div className="flex items-center space-x-3 mt-4 sm:mt-0">
          <button
            onClick={handleDownloadLogs}
            className="flex items-center space-x-2 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            <Download className="w-4 h-4" />
            <span>Download</span>
          </button>
          <button
            onClick={handleClearLogs}
            className="flex items-center space-x-2 px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear Old</span>
          </button>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-2 bg-pcd-blue-600 text-white rounded-md hover:bg-pcd-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {logsData && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{logsData.stats.total}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Total Logs</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="text-2xl font-bold text-red-600">{logsData.stats.byLevel.error || 0}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Errors</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="text-2xl font-bold text-amber-600">{logsData.stats.byLevel.warn || 0}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Warnings</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="text-2xl font-bold text-blue-600">{logsData.stats.byLevel.info || 0}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Info</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="text-2xl font-bold text-purple-600">{logsData.stats.byLevel.debug || 0}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Debug</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-2 mb-4">
          <Filter className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filters</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search logs..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
              />
            </div>
          </div>

          {/* Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Level
            </label>
            <select
              value={filters.level}
              onChange={(e) => setFilters(prev => ({ ...prev, level: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
            >
              <option value="">All Levels</option>
              <option value="error">Error</option>
              <option value="warn">Warning</option>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
            </select>
          </div>

          {/* Service */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Service
            </label>
            <select
              value={filters.service}
              onChange={(e) => setFilters(prev => ({ ...prev, service: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
            >
              <option value="">All Services</option>
              {logsData?.services.map(service => (
                <option key={service} value={service}>{service}</option>
              ))}
            </select>
          </div>

          {/* Start Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Start Time
            </label>
            <input
              type="datetime-local"
              value={filters.startTime}
              onChange={(e) => setFilters(prev => ({ ...prev, startTime: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
            />
          </div>

          {/* End Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              End Time
            </label>
            <input
              type="datetime-local"
              value={filters.endTime}
              onChange={(e) => setFilters(prev => ({ ...prev, endTime: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
            />
          </div>
        </div>
      </div>

      {/* Logs List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Log Entries ({filteredLogs.length})
          </h3>
        </div>
        
        <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pcd-blue-600 mx-auto"></div>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No log entries found
            </div>
          ) : (
            filteredLogs.map((log, index) => (
              <div key={index} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {getLevelIcon(log.level)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getLevelColor(log.level)}`}>
                        {log.level.toUpperCase()}
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {log.service}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatTime(log.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 break-words">
                      {log.message}
                    </p>
                    {log.meta && (
                      <details className="mt-2">
                        <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                          Show metadata
                        </summary>
                        <pre className="mt-1 text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded overflow-x-auto">
                          {JSON.stringify(log.meta, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminLogs;