import React, { useState, useEffect, useRef } from 'react';
import { 
  Cpu, 
  MemoryStick, 
  HardDrive, 
  Wifi, 
  Thermometer, 
  Clock, 
  RefreshCw,
  RotateCcw,
  Power,
  Database,
  Trash2,
  AlertTriangle,
  Activity,
  Users,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  PieChart,
  Cell,
  Pie
} from 'recharts';
import { apiClient } from '../../api/client';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';

interface HardwareStats {
  cpuTemp: number;
  cpuUsage: number;
  memInfo: {
    total: number;
    available: number;
    used: number;
    buffers: number;
    cached: number;
    free: number;
  };
  diskUsage: {
    total: number;
    used: number;
    available: number;
  };
  diskIO: {
    readSectors: number;
    writeSectors: number;
    readSpeed: number;
    writeSpeed: number;
  };
  networkIO: {
    rxBytes: number;
    txBytes: number;
    rxSpeed: number;
    txSpeed: number;
  };
  loadAvg: number[];
  uptime: number;
  wifiClients: Array<{
    ip: string;
    mac: string;
    hostname?: string;
  }>;
  timestamp: number;
}

interface ThermalStatus {
  temperature: number;
  isThrottling: boolean;
  isPaused: boolean;
  warningLevel: 'normal' | 'warning' | 'critical';
}

const AdminSystem: React.FC = () => {
  const [hardwareStats, setHardwareStats] = useState<HardwareStats | null>(null);
  const [thermalStatus, setThermalStatus] = useState<ThermalStatus | null>(null);
  const [statsHistory, setStatsHistory] = useState<HardwareStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showThermalWarning, setShowThermalWarning] = useState(false);
  
  const { connectionStatus } = useRealtimeSync();
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch initial data
  const fetchHardwareStats = async () => {
    try {
      const [statsResponse, thermalResponse, historyResponse] = await Promise.all([
        apiClient.get('/admin/hardware'),
        apiClient.get('/admin/hardware/thermal'),
        apiClient.get('/admin/hardware/history')
      ]);
      
      setHardwareStats(statsResponse.data);
      setThermalStatus(thermalResponse.data);
      setStatsHistory(historyResponse.data.history || []);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch hardware stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Setup WebSocket for real-time updates
  useEffect(() => {
    fetchHardwareStats();

    // Connect to WebSocket for real-time updates
    const token = localStorage.getItem('auth_token');
    if (token) {
      const wsUrl = `ws://${window.location.hostname}:3000`;
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('Hardware monitoring WebSocket connected');
        // Send auth token
        wsRef.current?.send(JSON.stringify({ type: 'auth', token }));
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'HARDWARE_STATS') {
            setHardwareStats(data.data);
            setLastUpdated(new Date());
            
            // Update history (keep last 60 entries)
            setStatsHistory(prev => {
              const newHistory = [...prev, data.data];
              return newHistory.slice(-60);
            });
          } else if (data.type === 'THERMAL_WARNING' || data.type === 'THERMAL_CRITICAL') {
            setThermalStatus(data.data);
            setShowThermalWarning(true);
            setTimeout(() => setShowThermalWarning(false), 10000);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      wsRef.current.onerror = (error) => {
        console.error('Hardware monitoring WebSocket error:', error);
      };
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Utility functions
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatBytesPerSecond = (bytesPerSecond: number): string => {
    return formatBytes(bytesPerSecond) + '/s';
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

  const getTempColor = (temp: number): string => {
    if (temp < 55) return 'text-teal-500';
    if (temp < 70) return 'text-amber-500';
    return 'text-red-500';
  };

  const getTempGaugeColor = (temp: number): string => {
    if (temp < 55) return '#14b8a6'; // teal-500
    if (temp < 70) return '#f59e0b'; // amber-500
    return '#ef4444'; // red-500
  };

  // Prepare chart data
  const cpuChartData = statsHistory.slice(-20).map((stat, index) => ({
    time: index,
    cpu: stat.cpuUsage,
    temp: stat.cpuTemp
  }));

  const memoryChartData = statsHistory.slice(-20).map((stat, index) => ({
    time: index,
    used: (stat.memInfo.used / stat.memInfo.total) * 100,
    buffers: (stat.memInfo.buffers / stat.memInfo.total) * 100,
    cached: (stat.memInfo.cached / stat.memInfo.total) * 100
  }));

  const networkChartData = statsHistory.slice(-20).map((stat, index) => ({
    time: index,
    download: stat.networkIO.rxSpeed / 1024 / 1024, // MB/s
    upload: stat.networkIO.txSpeed / 1024 / 1024 // MB/s
  }));

  const diskIOChartData = statsHistory.slice(-20).map((stat, index) => ({
    time: index,
    read: stat.diskIO.readSpeed * 512 / 1024 / 1024, // MB/s (sectors to MB)
    write: stat.diskIO.writeSpeed * 512 / 1024 / 1024 // MB/s
  }));

  // Memory pie chart data
  const memoryPieData = hardwareStats ? [
    { name: 'Used', value: hardwareStats.memInfo.used, color: '#3b82f6' },
    { name: 'Buffers', value: hardwareStats.memInfo.buffers, color: '#10b981' },
    { name: 'Cached', value: hardwareStats.memInfo.cached, color: '#f59e0b' },
    { name: 'Free', value: hardwareStats.memInfo.free, color: '#e5e7eb' }
  ] : [];

  // System actions
  const handleRunCleanup = async () => {
    if (!confirm('Run cleanup job now? This will clean expired files and create a backup.')) {
      return;
    }

    try {
      await apiClient.post('/admin/storage/cleanup');
      alert('Cleanup completed successfully');
    } catch (error) {
      console.error('Cleanup failed:', error);
      alert('Cleanup failed');
    }
  };

  const handleCreateBackup = async () => {
    try {
      const response = await apiClient.post('/admin/backup/create');
      alert(`Backup created: ${response.data.filename}`);
    } catch (error) {
      console.error('Backup failed:', error);
      alert('Backup failed');
    }
  };

  if (loading && !hardwareStats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Thermal Warning Banner */}
      {showThermalWarning && thermalStatus && thermalStatus.warningLevel !== 'normal' && (
        <div className={`p-4 rounded-lg border ${
          thermalStatus.warningLevel === 'critical' 
            ? 'bg-red-50 border-red-200 text-red-800' 
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-medium">
              {thermalStatus.warningLevel === 'critical' 
                ? 'CRITICAL: High CPU temperature — media processing paused'
                : 'WARNING: High CPU temperature — system throttling enabled'
              }
            </span>
            <span className="ml-auto">{thermalStatus.temperature.toFixed(1)}°C</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Hardware Monitor</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Live Raspberry Pi 4B system metrics
          </p>
        </div>
        <div className="flex items-center space-x-3 mt-4 sm:mt-0">
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
            connectionStatus === 'connected' 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span>{connectionStatus === 'connected' ? 'Live' : 'Disconnected'}</span>
          </div>
          {lastUpdated && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchHardwareStats}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {hardwareStats && (
        <>
          {/* Key Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* CPU Temperature Gauge */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Thermometer className="w-5 h-5 text-red-500" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">CPU Temp</h3>
                </div>
              </div>
              
              {/* Circular Temperature Gauge */}
              <div className="relative w-32 h-32 mx-auto mb-4">
                <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 120 120">
                  {/* Background circle */}
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    stroke="#e5e7eb"
                    strokeWidth="8"
                    fill="none"
                  />
                  {/* Temperature arc */}
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    stroke={getTempGaugeColor(hardwareStats.cpuTemp)}
                    strokeWidth="8"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${(hardwareStats.cpuTemp / 100) * 314} 314`}
                    className="transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${getTempColor(hardwareStats.cpuTemp)}`}>
                      {hardwareStats.cpuTemp.toFixed(1)}°
                    </div>
                    <div className="text-xs text-gray-500">0-100°C</div>
                  </div>
                </div>
              </div>
              
              <div className="text-center text-sm text-gray-500 dark:text-gray-400">
                {hardwareStats.cpuTemp > 80 ? 'Throttling at 80°C' : 'Normal operating range'}
              </div>
            </div>

            {/* CPU Usage */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Cpu className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">CPU Usage</h3>
                </div>
                <span className="text-3xl font-bold text-gray-900 dark:text-white">
                  {hardwareStats.cpuUsage.toFixed(1)}%
                </span>
              </div>
              
              {/* CPU Sparkline */}
              <div className="h-16 mb-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cpuChartData}>
                    <Area
                      type="monotone"
                      dataKey="cpu"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Load: {hardwareStats.loadAvg[0].toFixed(2)}
              </div>
            </div>

            {/* Memory Usage */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <MemoryStick className="w-5 h-5 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Memory</h3>
                </div>
              </div>
              
              {/* Memory Segmented Bar */}
              <div className="mb-4">
                <div className="flex h-4 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                  <div 
                    className="bg-blue-500"
                    style={{ width: `${(hardwareStats.memInfo.used / hardwareStats.memInfo.total) * 100}%` }}
                  />
                  <div 
                    className="bg-green-500"
                    style={{ width: `${(hardwareStats.memInfo.buffers / hardwareStats.memInfo.total) * 100}%` }}
                  />
                  <div 
                    className="bg-amber-500"
                    style={{ width: `${(hardwareStats.memInfo.cached / hardwareStats.memInfo.total) * 100}%` }}
                  />
                </div>
              </div>
              
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Used</span>
                  <span className="font-medium">{formatBytes(hardwareStats.memInfo.used)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Total</span>
                  <span className="font-medium">{formatBytes(hardwareStats.memInfo.total)}</span>
                </div>
              </div>
            </div>

            {/* WiFi Clients */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Wifi className="w-5 h-5 text-purple-600" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">WiFi Clients</h3>
                </div>
                <span className="text-3xl font-bold text-gray-900 dark:text-white">
                  {hardwareStats.wifiClients.length}
                </span>
              </div>
              
              <div className="space-y-2">
                {hardwareStats.wifiClients.slice(0, 3).map((client, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">
                      {client.hostname || client.ip}
                    </span>
                    <span className="font-mono text-xs">{client.mac.slice(-8)}</span>
                  </div>
                ))}
                {hardwareStats.wifiClients.length > 3 && (
                  <div className="text-xs text-gray-400">
                    +{hardwareStats.wifiClients.length - 3} more
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Network I/O Chart */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-2 mb-4">
                <Activity className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Network I/O</h3>
                <div className="ml-auto flex items-center space-x-4 text-sm">
                  <div className="flex items-center space-x-1">
                    <TrendingDown className="w-4 h-4 text-green-500" />
                    <span>{formatBytesPerSecond(hardwareStats.networkIO.rxSpeed)}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <TrendingUp className="w-4 h-4 text-red-500" />
                    <span>{formatBytesPerSecond(hardwareStats.networkIO.txSpeed)}</span>
                  </div>
                </div>
              </div>
              
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={networkChartData}>
                    <XAxis dataKey="time" hide />
                    <YAxis hide />
                    <Line
                      type="monotone"
                      dataKey="download"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="upload"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Storage I/O Chart */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-2 mb-4">
                <HardDrive className="w-5 h-5 text-purple-600" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Storage I/O</h3>
                <div className="ml-auto flex items-center space-x-4 text-sm">
                  <div className="flex items-center space-x-1">
                    <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                    <span>Read</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
                    <span>Write</span>
                  </div>
                </div>
              </div>
              
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={diskIOChartData}>
                    <XAxis dataKey="time" hide />
                    <YAxis hide />
                    <Area
                      type="monotone"
                      dataKey="read"
                      stackId="1"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.6}
                    />
                    <Area
                      type="monotone"
                      dataKey="write"
                      stackId="1"
                      stroke="#f97316"
                      fill="#f97316"
                      fillOpacity={0.6}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* System Info and Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* System Information */}
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">System Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Uptime</span>
                    <span className="font-medium">{formatUptime(hardwareStats.uptime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Load Average</span>
                    <span className="font-medium">
                      {hardwareStats.loadAvg.map(load => load.toFixed(2)).join(', ')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Storage Used</span>
                    <span className="font-medium">
                      {formatBytes(hardwareStats.diskUsage.used)} / {formatBytes(hardwareStats.diskUsage.total)}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Memory Available</span>
                    <span className="font-medium">{formatBytes(hardwareStats.memInfo.available)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Network RX/TX</span>
                    <span className="font-medium">
                      {formatBytes(hardwareStats.networkIO.rxBytes)} / {formatBytes(hardwareStats.networkIO.txBytes)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Connected Clients</span>
                    <span className="font-medium">{hardwareStats.wifiClients.length}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* System Actions */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">System Actions</h3>
              
              <div className="space-y-3">
                <button
                  onClick={handleRunCleanup}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Run Cleanup</span>
                </button>
                
                <button
                  onClick={handleCreateBackup}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  <Database className="w-4 h-4" />
                  <span>Create Backup</span>
                </button>
                
                <button
                  onClick={() => alert('Restart functionality requires CLI tool')}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Restart Service</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminSystem;