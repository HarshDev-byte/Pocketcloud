import React, { useState, useEffect, useRef } from 'react';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

interface BandwidthUsage {
  userId: string;
  uploadBytesPerSec: number;
  downloadBytesPerSec: number;
  streamingBytesPerSec: number;
  lastActivity: number;
}

interface BandwidthStats {
  global: {
    uploadBytesPerSec: number;
    downloadBytesPerSec: number;
    streamingBytesPerSec: number;
    totalBytesPerSec: number;
    wifiCapacityPercent: number;
  };
  perUser: Record<string, BandwidthUsage>;
  activeTransfers: number;
  throttledUsers: string[];
}

interface BandwidthLimits {
  uploadPerUser: number;
  downloadPerUser: number;
  streamingPerUser: number;
  globalUpload: number;
  globalDownload: number;
}

interface SparklineData {
  timestamp: number;
  value: number;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B/s';
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const Sparkline: React.FC<{ data: SparklineData[]; width?: number; height?: number; color?: string }> = ({ 
  data, 
  width = 120, 
  height = 30, 
  color = '#3b82f6' 
}) => {
  if (data.length < 2) return <div style={{ width, height }} />;

  const maxValue = Math.max(...data.map(d => d.value));
  const minValue = Math.min(...data.map(d => d.value));
  const range = maxValue - minValue || 1;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((d.value - minValue) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
};

const BandwidthMonitor: React.FC = () => {
  const [stats, setStats] = useState<BandwidthStats | null>(null);
  const [limits, setLimits] = useState<BandwidthLimits | null>(null);
  const [sparklineData, setSparklineData] = useState<Map<string, SparklineData[]>>(new Map());
  const [editingLimits, setEditingLimits] = useState(false);
  const [newLimits, setNewLimits] = useState<Partial<BandwidthLimits>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep last 60 data points (2 minutes at 2-second intervals)
  const maxSparklinePoints = 60;

  // Listen for real-time bandwidth updates
  useRealtimeSync((event) => {
    if (event.type === 'BANDWIDTH_STATS') {
      const newStats = event.data as BandwidthStats;
      setStats(newStats);
      
      // Update sparkline data
      const now = Date.now();
      setSparklineData(prev => {
        const updated = new Map(prev);
        
        // Update global sparkline
        const globalData = updated.get('global') || [];
        globalData.push({ timestamp: now, value: newStats.global.totalBytesPerSec });
        if (globalData.length > maxSparklinePoints) {
          globalData.shift();
        }
        updated.set('global', globalData);

        // Update per-user sparklines
        Object.entries(newStats.perUser).forEach(([userId, usage]) => {
          const userData = updated.get(userId) || [];
          const totalUserBandwidth = usage.uploadBytesPerSec + usage.downloadBytesPerSec + usage.streamingBytesPerSec;
          userData.push({ timestamp: now, value: totalUserBandwidth });
          if (userData.length > maxSparklinePoints) {
            userData.shift();
          }
          updated.set(userId, userData);
        });

        return updated;
      });
    }
  });

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, limitsRes] = await Promise.all([
          fetch('/api/admin/bandwidth'),
          fetch('/api/admin/bandwidth/limits')
        ]);

        if (statsRes.ok && limitsRes.ok) {
          const statsData = await statsRes.json();
          const limitsData = await limitsRes.json();
          
          setStats(statsData);
          setLimits(limitsData);
          setNewLimits(limitsData);
        } else {
          setError('Failed to fetch bandwidth data');
        }
      } catch (err) {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleThrottleUser = async (userId: string) => {
    try {
      const response = await fetch(`/api/admin/bandwidth/throttle/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMs: 300000 }) // 5 minutes
      });

      if (!response.ok) {
        throw new Error('Failed to throttle user');
      }
    } catch (err) {
      setError('Failed to throttle user');
    }
  };

  const handleUnthrottleUser = async (userId: string) => {
    try {
      const response = await fetch(`/api/admin/bandwidth/throttle/${userId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to unthrottle user');
      }
    } catch (err) {
      setError('Failed to unthrottle user');
    }
  };

  const handleUpdateLimits = async () => {
    try {
      const response = await fetch('/api/admin/bandwidth/limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLimits)
      });

      if (response.ok) {
        const result = await response.json();
        setLimits(result.limits);
        setEditingLimits(false);
        setError(null);
      } else {
        throw new Error('Failed to update limits');
      }
    } catch (err) {
      setError('Failed to update bandwidth limits');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-red-600">
          <h3 className="text-lg font-semibold mb-2">Error</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!stats || !limits) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p>No bandwidth data available</p>
      </div>
    );
  }

  const wifiCapacityColor = stats.global.wifiCapacityPercent > 80 ? 'bg-red-500' : 
                           stats.global.wifiCapacityPercent > 60 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Bandwidth Monitor</h3>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-500">Live</span>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Global Stats */}
        <div className="mb-6">
          <h4 className="text-md font-medium text-gray-900 mb-3">Network Overview</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-sm text-blue-600 font-medium">Total Bandwidth</div>
              <div className="text-2xl font-bold text-blue-900">
                {formatBytes(stats.global.totalBytesPerSec)}
              </div>
              <Sparkline 
                data={sparklineData.get('global') || []} 
                color="#2563eb"
              />
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-sm text-green-600 font-medium">Download</div>
              <div className="text-xl font-bold text-green-900">
                ⬇ {formatBytes(stats.global.downloadBytesPerSec + stats.global.streamingBytesPerSec)}
              </div>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg">
              <div className="text-sm text-orange-600 font-medium">Upload</div>
              <div className="text-xl font-bold text-orange-900">
                ⬆ {formatBytes(stats.global.uploadBytesPerSec)}
              </div>
            </div>
          </div>

          {/* WiFi Capacity Bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">WiFi Capacity</span>
              <span className="text-sm text-gray-500">{stats.global.wifiCapacityPercent}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className={`h-3 rounded-full transition-all duration-300 ${wifiCapacityColor}`}
                style={{ width: `${Math.min(stats.global.wifiCapacityPercent, 100)}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Active Transfers */}
        <div className="mb-6">
          <h4 className="text-md font-medium text-gray-900 mb-3">
            Active Transfers ({stats.activeTransfers})
          </h4>
          
          {Object.keys(stats.perUser).length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              No active transfers
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(stats.perUser).map(([userId, usage]) => {
                const isThrottled = stats.throttledUsers.includes(userId);
                const totalBandwidth = usage.uploadBytesPerSec + usage.downloadBytesPerSec + usage.streamingBytesPerSec;
                
                return (
                  <div key={userId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900">{userId}</span>
                        {isThrottled && (
                          <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">
                            Throttled
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {usage.downloadBytesPerSec > 0 && (
                          <span className="mr-4">⬇ {formatBytes(usage.downloadBytesPerSec)}</span>
                        )}
                        {usage.uploadBytesPerSec > 0 && (
                          <span className="mr-4">⬆ {formatBytes(usage.uploadBytesPerSec)}</span>
                        )}
                        {usage.streamingBytesPerSec > 0 && (
                          <span className="mr-4">📺 {formatBytes(usage.streamingBytesPerSec)}</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      <Sparkline 
                        data={sparklineData.get(userId) || []} 
                        width={80}
                        height={25}
                        color={isThrottled ? '#ef4444' : '#3b82f6'}
                      />
                      
                      {isThrottled ? (
                        <button
                          onClick={() => handleUnthrottleUser(userId)}
                          className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          Unthrottle
                        </button>
                      ) : (
                        <button
                          onClick={() => handleThrottleUser(userId)}
                          className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          Throttle
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bandwidth Limits */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-md font-medium text-gray-900">Bandwidth Limits</h4>
            <button
              onClick={() => setEditingLimits(!editingLimits)}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              {editingLimits ? 'Cancel' : 'Edit'}
            </button>
          </div>

          {editingLimits ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Upload per user (MB/s)
                  </label>
                  <input
                    type="number"
                    value={Math.round((newLimits.uploadPerUser || limits.uploadPerUser) / (1024 * 1024))}
                    onChange={(e) => setNewLimits(prev => ({
                      ...prev,
                      uploadPerUser: parseInt(e.target.value) * 1024 * 1024
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Download per user (MB/s)
                  </label>
                  <input
                    type="number"
                    value={Math.round((newLimits.downloadPerUser || limits.downloadPerUser) / (1024 * 1024))}
                    onChange={(e) => setNewLimits(prev => ({
                      ...prev,
                      downloadPerUser: parseInt(e.target.value) * 1024 * 1024
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Streaming per user (MB/s)
                  </label>
                  <input
                    type="number"
                    value={Math.round((newLimits.streamingPerUser || limits.streamingPerUser) / (1024 * 1024))}
                    onChange={(e) => setNewLimits(prev => ({
                      ...prev,
                      streamingPerUser: parseInt(e.target.value) * 1024 * 1024
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Global upload (MB/s)
                  </label>
                  <input
                    type="number"
                    value={Math.round((newLimits.globalUpload || limits.globalUpload) / (1024 * 1024))}
                    onChange={(e) => setNewLimits(prev => ({
                      ...prev,
                      globalUpload: parseInt(e.target.value) * 1024 * 1024
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={handleUpdateLimits}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => {
                    setEditingLimits(false);
                    setNewLimits(limits);
                  }}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-gray-600">Upload/user</div>
                <div className="font-medium">{formatBytes(limits.uploadPerUser)}</div>
              </div>
              <div>
                <div className="text-gray-600">Download/user</div>
                <div className="font-medium">{formatBytes(limits.downloadPerUser)}</div>
              </div>
              <div>
                <div className="text-gray-600">Streaming/user</div>
                <div className="font-medium">{formatBytes(limits.streamingPerUser)}</div>
              </div>
              <div>
                <div className="text-gray-600">Global upload</div>
                <div className="font-medium">{formatBytes(limits.globalUpload)}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BandwidthMonitor;