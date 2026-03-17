import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Cloud,
  Folder,
  Lock,
  Wifi,
  Check,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  HardDrive,
  Database,
  Sparkles,
  QrCode,
} from 'lucide-react';
import { Button, Input, Card } from '../components/ui';
import { toast } from '../components/ui';
import { cn } from '../lib/cn';
import { apiGet, apiPost } from '../lib/api';

type Step = 1 | 2 | 3 | 4 | 5;

interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
}

export default function SetupWizardPage() {
  const [step, setStep] = useState<Step>(1);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [networkName, setNetworkName] = useState('');
  const [networkPassword, setNetworkPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [storageInfo, setStorageInfo] = useState<any>(null);
  
  const navigate = useNavigate();

  // Load network info on step 3
  useEffect(() => {
    if (step === 3) {
      loadNetworkInfo();
    }
  }, [step]);

  // Load storage info on step 4
  useEffect(() => {
    if (step === 4) {
      loadStorageInfo();
    }
  }, [step]);

  const loadNetworkInfo = async () => {
    try {
      const data = await apiGet<any>('/api/network/status');
      setNetworkName(data.ssid || 'PocketCloud-XXXX');
      setNetworkPassword(data.password || '');
    } catch (error) {
      console.error('Failed to load network info:', error);
    }
  };

  const loadStorageInfo = async () => {
    try {
      const data = await apiGet<any>('/api/health');
      setStorageInfo(data.storage);
    } catch (error) {
      console.error('Failed to load storage info:', error);
    }
  };

  const calculatePasswordStrength = (pwd: string): PasswordStrength => {
    let score = 0;
    
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^a-zA-Z0-9]/.test(pwd)) score++;

    const labels = ['Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
    const colors = ['red', 'orange', 'yellow', 'green', 'green'];

    return {
      score: Math.min(score, 4) as 0 | 1 | 2 | 3 | 4,
      label: labels[Math.min(score, 4)],
      color: colors[Math.min(score, 4)],
    };
  };

  const passwordStrength = calculatePasswordStrength(password);
  const passwordsMatch = password && confirmPassword && password === confirmPassword;

  const handleStep2Continue = async () => {
    if (!username || !password || !confirmPassword) {
      toast.error('Please fill all fields');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (passwordStrength.score < 2) {
      toast.error('Please use a stronger password');
      return;
    }

    setLoading(true);
    try {
      await apiPost('/api/setup/admin', { username, password });
      setStep(3);
    } catch (error: any) {
      toast.error('Failed to create admin account', error.response?.data?.error?.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStep3Continue = async () => {
    if (!networkName || !networkPassword) {
      toast.error('Please fill all fields');
      return;
    }

    setLoading(true);
    try {
      await apiPost('/api/network/configure', {
        ssid: networkName,
        password: networkPassword,
      });
      setStep(4);
    } catch (error: any) {
      toast.error('Failed to configure network', error.response?.data?.error?.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStep4Continue = () => {
    if (!storageInfo || storageInfo.freeBytes < 1000000000) {
      toast.error('Storage check failed');
      return;
    }
    setStep(5);
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      await apiPost('/api/setup/complete');
      toast.success('Setup complete!');
      setTimeout(() => navigate('/files'), 1000);
    } catch (error: any) {
      toast.error('Failed to complete setup', error.response?.data?.error?.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-surface-50 via-surface-0 to-brand-50 dark:from-surface-950 dark:via-surface-900 dark:to-surface-900" />
      
      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,#000_70%,transparent_110%)]" />

      {/* Content */}
      <Card className="w-full max-w-2xl relative z-10 animate-fade-in" padding="lg">
        {/* Progress Dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={cn(
                'w-2 h-2 rounded-full transition-all duration-300',
                s === step
                  ? 'w-8 bg-brand-500'
                  : s < step
                  ? 'bg-brand-500'
                  : 'bg-surface-300 dark:bg-surface-700'
              )}
            />
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div className="text-center animate-fade-in">
            <div className="w-24 h-24 mx-auto bg-brand-100 dark:bg-brand-900/30 rounded-3xl flex items-center justify-center mb-6 animate-pulse">
              <Cloud className="w-16 h-16 text-brand-500" />
            </div>
            <h1 className="text-3xl font-bold text-surface-900 dark:text-surface-100 mb-3">
              Welcome to PocketCloud Drive
            </h1>
            <p className="text-surface-600 dark:text-surface-400 mb-8 max-w-md mx-auto">
              Let's get your personal cloud set up. This takes about 2 minutes.
            </p>

            {/* Features */}
            <div className="grid grid-cols-3 gap-6 mb-8 max-w-lg mx-auto">
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 bg-surface-100 dark:bg-surface-800 rounded-xl flex items-center justify-center">
                  <Folder className="w-6 h-6 text-brand-500" />
                </div>
                <span className="text-sm font-medium text-surface-700 dark:text-surface-300">
                  Store anything
                </span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 bg-surface-100 dark:bg-surface-800 rounded-xl flex items-center justify-center">
                  <Lock className="w-6 h-6 text-brand-500" />
                </div>
                <span className="text-sm font-medium text-surface-700 dark:text-surface-300">
                  100% private
                </span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 bg-surface-100 dark:bg-surface-800 rounded-xl flex items-center justify-center">
                  <Wifi className="w-6 h-6 text-brand-500" />
                </div>
                <span className="text-sm font-medium text-surface-700 dark:text-surface-300">
                  Works offline
                </span>
              </div>
            </div>

            <Button
              variant="primary"
              size="lg"
              onClick={() => setStep(2)}
              iconRight={<ArrowRight className="w-5 h-5" />}
            >
              Get Started
            </Button>
          </div>
        )}

        {/* Step 2: Create Admin Account */}
        {step === 2 && (
          <div className="animate-fade-in">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-2">
                Create your admin account
              </h2>
              <p className="text-surface-600 dark:text-surface-400">
                This account has full control of PocketCloud.
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <Input
                label="Username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username"
                hint="3-32 characters, letters, numbers, and underscores only"
                autoFocus
              />

              <div>
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Choose a strong password"
                />
                {password && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-surface-600 dark:text-surface-400">
                        Password strength
                      </span>
                      <span
                        className={cn(
                          'text-xs font-medium',
                          passwordStrength.color === 'red' && 'text-red-500',
                          passwordStrength.color === 'orange' && 'text-orange-500',
                          passwordStrength.color === 'yellow' && 'text-yellow-500',
                          passwordStrength.color === 'green' && 'text-green-500'
                        )}
                      >
                        {passwordStrength.label}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={cn(
                            'h-1.5 flex-1 rounded-full transition-all',
                            i <= passwordStrength.score
                              ? passwordStrength.color === 'red'
                                ? 'bg-red-500'
                                : passwordStrength.color === 'orange'
                                ? 'bg-orange-500'
                                : passwordStrength.color === 'yellow'
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                              : 'bg-surface-200 dark:bg-surface-700'
                          )}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <Input
                  label="Confirm Password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                />
                {confirmPassword && (
                  <p
                    className={cn(
                      'mt-1.5 text-xs flex items-center gap-1',
                      passwordsMatch
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {passwordsMatch ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Passwords match
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3.5 h-3.5" />
                        Passwords do not match
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setStep(1)} icon={<ArrowLeft className="w-4 h-4" />}>
                Back
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleStep2Continue}
                loading={loading}
                iconRight={<ArrowRight className="w-5 h-5" />}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Name Your Network */}
        {step === 3 && (
          <div className="animate-fade-in">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-2">
                Name your WiFi network
              </h2>
              <p className="text-surface-600 dark:text-surface-400">
                Devices connect to this WiFi to access PocketCloud.
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <Input
                label="Network Name (SSID)"
                type="text"
                value={networkName}
                onChange={(e) => setNetworkName(e.target.value)}
                placeholder="PocketCloud-XXXX"
                autoFocus
              />

              <Input
                label="Network Password"
                type="password"
                value={networkPassword}
                onChange={(e) => setNetworkPassword(e.target.value)}
                placeholder="Choose a WiFi password"
                hint="Minimum 8 characters"
              />

              <div className="p-4 bg-surface-100 dark:bg-surface-800 rounded-lg">
                <p className="text-sm text-surface-600 dark:text-surface-400 mb-1">
                  Devices will see:
                </p>
                <p className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                  {networkName || 'PocketCloud-XXXX'}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setStep(2)} icon={<ArrowLeft className="w-4 h-4" />}>
                Back
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleStep3Continue}
                loading={loading}
                iconRight={<ArrowRight className="w-5 h-5" />}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Storage Check */}
        {step === 4 && (
          <div className="animate-fade-in">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-2">
                Storage Check
              </h2>
              <p className="text-surface-600 dark:text-surface-400">
                Verifying your storage is ready.
              </p>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 p-4 bg-surface-100 dark:bg-surface-800 rounded-lg">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <HardDrive className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-surface-900 dark:text-surface-100">
                    USB Drive detected
                  </p>
                  <p className="text-sm text-surface-600 dark:text-surface-400">
                    {storageInfo
                      ? `${(storageInfo.totalBytes / 1e12).toFixed(1)} TB`
                      : 'Checking...'}
                  </p>
                </div>
                <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>

              <div className="flex items-center gap-3 p-4 bg-surface-100 dark:bg-surface-800 rounded-lg">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <Folder className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-surface-900 dark:text-surface-100">
                    Storage available
                  </p>
                  <p className="text-sm text-surface-600 dark:text-surface-400">
                    {storageInfo
                      ? `${(storageInfo.freeBytes / 1e9).toFixed(0)} GB free`
                      : 'Checking...'}
                  </p>
                </div>
                <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>

              <div className="flex items-center gap-3 p-4 bg-surface-100 dark:bg-surface-800 rounded-lg">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <Database className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-surface-900 dark:text-surface-100">
                    Database ready
                  </p>
                  <p className="text-sm text-surface-600 dark:text-surface-400">
                    All systems operational
                  </p>
                </div>
                <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setStep(3)} icon={<ArrowLeft className="w-4 h-4" />}>
                Back
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleStep4Continue}
                iconRight={<ArrowRight className="w-5 h-5" />}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 5: All Done */}
        {step === 5 && (
          <div className="text-center animate-fade-in">
            <div className="relative mb-6">
              <div className="w-24 h-24 mx-auto bg-brand-100 dark:bg-brand-900/30 rounded-3xl flex items-center justify-center">
                <Sparkles className="w-16 h-16 text-brand-500" />
              </div>
              {/* Confetti effect */}
              <div className="absolute inset-0 pointer-events-none">
                {[...Array(20)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-2 h-2 bg-brand-500 rounded-full animate-confetti"
                    style={{
                      left: `${50 + (Math.random() - 0.5) * 100}%`,
                      animationDelay: `${Math.random() * 0.5}s`,
                      animationDuration: `${1 + Math.random()}s`,
                    }}
                  />
                ))}
              </div>
            </div>

            <h1 className="text-3xl font-bold text-surface-900 dark:text-surface-100 mb-3">
              PocketCloud is ready!
            </h1>
            <p className="text-surface-600 dark:text-surface-400 mb-8">
              Your personal cloud is set up and ready to use.
            </p>

            <div className="grid gap-4 max-w-md mx-auto">
              <Button
                variant="primary"
                size="lg"
                onClick={handleComplete}
                loading={loading}
                iconRight={<ArrowRight className="w-5 h-5" />}
              >
                Open File Manager
              </Button>

              <Button variant="outline" size="lg" icon={<QrCode className="w-5 h-5" />}>
                Connect another device
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Custom confetti animation */}
      <style>{`
        @keyframes confetti {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(200px) rotate(360deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confetti 1.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
