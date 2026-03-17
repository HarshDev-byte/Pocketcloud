import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, Eye, EyeOff, Wifi, AlertCircle, ArrowLeft } from 'lucide-react';
import { Button, Input, Card } from '../components/ui';
import { useAuthStore } from '../store/auth.store';
import { authApi } from '../api/auth.api';
import { toast } from '../components/ui';
import { cn } from '../lib/cn';

type LoginState = 'idle' | 'loading' | 'error' | 'requires2fa' | 'success';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [state, setState] = useState<LoginState>('idle');
  const [totpState, setTotpState] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingUserId, setPendingUserId] = useState('');
  const [totpCode, setTotpCode] = useState(['', '', '', '', '', '']);
  const [piStatus, setPiStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [piInfo, setPiInfo] = useState({ name: '', ip: '' });
  
  const { setUser } = useAuthStore();
  const navigate = useNavigate();
  const totpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Check Pi connection on mount
  useEffect(() => {
    checkPiConnection();
  }, []);

  const checkPiConnection = async () => {
    try {
      const response = await fetch('/api/ping', { signal: AbortSignal.timeout(3000) });
      const data = await response.json();
      setPiStatus('connected');
      setPiInfo({
        name: data.deviceName || 'PocketCloud',
        ip: data.ip || '192.168.4.1',
      });
    } catch {
      setPiStatus('disconnected');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === 'loading') return;

    setState('loading');
    setErrorMessage('');

    try {
      const result = await authApi.login(username, password);

      if ('requiresTotp' in result) {
        // 2FA required
        setPendingUserId(result.pendingUserId);
        setState('requires2fa');
        setTimeout(() => totpInputsRef.current[0]?.focus(), 100);
      } else {
        // Success
        setState('success');
        setUser(result.user);
        toast.success('Welcome back!');
        setTimeout(() => navigate('/files'), 500);
      }
    } catch (error: any) {
      setState('error');
      setErrorMessage(error.response?.data?.error?.message || 'Invalid credentials');
      // Shake animation will trigger via state change
    }
  };

  const handleTotpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // Only digits

    const newCode = [...totpCode];
    newCode[index] = value.slice(-1); // Only last digit
    setTotpCode(newCode);

    // Auto-advance to next input
    if (value && index < 5) {
      totpInputsRef.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (index === 5 && value && newCode.every((d) => d)) {
      handleTotpSubmit(newCode.join(''));
    }
  };

  const handleTotpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !totpCode[index] && index > 0) {
      totpInputsRef.current[index - 1]?.focus();
    }
  };

  const handleTotpSubmit = async (code: string) => {
    setTotpState('loading');
    setErrorMessage('');

    try {
      const result = await authApi.verifyTotp(pendingUserId, code);
      setTotpState('success');
      setUser(result.user);
      toast.success('Welcome back!');
      setTimeout(() => navigate('/files'), 500);
    } catch (error: any) {
      setTotpState('error');
      setErrorMessage(error.response?.data?.error?.message || 'Invalid code');
      setTotpCode(['', '', '', '', '', '']);
      totpInputsRef.current[0]?.focus();
    }
  };

  const handleBackToLogin = () => {
    setState('idle');
    setTotpState('idle');
    setPendingUserId('');
    setTotpCode(['', '', '', '', '', '']);
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-surface-50 via-surface-0 to-brand-50 dark:from-surface-950 dark:via-surface-900 dark:to-surface-900" />
      
      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8882_1px,transparent_1px),linear-gradient(to_bottom,#8882_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,#000_70%,transparent_110%)]" />

      {/* Content */}
      <Card
        className={cn(
          'w-full max-w-md relative z-10 animate-fade-in',
          state === 'error' && 'animate-shake'
        )}
        padding="lg"
      >
        {state !== 'requires2fa' ? (
          <>
            {/* Logo & Header */}
            <div className="flex flex-col items-center mb-8">
              <div className="w-16 h-16 bg-brand-100 dark:bg-brand-900/30 rounded-2xl flex items-center justify-center mb-4">
                <Cloud className="w-10 h-10 text-brand-500" />
              </div>
              <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
                PocketCloud
              </h1>
              <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
                Your personal cloud drive
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                autoFocus
                disabled={state === 'loading' || state === 'success'}
              />

              <div>
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  disabled={state === 'loading' || state === 'success'}
                  iconRight={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  }
                />
                {errorMessage && (
                  <p className="mt-2 text-sm text-red-500 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    {errorMessage}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full"
                loading={state === 'loading'}
                disabled={state === 'success'}
              >
                {state === 'success' ? 'Success!' : 'Sign In'}
              </Button>
            </form>

            {/* Connection Status */}
            <div className="mt-6 pt-6 border-t border-surface-200 dark:border-surface-700">
              <div className="flex items-center justify-center gap-2 text-xs text-surface-500 dark:text-surface-400">
                {piStatus === 'checking' && (
                  <>
                    <div className="w-2 h-2 bg-surface-400 rounded-full animate-pulse" />
                    <span>Connecting...</span>
                  </>
                )}
                {piStatus === 'connected' && (
                  <>
                    <Wifi className="w-3.5 h-3.5 text-green-500" />
                    <span>Connected to</span>
                    <span className="font-medium text-surface-700 dark:text-surface-300">
                      {piInfo.name}
                    </span>
                    <span className="text-surface-400">·</span>
                    <span className="font-mono">{piInfo.ip}</span>
                  </>
                )}
                {piStatus === 'disconnected' && (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-red-600 dark:text-red-400">
                      Cannot connect to PocketCloud device
                    </span>
                  </>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* 2FA Step */}
            <div className="animate-slide-in-right">
              <button
                onClick={handleBackToLogin}
                className="mb-6 flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to login
              </button>

              <div className="flex flex-col items-center mb-8">
                <div className="w-16 h-16 bg-brand-100 dark:bg-brand-900/30 rounded-2xl flex items-center justify-center mb-4">
                  <Cloud className="w-10 h-10 text-brand-500" />
                </div>
                <h2 className="text-xl font-bold text-surface-900 dark:text-surface-100">
                  Two-factor authentication
                </h2>
                <p className="text-sm text-surface-500 dark:text-surface-400 mt-2 text-center">
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>

              {/* TOTP Input */}
              <div className="flex gap-2 justify-center mb-6">
                {totpCode.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (totpInputsRef.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleTotpChange(index, e.target.value)}
                    onKeyDown={(e) => handleTotpKeyDown(index, e)}
                    disabled={totpState === 'loading' || totpState === 'success'}
                    className={cn(
                      'w-12 h-14 text-center text-2xl font-semibold rounded-lg border-2 transition-all',
                      'bg-white dark:bg-surface-800',
                      'border-surface-200 dark:border-surface-700',
                      'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none',
                      digit && 'border-brand-500 dark:border-brand-500',
                      totpState === 'error' && 'border-red-400 dark:border-red-500'
                    )}
                  />
                ))}
              </div>

              {errorMessage && (
                <p className="mb-4 text-sm text-red-500 text-center flex items-center justify-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  {errorMessage}
                </p>
              )}

              <button
                type="button"
                className="w-full text-sm text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100 transition-colors"
              >
                Use a backup code instead
              </button>
            </div>
          </>
        )}
      </Card>

      {/* Custom shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
          20%, 40%, 60%, 80% { transform: translateX(8px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
        @keyframes slide-in-right {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
