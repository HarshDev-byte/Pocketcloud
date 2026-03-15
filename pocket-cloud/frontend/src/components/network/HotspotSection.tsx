/**
 * Hotspot Section
 * Manages WiFi hotspot configuration and status
 */

import React, { useState } from 'react';
import { NetworkStatus } from '../../hooks/useNetworkStatus';

interface HotspotSectionProps {
  status: NetworkStatus | null;
  onUpdate: () => void;
}

export function HotspotSection({ status, onUpdate }: HotspotSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [editForm, setEditForm] = useState({
    ssid: '',
    password: ''
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const hotspot = status?.hotspot;
  const isActive = hotspot?.active || false;

  const startEdit = () => {
    setEditForm({
      ssid: hotspot?.ssid || '',
      password: ''
    });
    setIsEditing(true);
    setError(null);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditForm({ ssid: '', password: '' });
    setError(null);
  };

  const saveConfig = async () => {
    if (!editForm.ssid.trim()) {
      setError('Network name is required');
      return;
    }

    if (editForm.password && editForm.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth_token');
      const updates: any = { ssid: editForm.ssid.trim() };
      if (editForm.password) {
        updates.password = editForm.password;
      }

      const response = await fetch('/api/network/hotspot/config', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to update hotspot');
      }

      const result = await response.json();
      setIsEditing(false);
      
      // Show countdown
      setCountdown(result.reconnectIn || 5);
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            onUpdate();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setIsUpdating(false);
    }
  };

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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <span className="text-2xl">📡</span>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            WiFi Hotspot
          </h2>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`w-3 h-3 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`}></span>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {isActive ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>

      {countdown > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="text-yellow-800 dark:text-yellow-200 text-sm">
            ⏱️ Hotspot restarting... reconnect in {countdown}s
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="text-red-800 dark:text-red-200 text-sm">
            {error}
          </div>
        </div>
      )}

      {!isEditing ? (
        <div className="space-y-3">
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Network name</div>
            <div className="font-medium text-gray-900 dark:text-white">
              {hotspot?.ssid || 'PocketCloud'}
            </div>
          </div>
          
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Password</div>
            <div className="flex items-center space-x-2">
              <div className="font-medium text-gray-900 dark:text-white">
                {showPassword ? (hotspot?.password || '••••••••••') : '••••••••••'}
              </div>
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="text-blue-600 dark:text-blue-400 text-sm hover:underline"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={startEdit}
              className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors min-h-[44px] flex items-center justify-center space-x-2"
            >
              <span>✏️</span>
              <span>Edit Hotspot</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Network name
            </label>
            <input
              type="text"
              value={editForm.ssid}
              onChange={(e) => setEditForm(prev => ({ ...prev, ssid: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="PocketCloud"
              maxLength={32}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Password (leave empty to keep current)
            </label>
            <input
              type="password"
              value={editForm.password}
              onChange={(e) => setEditForm(prev => ({ ...prev, password: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="New password (8+ characters)"
              minLength={8}
              maxLength={63}
            />
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <div className="text-yellow-800 dark:text-yellow-200 text-sm">
              ⚠️ WiFi will restart. Reconnect to new network.
            </div>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={cancelEdit}
              disabled={isUpdating}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors min-h-[44px] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={saveConfig}
              disabled={isUpdating || !editForm.ssid.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors min-h-[44px] disabled:opacity-50 flex items-center justify-center"
            >
              {isUpdating ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                'Save & Restart'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}