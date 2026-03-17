import { NavLink } from 'react-router-dom';
import {
  Folder,
  Clock,
  Star,
  Users,
  Image,
  Trash2,
  Shield,
  Code,
  Settings,
  Cloud,
  LogOut,
  User,
  Moon,
  Sun,
  Monitor,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/auth.store';
import { useThemeStore } from '@/store/theme.store';
import { useUIStore } from '@/store/ui.store';
import { Avatar, Badge, Progress, Dropdown, DropdownItem, DropdownDivider } from '../ui';

export function Sidebar() {
  const { user, clearUser } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const { sidebarCollapsed } = useUIStore();

  const isAdmin = user?.role === 'admin';

  // Mock storage data (will be replaced with real data later)
  const storageUsed = 850;
  const storageTotal = 1000;
  const storagePercent = (storageUsed / storageTotal) * 100;

  const navItems = [
    { to: '/files', icon: Folder, label: 'My Files' },
    { to: '/recents', icon: Clock, label: 'Recents' },
    { to: '/favorites', icon: Star, label: 'Favorites' },
    { to: '/shared', icon: Users, label: 'Shared with me' },
    { to: '/photos', icon: Image, label: 'Photos' },
  ];

  const bottomNavItems = [
    { to: '/trash', icon: Trash2, label: 'Trash', badge: 0 },
  ];

  const adminNavItems = isAdmin
    ? [
        { to: '/admin', icon: Shield, label: 'Admin' },
        { to: '/developer', icon: Code, label: 'Developer' },
      ]
    : [];

  const settingsNavItems = [{ to: '/settings', icon: Settings, label: 'Settings' }];

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      clearUser();
      window.location.href = '/login';
    }
  };

  const themeOptions = [
    { value: 'light' as const, icon: Sun, label: 'Light' },
    { value: 'dark' as const, icon: Moon, label: 'Dark' },
    { value: 'system' as const, icon: Monitor, label: 'System' },
  ];

  if (sidebarCollapsed) {
    return (
      <aside className="w-sidebar-collapsed h-screen bg-surface-50 dark:bg-surface-850 border-r border-surface-200 dark:border-surface-700 flex flex-col">
        {/* Logo */}
        <div className="h-14 flex items-center justify-center border-b border-surface-200 dark:border-surface-700">
          <Cloud className="w-6 h-6 text-brand-500" />
        </div>

        {/* Nav Icons */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-center h-10 rounded-md transition-colors',
                  isActive
                    ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300'
                    : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'
                )
              }
              title={item.label}
            >
              <item.icon className="w-5 h-5" />
            </NavLink>
          ))}
        </nav>

        {/* Bottom Icons */}
        <div className="p-2 space-y-1 border-t border-surface-200 dark:border-surface-700">
          {bottomNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-center h-10 rounded-md transition-colors relative',
                  isActive
                    ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300'
                    : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'
                )
              }
              title={item.label}
            >
              <item.icon className="w-5 h-5" />
              {item.badge > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </NavLink>
          ))}
          {adminNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-center h-10 rounded-md transition-colors',
                  isActive
                    ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300'
                    : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'
                )
              }
              title={item.label}
            >
              <item.icon className="w-5 h-5" />
            </NavLink>
          ))}
          {settingsNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-center h-10 rounded-md transition-colors',
                  isActive
                    ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300'
                    : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'
                )
              }
              title={item.label}
            >
              <item.icon className="w-5 h-5" />
            </NavLink>
          ))}
        </div>

        {/* User Avatar */}
        <div className="p-2 border-t border-surface-200 dark:border-surface-700">
          <Dropdown
            trigger={
              <button className="w-full flex items-center justify-center h-10 rounded-md hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors">
                <Avatar fallback={user?.username || 'U'} size="sm" />
              </button>
            }
            align="right"
          >
            <DropdownItem icon={<User className="w-4 h-4" />}>Profile</DropdownItem>
            <DropdownDivider />
            {themeOptions.map((opt) => (
              <DropdownItem
                key={opt.value}
                icon={<opt.icon className="w-4 h-4" />}
                onClick={() => setTheme(opt.value)}
              >
                {opt.label} {theme === opt.value && '✓'}
              </DropdownItem>
            ))}
            <DropdownDivider />
            <DropdownItem icon={<LogOut className="w-4 h-4" />} onClick={handleLogout} danger>
              Sign out
            </DropdownItem>
          </Dropdown>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-sidebar h-screen bg-surface-50 dark:bg-surface-850 border-r border-surface-200 dark:border-surface-700 flex flex-col">
      {/* Logo */}
      <div className="h-14 px-4 flex items-center gap-2 border-b border-surface-200 dark:border-surface-700">
        <Cloud className="w-6 h-6 text-brand-500" />
        <span className="font-semibold text-lg text-surface-900 dark:text-surface-100">
          PocketCloud
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} className="nav-item">
            {({ isActive }) => (
              <>
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span className={cn('flex-1', isActive && 'font-semibold')}>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom Navigation */}
      <div className="p-3 space-y-1 border-t border-surface-200 dark:border-surface-700">
        {bottomNavItems.map((item) => (
          <NavLink key={item.to} to={item.to} className="nav-item">
            {({ isActive }) => (
              <>
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span className={cn('flex-1', isActive && 'font-semibold')}>{item.label}</span>
                {item.badge > 0 && <Badge variant="default">{item.badge}</Badge>}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Admin/Settings */}
      {(adminNavItems.length > 0 || settingsNavItems.length > 0) && (
        <div className="p-3 space-y-1 border-t border-surface-200 dark:border-surface-700">
          {adminNavItems.map((item) => (
            <NavLink key={item.to} to={item.to} className="nav-item">
              {({ isActive }) => (
                <>
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span className={cn('flex-1', isActive && 'font-semibold')}>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
          {settingsNavItems.map((item) => (
            <NavLink key={item.to} to={item.to} className="nav-item">
              {({ isActive }) => (
                <>
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span className={cn('flex-1', isActive && 'font-semibold')}>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      )}

      {/* Storage Meter */}
      <div className="p-4 border-t border-surface-200 dark:border-surface-700">
        <button className="w-full text-left hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg p-2 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <Cloud className="w-4 h-4 text-surface-500" />
            <span className="text-xs font-medium text-surface-600 dark:text-surface-400">
              {storageUsed} GB / {storageTotal} GB
            </span>
          </div>
          <Progress
            value={storagePercent}
            variant={storagePercent > 90 ? 'danger' : storagePercent > 75 ? 'warning' : 'default'}
          />
        </button>
      </div>

      {/* User Menu */}
      <div className="p-3 border-t border-surface-200 dark:border-surface-700">
        <Dropdown
          trigger={
            <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors">
              <Avatar fallback={user?.username || 'U'} size="sm" />
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">
                  {user?.username}
                </p>
                <p className="text-xs text-surface-500 dark:text-surface-400 capitalize">
                  {user?.role}
                </p>
              </div>
            </button>
          }
          align="right"
        >
          <DropdownItem icon={<User className="w-4 h-4" />}>Profile</DropdownItem>
          <DropdownDivider />
          {themeOptions.map((opt) => (
            <DropdownItem
              key={opt.value}
              icon={<opt.icon className="w-4 h-4" />}
              onClick={() => setTheme(opt.value)}
            >
              {opt.label} {theme === opt.value && '✓'}
            </DropdownItem>
          ))}
          <DropdownDivider />
          <DropdownItem icon={<LogOut className="w-4 h-4" />} onClick={handleLogout} danger>
            Sign out
          </DropdownItem>
        </Dropdown>
      </div>
    </aside>
  );
}
