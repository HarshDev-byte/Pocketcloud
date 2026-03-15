import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Files, 
  Clock, 
  Share2, 
  User, 
  Plus,
  Upload
} from 'lucide-react';
import { useSpring, animated } from '@react-spring/web';

interface MobileNavProps {
  uploadCount?: number;
  onUploadClick?: () => void;
  className?: string;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  badge?: number;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  uploadCount = 0,
  onUploadClick,
  className = ''
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('files');

  const navItems: NavItem[] = [
    {
      id: 'files',
      label: 'Files',
      icon: Files,
      path: '/files',
      badge: uploadCount > 0 ? uploadCount : undefined
    },
    {
      id: 'recent',
      label: 'Recent',
      icon: Clock,
      path: '/files?view=recent'
    },
    {
      id: 'shared',
      label: 'Shared',
      icon: Share2,
      path: '/shared'
    },
    {
      id: 'profile',
      label: 'Profile',
      icon: User,
      path: '/settings'
    }
  ];

  // Update active tab based on current location
  useEffect(() => {
    const currentPath = location.pathname;
    const currentItem = navItems.find(item => 
      currentPath === item.path || 
      (item.id === 'files' && currentPath.startsWith('/files'))
    );
    
    if (currentItem) {
      setActiveTab(currentItem.id);
    }
  }, [location.pathname]);

  // Animated indicator
  const [indicatorSpring, indicatorApi] = useSpring(() => ({
    x: 0,
    config: { tension: 300, friction: 30 }
  }));

  // Update indicator position when active tab changes
  useEffect(() => {
    const activeIndex = navItems.findIndex(item => item.id === activeTab);
    const tabWidth = 100 / navItems.length;
    const indicatorX = (activeIndex * tabWidth) + (tabWidth / 2) - 2; // 2% for half indicator width
    
    indicatorApi.start({ x: indicatorX });
  }, [activeTab, indicatorApi]);

  // FAB animation
  const [fabSpring, fabApi] = useSpring(() => ({
    scale: 1,
    rotate: 0,
    config: { tension: 300, friction: 20 }
  }));

  const handleTabClick = (item: NavItem) => {
    setActiveTab(item.id);
    navigate(item.path);
    
    // Haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate(25);
    }
  };

  const handleFabClick = () => {
    // Animate FAB
    fabApi.start({
      scale: 0.9,
      rotate: 45,
      config: { tension: 400, friction: 20 }
    }).then(() => {
      fabApi.start({
        scale: 1,
        rotate: 0
      });
    });

    // Haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }

    onUploadClick?.();
  };

  return (
    <div className={`relative ${className}`}>
      {/* Upload FAB */}
      <animated.button
        style={fabSpring}
        onClick={handleFabClick}
        className="absolute -top-6 left-1/2 transform -translate-x-1/2 z-10 w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
        aria-label="Upload files"
      >
        <Plus className="w-6 h-6" />
      </animated.button>

      {/* Navigation Bar */}
      <nav className="relative bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-bottom">
        {/* Animated Indicator */}
        <animated.div
          style={{
            transform: indicatorSpring.x.to(x => `translateX(${x}%)`),
          }}
          className="absolute top-0 w-4 h-0.5 bg-blue-600 rounded-full transition-transform duration-300"
        />

        {/* Navigation Items */}
        <div className="flex items-center justify-around py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item)}
                className={`relative flex flex-col items-center justify-center py-2 px-3 min-w-0 flex-1 transition-colors ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
                aria-label={item.label}
              >
                <div className="relative">
                  <Icon 
                    className={`w-6 h-6 transition-transform ${
                      isActive ? 'scale-110' : 'scale-100'
                    }`} 
                  />
                  
                  {/* Badge */}
                  {item.badge && (
                    <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] bg-red-500 text-white text-xs rounded-full flex items-center justify-center px-1">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
                
                <span className={`text-xs mt-1 transition-all ${
                  isActive 
                    ? 'font-medium opacity-100' 
                    : 'font-normal opacity-75'
                }`}>
                  {item.label}
                </span>

                {/* Active indicator dot */}
                {isActive && (
                  <div className="absolute -top-1 w-1 h-1 bg-blue-600 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

// Hook for managing mobile navigation state
export function useMobileNav() {
  const [uploadCount, setUploadCount] = useState(0);
  const [isUploadSheetOpen, setIsUploadSheetOpen] = useState(false);

  const incrementUploadCount = () => {
    setUploadCount(prev => prev + 1);
  };

  const decrementUploadCount = () => {
    setUploadCount(prev => Math.max(0, prev - 1));
  };

  const resetUploadCount = () => {
    setUploadCount(0);
  };

  const openUploadSheet = () => {
    setIsUploadSheetOpen(true);
  };

  const closeUploadSheet = () => {
    setIsUploadSheetOpen(false);
  };

  return {
    uploadCount,
    isUploadSheetOpen,
    incrementUploadCount,
    decrementUploadCount,
    resetUploadCount,
    openUploadSheet,
    closeUploadSheet
  };
}

// Safe area utility component
export const SafeAreaBottom: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="pb-safe-bottom">
      {children}
    </div>
  );
};

export default MobileNav;