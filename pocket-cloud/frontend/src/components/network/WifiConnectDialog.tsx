/**
 * WiFi Connect Dialog
 * Modal for entering WiFi password and connection options
 */

import React, { useState, useEffect } from 'react';

interface WifiConnectDialogProps {
  ssid: string;
  onConnect: (ssid: string, password: string) => void;
  onCancel: () => void;
}

export function WifiConnectDialog({ ssid, onConnect, onCancel }: WifiConnectDialogProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepHotspot, setKeepHotspot] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  // Focus password input when dialog opens
  useEffect(() => {
    const input = document.getElementById('wifi-password');
    if (input) {
      input.focus();
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      return;
    }
    setIsConnecting(true);
    onConnect(ssid, password);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 w-full max-w-md">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Connect to "{ssid}"
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label 
                htmlFor="wifi-password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="wifi-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter WiFi password"
                  minLength={8}
                  required
                  disabled={isConnecting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  disabled={isConnecting}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
              {password.length > 0 && password.length < 8 && (
                <div className="text-red-500 text-xs mt-1">
                  Password must be at least 8 characters
                </div>
              )}
            </div>

            <div className="flex items-start space-x-3">
              <input
                type="checkbox"
                id="keep-hotspot"
                checked={keepHotspot}
                onChange={(e) => setKeepHotspot(e.target.checked)}
                className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                disabled={isConnecting}
              />
              <label 
                htmlFor="keep-hotspot"
                className="text-sm text-gray-700 dark:text-gray-300"
              >
                <div className="font-medium">Keep hotspot active</div>
                <div className="text-gray-500 dark:text-gray-400 text-xs">
                  Devices on hotspot can still access PocketCloud
                </div>
              </label>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={isConnecting}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors min-h-[44px] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isConnecting || password.length < 8}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors min-h-[44px] disabled:opacity-50 flex items-center justify-center"
              >
                {isConnecting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  'Connect'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}