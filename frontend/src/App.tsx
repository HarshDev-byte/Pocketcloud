import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AppRouter } from './router';
import { Toaster } from './components/ui';
import { useAuthStore } from './store/auth.store';
import { useThemeStore } from './store/theme.store';
import { Spinner } from './components/ui';
import { apiGet } from './lib/api';

export default function App() {
  const { checkAuth, isLoading } = useAuthStore();
  const { setTheme, theme } = useThemeStore();
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    checkAuth();
    setTheme(theme); // Apply saved theme
    checkSetupStatus();
  }, []);

  const checkSetupStatus = async () => {
    try {
      const health = await apiGet<any>('/api/health');
      setSetupComplete(health.setupComplete !== false);
      
      // Redirect to setup if not complete and not already there
      if (health.setupComplete === false && location.pathname !== '/setup') {
        navigate('/setup');
      }
    } catch (error) {
      // If health check fails, assume setup is needed
      setSetupComplete(false);
      if (location.pathname !== '/setup') {
        navigate('/setup');
      }
    }
  };

  if (isLoading || setupComplete === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface-0 dark:bg-surface-900">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <>
      <AppRouter />
      <Toaster />
    </>
  );
}
