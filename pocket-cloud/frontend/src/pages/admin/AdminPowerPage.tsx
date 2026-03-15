import React, { useState, useEffect } from 'react';
import { 
  Battery, 
  Power, 
  RotateCcw, 
  Settings, 
  AlertTriangle,
  Zap,
  Activity,
  Clock,
  Thermometer
} from 'lucide-react';

interface PowerStatus {
  batteryPercent: number;
  isCharging: boolean;
  voltage: number;
  currentDraw: number;
  estimatedRuntime: number;
  powerSource: 'battery' | 'usb' | 'unknown';
  batteryState: 'normal' | 'low' | 'critical' | 'charging' | 'full';
  hardwareType: 'ina219' | 'pisugar' | 'powerbank' | 'unknown';
  powerSaveMode: boolean;
  temperature?: number;
  lastUpdated: string;
}

interface BatteryHealthReport {
  status: string;
  message: string;
  daysOfData: number;
  statistics?: {
    averageVoltage: number;
    voltageRange: [number, number];
    averageCapacity: number;
    estimatedCycles: number;
    dataPoints: number;
  };
  hardwareType: string;
}

export const AdminPowerPage: React.FC = () => {
  const [powerStatus, setPowerStatus] = useState<PowerStatus | null>(null);
  const [healthReport, setHealthReport] = useState<BatteryHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPowerData();
    
    // Update every 30 seconds
    const interval = setInterval(fetchPowerStatus, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchPowerData = async () => {
    await Promise.all([
      fetchPowerStatus(),
      fetchHealthReport()
    ]);
    setLoading(false);
  };

  const fetchPowerStatus = async () => {
    try {
      const response = await fetch('/api/system/power');
      const data = await response.json();
      
      if (data.success) {
        setPowerStatus(data);
      } else {
        setError(data.error || 'Failed to fetch power status');
      }
    } catch (err) {
      setError('Network error');
      console.error('Failed to fetch power status:', err);
    }
  };

  const fetchHealthReport = async () => {
    try {
      const response = await fetch('/api/admin/power/health-report');
      const data = await response.json();
      
      if (data.success) {
        setHealthReport(data.report);
      }
    } catch (err) {
      console.error('Failed to fetch health report:', err);
    }
  };

  const togglePowerSaveMode = async () => {
    if (!powerStatus) return;
    
    setActionLoading('power-save');
    
    try {
      const response = await fetch('/api/admin/power/save-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !powerStatus.powerSaveMode })
      });
      
      const data = await response.json();
      
      if (data.success) {
        await fetchPowerStatus();
      } else {
        setError(data.error || 'Failed to toggle power save mode');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleShutdown = async () => {
    if (!confirm('Are you sure you want to shutdown the system?')) return;
    
    setActionLoading('shutdown');
    
    try {
      const response = await fetch('/api/admin/power/shutdown', {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert('System is shutting down...');
      } else {
        setError(data.error || 'Failed to shutdown');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReboot = async () => {
    if (!confirm('Are you sure you want to reboot the system?')) return;
    
    setActionLoading('reboot');
    
    try {
      const response = await fetch('/api/admin/power/reboot', {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert('System is rebooting...');
      } else {
        setError(data.error || 'Failed to reboot');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setActionLoading(null);
    }
  };

  const cancelShutdown = async () => {
    setActionLoading('cancel');
    
    try {
      const response = await fetch('/api/admin/power/cancel-shutdown', {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert(data.message);
      } else {
        setError(data.error || 'Failed to cancel shutdown');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setActionLoading(null);
    }
  };

  const formatRuntime = (minutes: number): string => {
    if (minutes <= 0) return 'Unknown';
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    } else {
      return `${mins}m`;
    }
  };

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'good': return 'text-green-600';
      case 'aged': return 'text-yellow-600';
      case 'degraded': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Power Management</h1>
        <button
          onClick={fetchPowerData}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <span className="text-red-700">{error}</span>
          </div>
        </div>
      )}

      {/* Power Status Card */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Current Status</h2>
          <div className="flex items-center space-x-2">
            <Battery className="w-5 h-5 text-gray-600" />
            <span className="text-sm text-gray-600">
              {powerStatus?.hardwareType.toUpperCase() || 'Unknown'}
            </span>
          </div>
        </div>

        {powerStatus ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Battery Level */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">Battery Level</span>
                <Battery className={`w-4 h-4 ${
                  powerStatus.batteryState === 'critical' ? 'text-red-500' :
                  powerStatus.batteryState === 'low' ? 'text-amber-500' : 'text-green-500'
                }`} />
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {powerStatus.hardwareType === 'unknown' ? 'N/A' : `${powerStatus.batteryPercent}%`}
              </div>
              <div className="text-sm text-gray-500">
                {powerStatus.batteryState.charAt(0).toUpperCase() + powerStatus.batteryState.slice(1)}
              </div>
            </div>

            {/* Power Source */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">Power Source</span>
                {powerStatus.isCharging ? (
                  <Zap className="w-4 h-4 text-blue-500" />
                ) : (
                  <Battery className="w-4 h-4 text-gray-500" />
                )}
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {powerStatus.isCharging ? 'Charging' : 'Battery'}
              </div>
              <div className="text-sm text-gray-500">
                {powerStatus.voltage.toFixed(1)}V
              </div>
            </div>

            {/* Current Draw */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">Current Draw</span>
                <Activity className="w-4 h-4 text-gray-500" />
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {(powerStatus.currentDraw / 1000).toFixed(1)}A
              </div>
              <div className="text-sm text-gray-500">
                {powerStatus.powerSaveMode ? 'Power Save' : 'Normal'}
              </div>
            </div>

            {/* Runtime */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">Est. Runtime</span>
                <Clock className="w-4 h-4 text-gray-500" />
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {formatRuntime(powerStatus.estimatedRuntime)}
              </div>
              <div className="text-sm text-gray-500">
                At current usage
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No power status available
          </div>
        )}
      </div>
      {/* Battery Health Card */}
      {healthReport && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Battery Health</h2>
          
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${
                healthReport.status === 'good' ? 'bg-green-500' :
                healthReport.status === 'aged' ? 'bg-yellow-500' : 'bg-red-500'
              }`} />
              <span className={`font-medium ${getHealthStatusColor(healthReport.status)}`}>
                {healthReport.message}
              </span>
            </div>
            <span className="text-sm text-gray-500">
              {healthReport.daysOfData} days of data
            </span>
          </div>

          {healthReport.statistics && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-sm font-medium text-gray-600">Avg Voltage</div>
                <div className="text-lg font-bold text-gray-900">
                  {healthReport.statistics.averageVoltage}V
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-sm font-medium text-gray-600">Voltage Range</div>
                <div className="text-lg font-bold text-gray-900">
                  {healthReport.statistics.voltageRange[0]}V - {healthReport.statistics.voltageRange[1]}V
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-sm font-medium text-gray-600">Avg Capacity</div>
                <div className="text-lg font-bold text-gray-900">
                  {healthReport.statistics.averageCapacity}%
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-sm font-medium text-gray-600">Est. Cycles</div>
                <div className="text-lg font-bold text-gray-900">
                  {healthReport.statistics.estimatedCycles}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Power Controls Card */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Power Controls</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Power Save Mode */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <Settings className="w-5 h-5 text-gray-600" />
                <div>
                  <div className="font-medium text-gray-900">Power Save Mode</div>
                  <div className="text-sm text-gray-500">
                    Reduces CPU speed and disables unused features
                  </div>
                </div>
              </div>
              <div className={`w-3 h-3 rounded-full ${
                powerStatus?.powerSaveMode ? 'bg-green-500' : 'bg-gray-300'
              }`} />
            </div>
            
            <button
              onClick={togglePowerSaveMode}
              disabled={actionLoading === 'power-save'}
              className={`w-full px-4 py-2 rounded-lg font-medium transition-colors ${
                powerStatus?.powerSaveMode
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              } disabled:opacity-50`}
            >
              {actionLoading === 'power-save' ? 'Updating...' : 
               powerStatus?.powerSaveMode ? 'Disable' : 'Enable'}
            </button>
            
            {powerStatus?.powerSaveMode && (
              <div className="mt-2 text-sm text-amber-600">
                ⚡ Power save mode is active - expect 15-30 min extra runtime
              </div>
            )}
          </div>

          {/* Emergency Shutdown */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center space-x-3 mb-3">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <div>
                <div className="font-medium text-gray-900">Emergency Controls</div>
                <div className="text-sm text-gray-500">
                  Cancel shutdown or force system restart
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <button
                onClick={cancelShutdown}
                disabled={actionLoading === 'cancel'}
                className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel Shutdown'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* System Actions Card */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">System Actions</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Shutdown */}
          <div className="border border-red-200 rounded-lg p-4">
            <div className="flex items-center space-x-3 mb-3">
              <Power className="w-5 h-5 text-red-600" />
              <div>
                <div className="font-medium text-gray-900">Shutdown System</div>
                <div className="text-sm text-gray-500">
                  Gracefully shutdown the PocketCloud Drive
                </div>
              </div>
            </div>
            
            <button
              onClick={handleShutdown}
              disabled={actionLoading === 'shutdown'}
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-50"
            >
              {actionLoading === 'shutdown' ? 'Shutting Down...' : 'Shutdown'}
            </button>
          </div>

          {/* Reboot */}
          <div className="border border-blue-200 rounded-lg p-4">
            <div className="flex items-center space-x-3 mb-3">
              <RotateCcw className="w-5 h-5 text-blue-600" />
              <div>
                <div className="font-medium text-gray-900">Restart System</div>
                <div className="text-sm text-gray-500">
                  Restart the PocketCloud Drive
                </div>
              </div>
            </div>
            
            <button
              onClick={handleReboot}
              disabled={actionLoading === 'reboot'}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50"
            >
              {actionLoading === 'reboot' ? 'Rebooting...' : 'Restart'}
            </button>
          </div>
        </div>

        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start space-x-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <strong>Warning:</strong> Shutdown and restart actions will immediately affect all connected users. 
              Make sure to coordinate with users before performing these actions.
            </div>
          </div>
        </div>
      </div>

      {/* Hardware Info */}
      {powerStatus && (
        <div className="mt-6 text-center text-sm text-gray-500">
          Hardware: {powerStatus.hardwareType.toUpperCase()} • 
          Last updated: {new Date(powerStatus.lastUpdated).toLocaleString()}
        </div>
      )}
    </div>
  );
};

export default AdminPowerPage;