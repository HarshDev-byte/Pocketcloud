/**
 * WiFi Client Section
 * Handles scanning and connecting to external WiFi networks
 */

import React, { useState } from 'react';
import { NetworkStatus } from '../../hooks/useNetworkStatus';
import { useWifiScan } from '../../hooks/useWifiScan';
import { useWifiConnect } from '../../hooks/useWifiConnect';
import { WifiNetworkList } from './WifiNetworkList';
import { WifiConnectDialog } from './WifiConnectDialog';

interface WifiClientSectionProps {
  status: NetworkStatus | null;
  onUpdate: () => void;
}

type SectionState = 'idle' | 'scanning' | 'results' | 'connecting' | 'connected' | 'error';

export function WifiClientSection({ status, onUpdate }: WifiClientSectionProps) {
  const [sectionState, setSectionState] = useState<SectionState>('idle');
  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null);
  const { networks, isScanning, scan, error: scanError } = useWifiScan();
  const { connect, disconnect, isConnecting, progress, error: connectError } = useWifiConnect();

  const isWifiConnected = status?.client?.connected || false;
  const wifiSsid = status?.client?.ssid;
  const wifiIp = status?.client?.ip;

  React.useEffect(() => {
    if (isWifiConnected) {
      setSectionState('connected');
    } else if (isScanning) {
      setSectionState('scanning');
    } else if (networks.length > 0) {
      setSectionState('results');
    } else if (isConnecting) {
      setSectionState('connecting');
    } else if (scanError || connectError) {
      setSectionState('error');
    } else {
      setSectionState('idle');
    }
  }, [isWifiConnected, isScanning, networks.length, isConnecting, scanError, connectError]);

  const handleScan = async () => {
    setSectionState('scanning');
    await scan();
  };

  const handleNetworkSelect = (ssid: string) => {
    setSelectedNetwork(ssid);
  };

  const handleConnect = async (ssid: string, password: string) => {
    setSectionState('connecting');
    await connect(ssid, password);
    setSelectedNetwork(null);
    onUpdate();
  };

  const handleDisconnect = async () => {
    const success = await disconnect();
    if (success) {
      setSectionState('idle');
      onUpdate();
    }
  };

  const renderContent = () => {
    switch (sectionState) {
      case 'idle':
        return (
          <div className="text-center py-6">
            <div className="text-gray-600 dark:text-gray-400 mb-4">
              Join an existing network so all devices on it can access PocketCloud.
            </div>
            <button
              onClick={handleScan}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors min-h-[44px]"
            >
              Scan for Networks
            </button>
          </div>
        );

      case 'scanning':
        return (
          <div className="text-center py-6">
            <div className="flex items-center justify-center space-x-3 mb-3">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-gray-900 dark:text-white font-medium">Scanning...</span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              This takes about 10 seconds
            </div>
          </div>
        );

      case 'results':
        return (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-gray-900 dark:text-white">
                Available Networks
              </h3>
              <button
                onClick={handleScan}
                className="px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Rescan
              </button>
            </div>
            <WifiNetworkList
              networks={networks}
              onNetworkSelect={handleNetworkSelect}
            />
          </div>
        );

      case 'connecting':
        return (
          <div className="py-6">
            <div className="text-center mb-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Connecting to "{progress?.ssid || selectedNetwork}"...
              </h3>
            </div>
            
            <div className="space-y-3">
              {[
                'Preparing connection',
                'Connecting to network', 
                'Getting IP address',
                'Testing connection'
              ].map((step, index) => {
                const isActive = progress?.step?.includes(step.toLowerCase()) || 
                                progress?.step?.includes('Connecting') && index === 1 ||
                                progress?.step?.includes('IP') && index === 2;
                const isCompleted = progress?.phase === 'success' && index < 3;
                
                return (
                  <div key={step} className="flex items-center space-x-3">
                    <div className="w-6 h-6 flex items-center justify-center">
                      {isCompleted ? (
                        <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      ) : isActive ? (
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 rounded-full"></div>
                      )}
                    </div>
                    <span className={`text-sm ${isActive || isCompleted ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>

            {progress?.message && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="text-blue-800 dark:text-blue-200 text-sm">
                  {progress.message}
                </div>
              </div>
            )}
          </div>
        );

      case 'connected':
        return (
          <div className="text-center py-6">
            <div className="text-green-600 dark:text-green-400 text-2xl mb-3">✓</div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Connected to "{wifiSsid}"
            </h3>
            
            {wifiIp && (
              <div className="mb-4">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  IP Address: {wifiIp}
                </div>
              </div>
            )}

            <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Devices on this network can now access PocketCloud at:
            </div>

            <div className="space-y-2 mb-6">
              {wifiIp && (
                <div className="flex items-center justify-center space-x-2">
                  <span className="font-mono text-sm">http://{wifiIp}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(`http://${wifiIp}`)}
                    className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    Copy
                  </button>
                </div>
              )}
              <div className="flex items-center justify-center space-x-2">
                <span className="font-mono text-sm">http://pocketcloud.local</span>
                <button
                  onClick={() => navigator.clipboard.writeText('http://pocketcloud.local')}
                  className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Copy
                </button>
              </div>
            </div>

            <button
              onClick={handleDisconnect}
              className="px-6 py-2 border border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 rounded-lg font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors min-h-[44px]"
            >
              Disconnect
            </button>
          </div>
        );

      case 'error':
        const errorMessage = connectError || scanError || 'An error occurred';
        return (
          <div className="text-center py-6">
            <div className="text-red-500 text-2xl mb-3">✗</div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {connectError ? 'Connection failed' : 'Scan failed'}
            </h3>
            
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              "{errorMessage}"
            </div>

            {connectError && (
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Hotspot mode restored. You're still connected.
              </div>
            )}

            <button
              onClick={() => {
                setSectionState('idle');
                if (connectError) {
                  onUpdate();
                }
              }}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors min-h-[44px]"
            >
              Try Again
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center space-x-3 mb-6">
        <span className="text-2xl">🏠</span>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Connect to External WiFi
        </h2>
      </div>

      {renderContent()}

      {selectedNetwork && (
        <WifiConnectDialog
          ssid={selectedNetwork}
          onConnect={handleConnect}
          onCancel={() => setSelectedNetwork(null)}
        />
      )}
    </div>
  );
}