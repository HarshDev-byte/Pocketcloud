import React, { useState } from 'react';
import { Shield, Eye, EyeOff, AlertTriangle, Clock, Unlock } from 'lucide-react';

interface VaultUnlockProps {
  vaultName: string;
  vaultHint?: string;
  onUnlock: (password: string) => Promise<boolean>;
  onCancel: () => void;
}

export const VaultUnlock: React.FC<VaultUnlockProps> = ({
  vaultName,
  vaultHint,
  onUnlock,
  onCancel
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  const handleUnlock = async () => {
    if (!password.trim()) {
      setError('Please enter the vault password');
      return;
    }

    setIsUnlocking(true);
    setError(null);

    try {
      const success = await onUnlock(password);
      
      if (!success) {
        setAttempts(prev => prev + 1);
        setError('Incorrect vault password. Please try again.');
        setPassword('');
        
        if (attempts >= 2) {
          setError('Multiple failed attempts. Please double-check your password.');
        }
      }
    } catch (error) {
      setError(`Failed to unlock vault: ${(error as Error).message}`);
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && password.trim() && !isUnlocking) {
      handleUnlock();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="bg-purple-50 border-b border-purple-200 p-6">
          <div className="flex items-center">
            <Shield className="text-purple-600 mr-3" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Unlock Vault
              </h2>
              <p className="text-gray-600 mt-1">
                Enter password to access "{vaultName}"
              </p>
            </div>
          </div>
        </div>

        {/* Vault Info */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Shield className="text-purple-600" size={24} />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">{vaultName}</h3>
              <p className="text-sm text-gray-500">Encrypted Vault</p>
            </div>
          </div>

          {vaultHint && (
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                <span className="font-medium">Hint:</span> {vaultHint}
              </p>
            </div>
          )}
        </div>

        {/* Password Input */}
        <div className="p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Vault Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                onKeyPress={handleKeyPress}
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Enter vault password"
                autoFocus
                disabled={isUnlocking}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                disabled={isUnlocking}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center">
                <AlertTriangle className="text-red-600 mr-2" size={16} />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}

          {attempts > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center">
                <AlertTriangle className="text-yellow-600 mr-2" size={16} />
                <p className="text-sm text-yellow-800">
                  {attempts} failed attempt{attempts !== 1 ? 's' : ''}. 
                  Make sure you're using the correct vault password.
                </p>
              </div>
            </div>
          )}

          {/* Session Info */}
          <div className="bg-gray-50 rounded-lg p-3 mb-4">
            <div className="flex items-start">
              <Clock className="text-gray-500 mr-2 mt-0.5" size={14} />
              <div className="text-xs text-gray-600">
                <p className="font-medium mb-1">Session Security</p>
                <p>
                  Once unlocked, the vault will remain accessible for 15 minutes of activity. 
                  The session will automatically expire for security.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-between items-center">
          <button
            onClick={onCancel}
            className="text-gray-700 hover:text-gray-900 font-medium"
            disabled={isUnlocking}
          >
            Cancel
          </button>
          <button
            onClick={handleUnlock}
            disabled={!password.trim() || isUnlocking}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
          >
            {isUnlocking ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Unlocking...
              </>
            ) : (
              <>
                <Unlock className="mr-2" size={16} />
                Unlock Vault
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};