/**
 * WiFi Network List
 * Displays available WiFi networks with signal strength and security indicators
 */

import React from 'react';
import { WifiNetwork } from '../../hooks/useWifiScan';

interface WifiNetworkListProps {
  networks: WifiNetwork[];
  onNetworkSelect: (ssid: string) => void;
}

export function WifiNetworkList({ networks, onNetworkSelect }: WifiNetworkListProps) {
  const getSignalBars = (signal: number) => {
    // Convert dBm to signal strength bars
    // > -50 dBm: 3 bars (strong)
    // > -70 dBm: 2 bars (medium)  
    // <= -70 dBm: 1 bar (weak)
    
    if (signal > -50) return 3;
    if (signal > -70) return 2;
    return 1;
  };

  const renderSignalBars = (signal: number) => {
    const bars = getSignalBars(signal);
    const barElements = [];
    
    for (let i = 1; i <= 3; i++) {
      barElements.push(
        <div
          key={i}
          className={`w-1 h-${i + 1} ${
            i <= bars 
              ? 'bg-gray-900 dark:bg-white' 
              : 'bg-gray-300 dark:bg-gray-600'
          }`}
        />
      );
    }
    
    return (
      <div className="flex items-end space-x-0.5 h-4">
        {barElements}
      </div>
    );
  };

  if (networks.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No networks found. Try scanning again.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {networks.map((network, index) => (
        <button
          key={`${network.ssid}-${index}`}
          onClick={() => onNetworkSelect(network.ssid)}
          className="w-full p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left min-h-[44px] flex items-center"
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              {/* Signal Strength */}
              <div className="flex-shrink-0">
                {renderSignalBars(network.signal)}
              </div>
              
              {/* Network Name */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 dark:text-white truncate">
                  {network.ssid}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {network.frequency} • {network.signal} dBm
                </div>
              </div>
            </div>
            
            {/* Security Icon */}
            <div className="flex-shrink-0 ml-3">
              {network.secured ? (
                <span className="text-gray-600 dark:text-gray-400" title="Secured">
                  🔒
                </span>
              ) : (
                <span className="text-gray-400 dark:text-gray-500" title="Open">
                  🔓
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}