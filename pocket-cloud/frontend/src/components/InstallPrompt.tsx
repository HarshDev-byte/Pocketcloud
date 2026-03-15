import React, { useState, useEffect } from 'react';
import { X, Download, Share, Plus } from 'lucide-react';

interface InstallPromptProps {
  onDismiss?: () => void;
  className?: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallPrompt: React.FC<InstallPromptProps> = ({
  onDismiss,
  className = ''
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  // Check device type and install eligibility
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches;
    
    setIsIOS(isIOSDevice);
    setIsStandalone(isInStandaloneMode);

    // Get stored state
    const visitCount = parseInt(localStorage.getItem('installPromptVisitCount') || '0');
    const installPromptDismissed = localStorage.getItem('installPromptDismissed') === 'true';
    const installedAt = localStorage.getItem('installedAt');
    const dismissCount = parseInt(localStorage.getItem('installPromptDismissCount') || '0');

    // Increment visit count
    const newVisitCount = visitCount + 1;
    localStorage.setItem('installPromptVisitCount', newVisitCount.toString());

    // Never show again if already installed or dismissed 3 times
    if (isInStandaloneMode || installedAt || dismissCount >= 3) {
      return;
    }

    // iOS: Show if not standalone and visited 2+ times
    if (isIOSDevice && !isInStandaloneMode && newVisitCount >= 2 && !installPromptDismissed) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 2000);
      return () => clearTimeout(timer);
    }

    // Android/Chrome: Show after 2nd visit if beforeinstallprompt available
    if (!isIOSDevice && newVisitCount >= 2 && !installPromptDismissed) {
      // Will show when beforeinstallprompt event fires
    }
  }, []);

  // Listen for beforeinstallprompt event (Android/Chrome)
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Show prompt if conditions are met
      const visitCount = parseInt(localStorage.getItem('installPromptVisitCount') || '0');
      const installPromptDismissed = localStorage.getItem('installPromptDismissed') === 'true';
      
      if (visitCount >= 2 && !installPromptDismissed) {
        setTimeout(() => {
          setIsVisible(true);
        }, 2000);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Android/Chrome native install
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        localStorage.setItem('installedAt', Date.now().toString());
        setIsVisible(false);
      }
      
      setDeferredPrompt(null);
    } else if (isIOS) {
      // Show iOS instructions
      setShowIOSInstructions(true);
    }
  };

  const handleDismiss = () => {
    const dismissCount = parseInt(localStorage.getItem('installPromptDismissCount') || '0');
    localStorage.setItem('installPromptDismissCount', (dismissCount + 1).toString());
    
    if (dismissCount + 1 >= 3) {
      localStorage.setItem('installPromptDismissed', 'true');
    }
    
    setIsVisible(false);
    onDismiss?.();
  };

  const handleIOSGotIt = () => {
    localStorage.setItem('installedAt', Date.now().toString());
    setShowIOSInstructions(false);
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <>
      {/* Main Install Prompt - Bottom Sheet Style */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 rounded-t-xl shadow-2xl border-t border-gray-200 dark:border-gray-700 p-6 ${className}`}>
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-xl flex items-center justify-center">
            <Download className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {isIOS ? 'Install PocketCloud' : 'Add PocketCloud to home screen'}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {isIOS 
                ? 'Add to your home screen for the best experience'
                : 'Get quick access and work offline'
              }
            </p>
            
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleInstallClick}
                className="flex-1 bg-blue-600 text-white text-sm font-medium py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors"
              >
                {isIOS ? 'Show Instructions' : 'Install'}
              </button>
              <button
                onClick={handleDismiss}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm font-medium py-3 px-4"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* iOS Instructions Modal */}
      {showIOSInstructions && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-sm w-full p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <Share className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Install PocketCloud
              </h3>
              
              <div className="text-left space-y-4 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">1</span>
                  </div>
                  <div className="flex-1">
                    <span>Tap the Share button</span>
                    <div className="flex items-center gap-1 mt-1">
                      <Share className="w-4 h-4 text-blue-500" />
                      <span className="text-xs text-gray-500">(in Safari toolbar)</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">2</span>
                  </div>
                  <div className="flex-1">
                    <span>Tap "Add to Home Screen"</span>
                    <div className="flex items-center gap-1 mt-1">
                      <Plus className="w-4 h-4 text-blue-500" />
                      <span className="text-xs text-gray-500">(scroll down if needed)</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <button
                onClick={handleIOSGotIt}
                className="w-full bg-blue-600 text-white text-sm font-medium py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors mt-6"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Hook for managing install prompt state
export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if app is already installed
    const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches;
    const installedAt = localStorage.getItem('installedAt');
    
    setIsInstalled(isInStandaloneMode || !!installedAt);

    // Listen for install events
    const handleAppInstalled = () => {
      setIsInstalled(true);
      localStorage.setItem('installedAt', Date.now().toString());
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const resetInstallPrompt = () => {
    localStorage.removeItem('installPromptDismissed');
    localStorage.removeItem('installedAt');
    localStorage.removeItem('installPromptVisitCount');
    localStorage.removeItem('installPromptDismissCount');
  };

  return {
    canInstall,
    isInstalled,
    resetInstallPrompt
  };
}

export default InstallPrompt;