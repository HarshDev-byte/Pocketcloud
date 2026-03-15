import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Wifi, 
  User, 
  Shield, 
  CheckCircle, 
  ArrowRight, 
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2
} from 'lucide-react';

interface SetupData {
  adminUsername: string;
  adminPassword: string;
  confirmPassword: string;
  networkName: string;
  networkPassword: string;
}

interface NetworkInfo {
  networkName: string;
  ipAddress: string;
}

const SetupWizard: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  
  const [setupData, setSetupData] = useState<SetupData>({
    adminUsername: '',
    adminPassword: '',
    confirmPassword: '',
    networkName: 'PocketCloud-' + Math.random().toString(36).substr(2, 4).toUpperCase(),
    networkPassword: 'pocketcloud123'
  });

  // Check if setup is needed
  useEffect(() => {
    checkSetupStatus();
    loadNetworkInfo();
  }, []);

  const checkSetupStatus = async () => {
    try {
      const response = await fetch('/api/setup/status');
      const data = await response.json();
      
      if (!data.needsSetup) {
        // Setup already completed, redirect to login
        navigate('/login');
      }
    } catch (error) {
      console.error('Failed to check setup status:', error);
    }
  };

  const loadNetworkInfo = async () => {
    try {
      const response = await fetch('/api/setup/network-info');
      const data = await response.json();
      setNetworkInfo(data);
    } catch (error) {
      console.error('Failed to load network info:', error);
    }
  };
  const updateSetupData = (field: keyof SetupData, value: string) => {
    setSetupData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 2:
        if (!setupData.adminUsername.trim()) {
          setError('Username is required');
          return false;
        }
        if (setupData.adminUsername.length < 3) {
          setError('Username must be at least 3 characters');
          return false;
        }
        if (/\s/.test(setupData.adminUsername)) {
          setError('Username cannot contain spaces');
          return false;
        }
        if (!setupData.adminPassword) {
          setError('Password is required');
          return false;
        }
        if (setupData.adminPassword.length < 8) {
          setError('Password must be at least 8 characters');
          return false;
        }
        if (setupData.adminPassword !== setupData.confirmPassword) {
          setError('Passwords do not match');
          return false;
        }
        return true;
      
      case 3:
        if (!setupData.networkName.trim()) {
          setError('Network name is required');
          return false;
        }
        if (setupData.networkName.length < 3 || setupData.networkName.length > 32) {
          setError('Network name must be 3-32 characters');
          return false;
        }
        if (!setupData.networkPassword) {
          setError('Network password is required');
          return false;
        }
        if (setupData.networkPassword.length < 8 || setupData.networkPassword.length > 63) {
          setError('Network password must be 8-63 characters');
          return false;
        }
        return true;
      
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 4));
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
    setError(null);
  };

  const completeSetup = async () => {
    if (!validateStep(3)) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/setup/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adminUsername: setupData.adminUsername,
          adminPassword: setupData.adminPassword,
          networkName: setupData.networkName,
          networkPassword: setupData.networkPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Setup failed');
      }

      setCurrentStep(4);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Setup failed');
    } finally {
      setIsLoading(false);
    }
  };

  const getPasswordStrength = (password: string): { score: number; text: string; color: string } => {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score < 3) return { score, text: 'Weak', color: 'bg-red-500' };
    if (score < 5) return { score, text: 'Medium', color: 'bg-yellow-500' };
    return { score, text: 'Strong', color: 'bg-green-500' };
  };

  const passwordStrength = getPasswordStrength(setupData.adminPassword);
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step <= currentStep
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                }`}
              >
                {step < currentStep ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  step
                )}
              </div>
            ))}
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / 4) * 100}%` }}
            />
          </div>
        </div>

        {/* Setup card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8">
          {/* Step 1: Welcome */}
          {currentStep === 1 && (
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-6">
                <Shield className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Welcome to Pocket Cloud Drive
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mb-8">
                Your personal cloud storage device. Let's get you set up in just a few steps.
              </p>
              <button
                onClick={nextStep}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Step 2: Admin Account */}
          {currentStep === 2 && (
            <div>
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <User className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  Create Admin Account
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  This account controls everything on your Pocket Cloud Drive
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Username
                  </label>
                  <input
                    type="text"
                    value={setupData.adminUsername}
                    onChange={(e) => updateSetupData('adminUsername', e.target.value)}
                    placeholder="admin"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Minimum 3 characters, no spaces
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={setupData.adminPassword}
                      onChange={(e) => updateSetupData('adminPassword', e.target.value)}
                      placeholder="Enter a strong password"
                      className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {setupData.adminPassword && (
                    <div className="mt-2">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${passwordStrength.color}`}
                            style={{ width: `${(passwordStrength.score / 6) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {passwordStrength.text}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={setupData.confirmPassword}
                      onChange={(e) => updateSetupData('confirmPassword', e.target.value)}
                      placeholder="Confirm your password"
                      className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={prevStep}
                  className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-3 px-4 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  onClick={nextStep}
                  className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  Next
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          {/* Step 3: Network Configuration */}
          {currentStep === 3 && (
            <div>
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Wifi className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  Name Your Network
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Configure your WiFi network settings
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    WiFi Network Name
                  </label>
                  <input
                    type="text"
                    value={setupData.networkName}
                    onChange={(e) => updateSetupData('networkName', e.target.value)}
                    placeholder="PocketCloud-XXXX"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    3-32 characters, visible to nearby devices
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    WiFi Password
                  </label>
                  <input
                    type="password"
                    value={setupData.networkPassword}
                    onChange={(e) => updateSetupData('networkPassword', e.target.value)}
                    placeholder="Enter network password"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    8-63 characters, required to connect
                  </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                    Network Information
                  </h4>
                  <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                    <p>Devices will connect to: <strong>{setupData.networkName}</strong></p>
                    <p>Password: <strong>{"•".repeat(setupData.networkPassword.length)}</strong></p>
                    <p>IP Address: <strong>192.168.4.1</strong></p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={prevStep}
                  className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-3 px-4 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  onClick={completeSetup}
                  disabled={isLoading}
                  className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      Complete Setup
                      <CheckCircle className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Complete */}
          {currentStep === 4 && (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Your Pocket Cloud Drive is Ready!
              </h2>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                  <p><strong>Network:</strong> {setupData.networkName}</p>
                  <p><strong>IP Address:</strong> 192.168.4.1</p>
                  <p><strong>Admin:</strong> {setupData.adminUsername}</p>
                </div>
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-8">
                You can now access your cloud drive from any device connected to your network.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Open My Cloud Drive
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SetupWizard;