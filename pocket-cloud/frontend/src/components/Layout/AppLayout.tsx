import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Files, 
  Share2, 
  Trash2, 
  Settings, 
  Menu, 
  X, 
  Sun, 
  Moon, 
  Monitor,
  LogOut,
  HardDrive,
  Code,
  Webhook
} from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { useThemeStore } from '../../store/theme.store';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
import { RealtimeIndicator } from '../RealtimeIndicator';
import { SearchBar } from '../SearchBar';
import { MobileNav, useMobileNav } from '../MobileNav';
import { InstallPrompt } from '../InstallPrompt';
import { MobileBottomSheet, useBottomSheet } from '../MobileBottomSheet';
import { OfflineIndicator } from '../OfflineIndicator';

const AppLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { theme, setTheme, getEffectiveTheme } = useThemeStore();
  const { connectionStatus } = useRealtimeSync();
  
  // Mobile navigation state
  const mobileNav = useMobileNav();
  const uploadSheet = useBottomSheet();

  // Handle window resize for mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K (Mac) or Ctrl+K (Win/Linux) to open search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navigation = [
    { name: 'My Files', href: '/files', icon: Files },
    { name: 'Shared', href: '/shared', icon: Share2 },
    { name: 'Trash', href: '/trash', icon: Trash2 },
    { name: 'Developer', href: '/developer', icon: Code },
    { name: 'Webhooks', href: '/webhooks', icon: Webhook },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleUploadClick = () => {
    uploadSheet.open();
  };

  const toggleTheme = () => {
    const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextTheme = themes[(currentIndex + 1) % themes.length];
    setTheme(nextTheme);
  };

  const getThemeIcon = () => {
    if (theme === 'system') return Monitor;
    return getEffectiveTheme() === 'dark' ? Moon : Sun;
  };

  const ThemeIcon = getThemeIcon();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Offline Indicator */}
      <OfflineIndicator />

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black bg-opacity-50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ease-in-out
        md:translate-x-0 md:static md:inset-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-2">
              <HardDrive className="w-8 h-8 text-pcd-blue-600" />
              <span className="text-xl font-semibold text-gray-900 dark:text-white">
                Pocket Cloud
              </span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-1">
            {/* Search button */}
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors min-h-touch text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search
              <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">⌘K</span>
            </button>
            
            {navigation.map((item) => {
              const isActive = location.pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors min-h-touch
                    ${isActive
                      ? 'bg-pcd-blue-100 text-pcd-blue-700 dark:bg-pcd-blue-900 dark:text-pcd-blue-200'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    }
                  `}
                >
                  <item.icon className="w-5 h-5 mr-3" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Storage meter */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Storage</div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
              <div className="bg-pcd-blue-600 h-2 rounded-full" style={{ width: '45%' }}></div>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              4.5 GB of 10 GB used
            </div>
          </div>

          {/* User menu */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-pcd-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-white">
                    {user?.username.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {user?.username}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                    {user?.role}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-1">
                <RealtimeIndicator connectionStatus={connectionStatus} />
                <button
                  onClick={toggleTheme}
                  className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 min-w-touch min-h-touch"
                  title={`Theme: ${theme}`}
                >
                  <ThemeIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400 min-w-touch min-h-touch"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="md:pl-64">
        {/* Mobile header */}
        <div className="md:hidden flex items-center justify-between h-16 px-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 min-w-touch min-h-touch"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center space-x-2">
            <HardDrive className="w-6 h-6 text-pcd-blue-600" />
            <span className="text-lg font-semibold text-gray-900 dark:text-white">
              Pocket Cloud
            </span>
          </div>
          <RealtimeIndicator connectionStatus={connectionStatus} />
        </div>

        {/* Page content */}
        <main className="flex-1">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom navigation */}
      {isMobile ? (
        <MobileNav
          uploadCount={mobileNav.uploadCount}
          onUploadClick={handleUploadClick}
          className="safe-area-bottom"
        />
      ) : (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          <div className="flex">
            {navigation.slice(0, 4).map((item) => {
              const isActive = location.pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`
                    flex-1 flex flex-col items-center justify-center py-2 min-h-touch
                    ${isActive
                      ? 'text-pcd-blue-600 dark:text-pcd-blue-400'
                      : 'text-gray-500 dark:text-gray-400'
                    }
                  `}
                >
                  <item.icon className="w-5 h-5 mb-1" />
                  <span className="text-xs">{item.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* PWA Install Prompt */}
      <InstallPrompt />

      {/* Search Bar */}
      <SearchBar 
        isOpen={searchOpen} 
        onClose={() => setSearchOpen(false)} 
      />

      {/* Mobile Upload Bottom Sheet */}
      <MobileBottomSheet
        isOpen={uploadSheet.isOpen}
        onClose={uploadSheet.close}
        title="Upload Files"
        snapPoints={[40, 80]}
      >
        <div className="p-4">
          <div className="space-y-4">
            <button className="w-full p-4 text-left border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
              <div className="font-medium">Choose Files</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Select files from your device</div>
            </button>
            <button className="w-full p-4 text-left border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
              <div className="font-medium">Take Photo</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Capture with camera</div>
            </button>
            <button className="w-full p-4 text-left border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
              <div className="font-medium">Create Folder</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">New folder in current location</div>
            </button>
          </div>
        </div>
      </MobileBottomSheet>
    </div>
  );
};

export default AppLayout;