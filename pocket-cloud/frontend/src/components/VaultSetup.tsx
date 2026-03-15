import React, { useState } from 'react';
import { Shield, Lock, Eye, EyeOff, AlertTriangle, Key, Info } from 'lucide-react';
import { CryptoService } from '../services/crypto.service';

interface VaultSetupProps {
  folderName: string;
  onCreateVault: (password: string, hint?: string) => void;
  onCancel: () => void;
}

export const VaultSetup: React.FC<VaultSetupProps> = ({
  folderName,
  onCreateVault,
  onCancel
}) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [hint, setHint] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, feedback: [], isValid: false });
  const [useGeneratedPassword, setUseGeneratedPassword] = useState(false);

  React.useEffect(() => {
    if (password) {
      const strength = CryptoService.validatePasswordStrength(password);
      setPasswordStrength(strength);
    } else {
      setPasswordStrength({ score: 0, feedback: [], isValid: false });
    }
  }, [password]);

  const generatePassword = () => {
    const generated = CryptoService.generateSecurePassword(20);
    setPassword(generated);
    setConfirmPassword(generated);
    setUseGeneratedPassword(true);
    setShowPassword(true);
  };

  const handleCreateVault = () => {
    if (!passwordStrength.isValid || password !== confirmPassword) {
      return;
    }
    onCreateVault(password, hint.trim() || undefined);
  };

  const getStrengthColor = (score: number) => {
    switch (score) {
      case 0: return 'bg-gray-300';
      case 1: return 'bg-red-500';
      case 2: return 'bg-orange-500';
      case 3: return 'bg-yellow-500';
      case 4: return 'bg-green-500';
      default: return 'bg-gray-300';
    }
  };

  const getStrengthText = (score: number) => {
    switch (score) {
      case 0: return 'No password';
      case 1: return 'Very Weak';
      case 2: return 'Weak';
      case 3: return 'Good';
      case 4: return 'Strong';
      default: return 'Unknown';
    }
  };

  const passwordsMatch = password === confirmPassword;
  const canProceed = passwordStrength.isValid && passwordsMatch;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-purple-50 border-b border-purple-200 p-6">
          <div className="flex items-center">
            <Shield className="text-purple-600 mr-3" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Create Encrypted Vault
              </h2>
              <p className="text-gray-600 mt-1">
                Set up "{folderName}" as an encrypted vault
              </p>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="bg-red-50 border-b border-red-200 p-4">
          <div className="flex items-start">
            <AlertTriangle className="text-red-600 mr-2 mt-0.5" size={16} />
            <div className="text-sm text-red-800">
              <p className="font-medium mb-1">Critical Security Warning</p>
              <p>
                All files in this vault will be automatically encrypted. The vault password 
                cannot be recovered - if you lose it, all files will be permanently inaccessible.
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="p-6 space-y-6">
          {/* Vault Info */}
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-start">
              <Info className="text-blue-600 mr-2 mt-0.5" size={16} />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">How Vaults Work</p>
                <ul className="space-y-1 text-xs">
                  <li>• All files uploaded to this folder are automatically encrypted</li>
                  <li>• Files are encrypted in your browser before upload</li>
                  <li>• The vault password is required to access any file</li>
                  <li>• Vault sessions expire after 15 minutes of inactivity</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Password Generation */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center">
                <Key className="text-gray-600 mr-2" size={16} />
                <span className="font-medium text-gray-900">Vault Password</span>
              </div>
              <button
                onClick={generatePassword}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Generate Secure Password
              </button>
            </div>
            {useGeneratedPassword && (
              <div className="bg-green-50 border border-green-200 rounded p-3">
                <p className="text-sm text-green-800 mb-2">
                  <Lock className="inline mr-1" size={14} />
                  Secure vault password generated. Save this in your password manager!
                </p>
                <code className="text-sm font-mono bg-white px-2 py-1 rounded border block">
                  {password}
                </code>
              </div>
            )}
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Vault Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setUseGeneratedPassword(false);
                }}
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Enter a very strong password"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Password Strength */}
          {password && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Password Strength</span>
                <span className={`text-sm font-medium ${
                  passwordStrength.score >= 3 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {getStrengthText(passwordStrength.score)}
                </span>
              </div>
              <div className="flex space-x-1 mb-2">
                {[1, 2, 3, 4].map((level) => (
                  <div
                    key={level}
                    className={`flex-1 h-2 rounded ${
                      level <= passwordStrength.score 
                        ? getStrengthColor(passwordStrength.score)
                        : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
              {passwordStrength.feedback.length > 0 && (
                <ul className="text-xs text-gray-600 space-y-1">
                  {passwordStrength.feedback.map((item, index) => (
                    <li key={index}>• {item}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Vault Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                confirmPassword && !passwordsMatch 
                  ? 'border-red-300 bg-red-50' 
                  : 'border-gray-300'
              }`}
              placeholder="Confirm your vault password"
              autoComplete="new-password"
            />
            {confirmPassword && !passwordsMatch && (
              <p className="text-sm text-red-600 mt-1">Passwords do not match</p>
            )}
          </div>

          {/* Password Hint */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password Hint (Optional)
            </label>
            <input
              type="text"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="A hint to help you remember (not the password itself)"
              maxLength={100}
            />
            <p className="text-xs text-gray-500 mt-1">
              This hint will be visible to help you remember the password. Don't include the actual password.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-between items-center">
          <button
            onClick={onCancel}
            className="text-gray-700 hover:text-gray-900 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateVault}
            disabled={!canProceed}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
          >
            <Shield className="mr-2" size={16} />
            Create Vault
          </button>
        </div>
      </div>
    </div>
  );
};