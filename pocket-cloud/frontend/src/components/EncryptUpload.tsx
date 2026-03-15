import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, AlertTriangle, CheckCircle, Info, Key } from 'lucide-react';
import { CryptoService } from '../services/crypto.service';

interface EncryptUploadProps {
  files: File[];
  onEncrypt: (encryptedFiles: Array<{ file: File; encryptedBlob: Blob; password: string }>) => void;
  onSkip: () => void;
  onCancel: () => void;
}

export const EncryptUpload: React.FC<EncryptUploadProps> = ({
  files,
  onEncrypt,
  onSkip,
  onCancel
}) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, feedback: [], isValid: false });
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [encryptionProgress, setEncryptionProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState('');
  const [useGeneratedPassword, setUseGeneratedPassword] = useState(false);

  useEffect(() => {
    if (password) {
      const strength = CryptoService.validatePasswordStrength(password);
      setPasswordStrength(strength);
    } else {
      setPasswordStrength({ score: 0, feedback: [], isValid: false });
    }
  }, [password]);

  const generatePassword = () => {
    const generated = CryptoService.generateSecurePassword(16);
    setPassword(generated);
    setConfirmPassword(generated);
    setUseGeneratedPassword(true);
    setShowPassword(true);
  };

  const handleEncrypt = async () => {
    if (!passwordStrength.isValid) {
      return;
    }

    if (password !== confirmPassword) {
      return;
    }

    setIsEncrypting(true);
    setEncryptionProgress(0);

    try {
      const encryptedFiles: Array<{ file: File; encryptedBlob: Blob; password: string }> = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setCurrentFile(file.name);
        
        const encryptedBlob = await CryptoService.encryptFile(file, password, (progress) => {
          const fileProgress = (i / files.length) * 100 + (progress.progress / files.length);
          setEncryptionProgress(Math.round(fileProgress));
        });

        encryptedFiles.push({
          file,
          encryptedBlob,
          password
        });
      }

      onEncrypt(encryptedFiles);
    } catch (error) {
      console.error('Encryption failed:', error);
      alert(`Encryption failed: ${(error as Error).message}`);
    } finally {
      setIsEncrypting(false);
    }
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
  const canProceed = passwordStrength.isValid && passwordsMatch && !isEncrypting;

  if (isEncrypting) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <Lock className="mx-auto mb-4 text-blue-600" size={48} />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Encrypting Files
            </h3>
            <p className="text-gray-600 mb-4">
              Encrypting {currentFile}...
            </p>
            
            <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
              <div 
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${encryptionProgress}%` }}
              />
            </div>
            
            <p className="text-sm text-gray-500">
              {encryptionProgress}% complete
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-blue-50 border-b border-blue-200 p-6">
          <div className="flex items-center">
            <Lock className="text-blue-600 mr-3" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Encrypt Before Upload
              </h2>
              <p className="text-gray-600 mt-1">
                Protect {files.length} file{files.length !== 1 ? 's' : ''} with end-to-end encryption
              </p>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="bg-yellow-50 border-b border-yellow-200 p-4">
          <div className="flex items-start">
            <AlertTriangle className="text-yellow-600 mr-2 mt-0.5" size={16} />
            <div className="text-sm text-yellow-800">
              <p className="font-medium mb-1">Important Security Notice</p>
              <p>
                This password cannot be recovered. If you forget it, your files cannot be decrypted.
                Store it securely in a password manager.
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="p-6 space-y-6">
          {/* Password Generation Option */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center">
                <Key className="text-gray-600 mr-2" size={16} />
                <span className="font-medium text-gray-900">Secure Password</span>
              </div>
              <button
                onClick={generatePassword}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Generate Strong Password
              </button>
            </div>
            {useGeneratedPassword && (
              <div className="bg-green-50 border border-green-200 rounded p-3">
                <p className="text-sm text-green-800 mb-2">
                  <CheckCircle className="inline mr-1" size={14} />
                  Secure password generated. Save this password immediately!
                </p>
                <code className="text-sm font-mono bg-white px-2 py-1 rounded border">
                  {password}
                </code>
              </div>
            )}
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Encryption Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setUseGeneratedPassword(false);
                }}
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter a strong password"
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
              Confirm Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                confirmPassword && !passwordsMatch 
                  ? 'border-red-300 bg-red-50' 
                  : 'border-gray-300'
              }`}
              placeholder="Confirm your password"
              autoComplete="new-password"
            />
            {confirmPassword && !passwordsMatch && (
              <p className="text-sm text-red-600 mt-1">Passwords do not match</p>
            )}
          </div>

          {/* Security Info */}
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-start">
              <Info className="text-blue-600 mr-2 mt-0.5" size={16} />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">How Encryption Works</p>
                <ul className="space-y-1 text-xs">
                  <li>• Files are encrypted in your browser using AES-256-GCM</li>
                  <li>• Your password never leaves your device</li>
                  <li>• Even the server admin cannot decrypt your files</li>
                  <li>• Encrypted files have a .pcd extension</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-between items-center">
          <button
            onClick={onSkip}
            className="text-gray-700 hover:text-gray-900 font-medium"
          >
            Skip Encryption
          </button>
          <div className="flex space-x-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleEncrypt}
              disabled={!canProceed}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
            >
              <Lock className="mr-2" size={16} />
              Encrypt & Upload
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};