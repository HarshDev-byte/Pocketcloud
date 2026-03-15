/**
 * Network Settings Page
 * Complete network management interface for PocketCloud
 * Mobile-optimized for iPhone Safari and Android Chrome
 */

import React from 'react';
import { NetworkStatusCard } from '../../components/network/NetworkStatusCard';
import { HotspotSection } from '../../components/network/HotspotSection';
import { WifiClientSection } from '../../components/network/WifiClientSection';
import { EthernetSection } from '../../components/network/EthernetSection';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

export function NetworkSettingsPage() {
  const { status, isLoading, error, refetch } = useNetworkStatus();

  if (isLoading && !status) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
            <div className="flex items-center space-x-3">
              <div className="text-red-500 text-xl">⚠️</div>
              <div>
                <h3 className="text-red-800 dark:text-red-200 font-medium">
                  Network Error
                </h3>
                <p className="text-red-600 dark:text-red-300 text-sm mt-1">
                  {error}
                </p>
                <button
                  onClick={refetch}
                  className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Network Settings
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Manage WiFi, hotspot, and network connections
          </p>
        </div>

        {/* Network Status Overview */}
        <NetworkStatusCard status={status} />

        {/* Hotspot Configuration */}
        <HotspotSection status={status} onUpdate={refetch} />

        {/* WiFi Client Connection */}
        <WifiClientSection status={status} onUpdate={refetch} />

        {/* Ethernet Status */}
        <EthernetSection status={status} />

        {/* Refresh Button */}
        <div className="text-center">
          <button
            onClick={refetch}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors text-sm"
          >
            🔄 Refresh Status
          </button>
        </div>
      </div>
    </div>
  );
}