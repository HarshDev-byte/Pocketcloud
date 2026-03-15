import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, AlertCircle, CheckCircle } from 'lucide-react';
import { useSpring, animated } from '@react-spring/web';

interface OfflineIndicatorProps {
  className?: string;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  className = ''
}) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOfflineMessage, setShowOfflineMessage] = useState(false);
  const [queuedUploads, setQueuedUploads] = useState(0);

  // Animation for the indicator
  const [spring, api] = useSpring(() => ({
    opacity: 0,
    y: -100,
    config: { tension: 300, friction: 30 }
  }));

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowOfflineMessage(false);
      
      // Show brief "back online" message
      api.start({ opacity: 1, y: 0 });
      setTimeout(() => {
        api.start({ opacity: 0, y: -100 });
      }, 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowOfflineMessage(true);
      api.start({ opacity: 1, y: 0 });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Show offline indicator if already offline
    if (!navigator.onLine) {
      setShowOfflineMessage(true);
      api.start({ opacity: 1, y: 0 });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [api]);

  // Monitor queued uploads from IndexedDB
  useEffect(() => {
    const checkQueuedUploads = async () => {
      try {
        // This would integrate with your upload queue system
        const request = indexedDB.open('pwa-uploads', 1);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['uploads'], 'readonly');
          const store = transaction.objectStore('uploads');
          const countRequest = store.count();
          
          countRequest.onsuccess = () => {
            setQueuedUploads(countRequest.result);
          };
        };
      } catch (error) {
        console.warn('Could not check queued uploads:', error);
      }
    };

    checkQueuedUploads();
    const interval = setInterval(checkQueuedUploads, 5000);

    return () => clearInterval(interval);
  }, []);

  const getIndicatorContent = () => {
    if (!isOnline) {
      return {
        icon: WifiOff,
        title: 'You\'re offline',
        message: queuedUploads > 0 
          ? `${queuedUploads} uploads queued for sync`
          : 'Some features may be limited',
        bgColor: 'bg-orange-500',
        textColor: 'text-white'
      };
    } else if (queuedUploads > 0) {
      return {
        icon: AlertCircle,
        title: 'Syncing...',
        message: `Uploading ${queuedUploads} queued files`,
        bgColor: 'bg-blue-500',
        textColor: 'text-white'
      };
    } else {
      return {
        icon: CheckCircle,
        title: 'Back online',
        message: 'All features available',
        bgColor: 'bg-green-500',
        textColor: 'text-white'
      };
    }
  };

  const { icon: Icon, title, message, bgColor, textColor } = getIndicatorContent();

  if (!showOfflineMessage && isOnline && queuedUploads === 0) {
    return null;
  }

  return (
    <animated.div
      style={spring}
      className={`fixed top-0 left-0 right-0 z-50 ${bgColor} ${textColor} ${className} safe-area-top`}
    >
      <div className="flex items-center justify-center px-4 py-3">
        <Icon className="w-5 h-5 mr-2 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{title}</div>
          <div className="text-xs opacity-90">{message}</div>
        </div>
        
        {!isOnline && (
          <button
            onClick={() => window.location.reload()}
            className="ml-3 px-3 py-1 bg-white/20 rounded text-xs font-medium hover:bg-white/30 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
      
      {/* Progress bar for syncing */}
      {isOnline && queuedUploads > 0 && (
        <div className="h-1 bg-white/20">
          <div 
            className="h-full bg-white/40 transition-all duration-300"
            style={{ width: '60%' }} // This would be calculated based on actual progress
          />
        </div>
      )}
    </animated.div>
  );
};

// Hook for managing offline state
export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        // Trigger sync of queued operations
        window.dispatchEvent(new CustomEvent('app-back-online'));
      }
      setWasOffline(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline]);

  return {
    isOnline,
    wasOffline
  };
}

export default OfflineIndicator;