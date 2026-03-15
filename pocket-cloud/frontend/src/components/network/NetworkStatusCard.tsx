/**
 * Network Status Card
 * Shows current access points and connection status
 */

import React, { useState } from 'react';
import { NetworkStatus } from '../../hooks/useNetworkStatus';

interface NetworkStatusCardProps {
  status: NetworkStatus | null;
}

export function NetworkStatusCard({ status }: NetworkStatusCardProps) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    }
  };

  if (!status) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    );
  }

  const accessUrls = status.accessUrls || [];
  const connectedDevices = status.hotspot?.connected_devices || 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center space-x-3 mb-4">
        <div className="text-2xl">🌐</div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            PocketCloud is reachable at:
          </h2>
        </div>
      </div>

      {accessUrls.length === 0 ? (
        <div className="text-gray-500 dark:text-gray-400 text-center py-4">
          No network connections available
        </div>
      ) : (
        <div className="space-y-3">
          {accessUrls.map((url, index) => {
            const isHotspot = url.includes('192.168.4.');
            const isWifi = url.includes('192.168.1.') || url.includes('192.168.0.');
            const isMdns = url.includes('.local');
            
            let icon = '🔗';
            let label = 'Network';
            
            if (isHotspot) {
              icon = '📶';
              label = 'Hotspot';
            } else if (isWifi) {
              icon = '🏠';
              label = 'WiFi';
            } else if (isMdns) {
              icon = '🔗';
              label = 'mDNS';
            }

            return (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <span className="text-lg">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {label}
                    </div>
                    <div className="font-mono text-sm text-gray-900 dark:text-white truncate">
                      {url}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => copyToClipboard(url)}
                  className="ml-3 px-3 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors min-h-[44px] flex items-center"
                >
                  {copiedUrl === url ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {connectedDevices > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">{connectedDevices}</span> device{connectedDevices !== 1 ? 's' : ''} connected to hotspot
          </div>
        </div>
      )}
    </div>
  );
}