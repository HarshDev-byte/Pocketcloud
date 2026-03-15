import React, { useState, useEffect } from 'react';
import { Battery, BatteryLow, Zap, AlertTriangle } from 'lucide-react';

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
  lastUpdated: string;
}

interface BatteryIndicatorProps {
  className?: string;
  showDetails?: boolean;
}

export const BatteryIndicator: React.FC<BatteryIndicatorProps> = ({ 
  className = '', 
  showDetails = false 
}) => {
  const [powerStatus, setPowerStatus] = useState<PowerStatus | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPowerStatus();
    
    // Update every 30 seconds
    const interval = setInterval(fetchPowerStatus, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchPowerStatus = async () => {
    try {
      const response = await fetch('/api/system/power');
      const data = await response.json();
      
      if (data.success) {
        setPowerStatus(data);
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch power status');
      }
    } catch (err) {
      setError('Network error');
      console.error('Failed to fetch power status:', err);
    } finally {
      setLoading(false);
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

  const getBatteryIcon = () => {
    if (!powerStatus) return <Battery className="w-5 h-5" />;
    
    const { batteryPercent, batteryState } = powerStatus;
    
    if (batteryState === 'critical') {
      return <BatteryLow className="w-5 h-5 text-red-500" />;
    } else if (batteryState === 'low') {
      return <Battery className="w-5 h-5 text-amber-500" />;
    } else {
      return <Battery className="w-5 h-5 text-green-500" />;
    }
  };

  const getBatteryColor = () => {
    if (!powerStatus) return 'bg-gray-300';
    
    const { batteryState } = powerStatus;
    
    switch (batteryState) {
      case 'critical':
        return 'bg-red-500';
      case 'low':
        return 'bg-amber-500';
      case 'charging':
        return 'bg-blue-500';
      case 'full':
        return 'bg-green-500';
      default:
        return 'bg-green-500';
    }
  };

  const renderBatteryBar = () => {
    if (!powerStatus) return null;
    
    const { batteryPercent, isCharging } = powerStatus;
    const fillWidth = Math.max(5, batteryPercent); // Minimum 5% for visibility
    
    return (
      <div className="flex items-center space-x-2">
        {/* Battery icon */}
        <div className="relative">
          {getBatteryIcon()}
          {isCharging && (
            <Zap className="w-3 h-3 text-blue-500 absolute -top-1 -right-1" />
          )}
        </div>
        
        {/* Battery bar */}
        <div className="flex items-center space-x-1">
          <div className="w-12 h-3 bg-gray-200 rounded-sm border border-gray-300 relative overflow-hidden">
            <div 
              className={`h-full ${getBatteryColor()} transition-all duration-300`}
              style={{ width: `${fillWidth}%` }}
            />
            {/* Battery tip */}
            <div className="absolute -right-1 top-0.5 w-1 h-2 bg-gray-300 rounded-r-sm" />
          </div>
          
          {/* Percentage */}
          <span className="text-sm font-medium min-w-[3rem]">
            {powerStatus.hardwareType === 'unknown' ? 'N/A' : `${batteryPercent}%`}
          </span>
        </div>
        
        {/* Charging indicator */}
        {isCharging && (
          <div className="flex items-center text-blue-600">
            <Zap className="w-4 h-4 mr-1" />
            <span className="text-sm">Charging</span>
          </div>
        )}
      </div>
    );
  };

  const renderTooltip = () => {
    if (!powerStatus || !showTooltip) return null;
    
    const { 
      batteryPercent, 
      voltage, 
      currentDraw, 
      estimatedRuntime, 
      hardwareType,
      powerSaveMode,
      lastUpdated 
    } = powerStatus;
    
    return (
      <div className="absolute bottom-full left-0 mb-2 p-3 bg-gray-900 text-white text-sm rounded-lg shadow-lg z-50 min-w-[250px]">
        <div className="space-y-1">
          <div className="font-semibold">Battery Details</div>
          
          {hardwareType !== 'unknown' ? (
            <>
              <div>{batteryPercent}% remaining</div>
              <div>Est. {formatRuntime(estimatedRuntime)} at current usage</div>
              <div>Current draw: {(currentDraw / 1000).toFixed(1)}A</div>
              <div>Voltage: {voltage.toFixed(1)}V</div>
              <div>Hardware: {hardwareType.toUpperCase()}</div>
              {powerSaveMode && (
                <div className="text-amber-300">⚡ Power save mode active</div>
              )}
            </>
          ) : (
            <div className="text-amber-300">
              No UPS hardware detected<br />
              Battery monitoring unavailable
            </div>
          )}
          
          <div className="text-xs text-gray-400 pt-1 border-t border-gray-700">
            Updated: {new Date(lastUpdated).toLocaleTimeString()}
          </div>
        </div>
        
        {/* Tooltip arrow */}
        <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
      </div>
    );
  };

  if (loading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <Battery className="w-5 h-5 text-gray-400 animate-pulse" />
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <AlertTriangle className="w-5 h-5 text-red-500" />
        <span className="text-sm text-red-600">Power Error</span>
      </div>
    );
  }

  return (
    <div 
      className={`relative ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {renderBatteryBar()}
      {renderTooltip()}
    </div>
  );
};

// Battery warning banner component
interface BatteryWarningProps {
  powerStatus: PowerStatus;
  onDismiss?: () => void;
}

export const BatteryWarning: React.FC<BatteryWarningProps> = ({ 
  powerStatus, 
  onDismiss 
}) => {
  const { batteryState, batteryPercent, estimatedRuntime } = powerStatus;
  
  if (batteryState === 'normal' || batteryState === 'charging' || batteryState === 'full') {
    return null;
  }
  
  const isLow = batteryState === 'low';
  const isCritical = batteryState === 'critical';
  
  return (
    <div className={`
      fixed top-0 left-0 right-0 z-50 p-4 text-white font-medium
      ${isLow ? 'bg-amber-600' : 'bg-red-600'}
    `}>
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {isCritical ? (
            <AlertTriangle className="w-6 h-6" />
          ) : (
            <BatteryLow className="w-6 h-6" />
          )}
          
          <span>
            {isCritical ? (
              <>⚠ Battery critical ({batteryPercent}%) — system shutting down in 5 minutes</>
            ) : (
              <>Battery at {batteryPercent}% — approximately {formatRuntime(estimatedRuntime)} remaining</>
            )}
          </span>
        </div>
        
        {onDismiss && !isCritical && (
          <button 
            onClick={onDismiss}
            className="text-white hover:text-gray-200 text-xl"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};

export default BatteryIndicator;