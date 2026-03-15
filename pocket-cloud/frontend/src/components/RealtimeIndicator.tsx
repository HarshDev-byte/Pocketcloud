import { useState, useEffect } from 'react';
import { Wifi, WifiOff, RotateCw } from 'lucide-react';

interface RealtimeIndicatorProps {
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
}

export function RealtimeIndicator({ connectionStatus }: RealtimeIndicatorProps) {
  const [showReconnectedToast, setShowReconnectedToast] = useState(false);
  const [wasDisconnected, setWasDisconnected] = useState(false);

  // Track connection state changes to show reconnection toast
  useEffect(() => {
    if (connectionStatus === 'disconnected' || connectionStatus === 'reconnecting') {
      setWasDisconnected(true);
    } else if (connectionStatus === 'connected' && wasDisconnected) {
      setShowReconnectedToast(true);
      setWasDisconnected(false);
      
      // Hide toast after 3 seconds
      const timer = setTimeout(() => {
        setShowReconnectedToast(false);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [connectionStatus, wasDisconnected]);

  const getIndicatorColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'text-green-500';
      case 'connecting':
      case 'reconnecting':
        return 'text-amber-500';
      case 'disconnected':
        return 'text-red-500';
      default:
        return 'text-gray-400';
    }
  };

  const getIndicatorIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Wifi className="w-4 h-4" />;
      case 'connecting':
      case 'reconnecting':
        return <RotateCw className="w-4 h-4 animate-spin" />;
      case 'disconnected':
        return <WifiOff className="w-4 h-4" />;
      default:
        return <WifiOff className="w-4 h-4" />;
    }
  };

  const getTooltipText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'Connected - Live updates enabled';
      case 'connecting':
        return 'Connecting...';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'disconnected':
        return 'Disconnected - Live updates disabled';
      default:
        return 'Unknown connection state';
    }
  };

  return (
    <>
      {/* Connection indicator dot */}
      <div 
        className={`flex items-center space-x-1 ${getIndicatorColor()}`}
        title={getTooltipText()}
      >
        {getIndicatorIcon()}
        <span className="text-xs font-medium hidden sm:inline">
          {connectionStatus === 'connected' ? 'Live' : 
           connectionStatus === 'connecting' ? 'Connecting' :
           connectionStatus === 'reconnecting' ? 'Reconnecting' : 'Offline'}
        </span>
      </div>

      {/* Offline banner */}
      {(connectionStatus === 'disconnected' || connectionStatus === 'reconnecting') && (
        <div className="fixed top-0 left-0 right-0 bg-amber-500 text-white text-center py-2 px-4 text-sm font-medium z-50">
          <div className="flex items-center justify-center space-x-2">
            <RotateCw className="w-4 h-4 animate-spin" />
            <span>
              {connectionStatus === 'disconnected' 
                ? 'Offline — reconnecting...' 
                : 'Reconnecting to server...'}
            </span>
          </div>
        </div>
      )}

      {/* Reconnected toast */}
      {showReconnectedToast && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-in slide-in-from-right duration-300">
          <div className="flex items-center space-x-2">
            <Wifi className="w-4 h-4" />
            <span className="font-medium">Back online</span>
          </div>
        </div>
      )}
    </>
  );
}