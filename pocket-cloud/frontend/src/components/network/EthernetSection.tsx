/**
 * Ethernet Section
 * Read-only display of ethernet connection status
 */

import React from 'react';
import { NetworkStatus } from '../../hooks/useNetworkStatus';

interface EthernetSectionProps {
  status: NetworkStatus | null;
}

export function EthernetSection({ status }: EthernetSectionProps) {
  const ethernet = status?.ethernet;
  const isConnected = ethernet?.connected || false;
  const ethernetIp = ethernet?.ip;

  if (!status) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center space-x-3 mb-4">
        <span className="text-2xl">🔌</span>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Ethernet
        </h2>
      </div>

      {isConnected ? (
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="font-medium text-gray-900 dark:text-white">
              Connected
            </span>
            {ethernetIp && (
              <span className="text-gray-600 dark:text-gray-400">
                • {ethernetIp}
              </span>
            )}
          </div>

          {ethernetIp && (
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Access PocketCloud at:
              </div>
              <div className="space-y-1">
                <div className="font-mono text-sm text-gray-900 dark:text-white">
                  http://{ethernetIp}
                </div>
                <div className="font-mono text-sm text-gray-900 dark:text-white">
                  http://pocketcloud.local
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
            <span className="text-gray-600 dark:text-gray-400">
              Not connected
            </span>
          </div>
          
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Plug in an ethernet cable to enable wired access.
          </div>
        </div>
      )}
    </div>
  );
}