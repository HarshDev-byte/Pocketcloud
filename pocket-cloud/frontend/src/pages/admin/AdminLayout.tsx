import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import { 
  BarChart3, 
  Users, 
  HardDrive, 
  FileText, 
  Settings, 
  Monitor,
  Menu,
  X,
  Cpu,
  MemoryStick,
  Clock,
  Download
} from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { apiClient } from '../../api/client';

interface SystemStats {
  cpu: { usage: number; temperature: number };
  memory: { total: number; used: number; usage: number };
  uptime: number;
}

const AdminLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const location = useLocation();
  const { user } = useAuthStore();

  // Redirect if not admin
  if (!user || user.role !== 'admin') {
    return <Navigate to="/files" replace />;
  }

  const navigation = [
    { name: 'Dashboard', href: '/admin', icon: BarChart3 },
    { name: 'Users', href: '/admin/users', icon: Users },
    { name: 'Storage', href: '/admin/storage', icon: HardDrive },
    { name: 'Updates', href: '/admin/updates', icon: Download },
    { name: 'Logs', href: '/admin/logs', icon: FileText },
    { name: 'System', href: '/admin/system', icon: Monitor },
    { name: 'Settings', href: '/admin/settings', icon: Settings },
  ];

  // Fetch system stats for sidebar
  useEffect(() => {
    const fetchSystemStats = async () => {
      try {
        const response = await apiClient.get('/admin/system');
        setSystemStats(response.data);
      } catch (error) {
        console.error('Failed to fetch system stats:', error);
      }
    };

    fetchSystemStats();
    const interval = setInterval(fetchSystemStats, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const getTempColor = (temp: number): string => {
    if (temp < 60) return 'text-green-500';
    if (temp < 75) return 'text-amber-500';
    return 'text-red-500';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ease-in-out
        lg:translate-x-0 lg:static lg:inset-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-2">
              <Monitor className="w-8 h-8 text-pcd-blue-600" />
              <span className="text-xl font-semibold text-gray-900 dark:text-white">
                Admin Panel
              </span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-1">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href || 
                (item.href === '/admin' && location.pathname === '/admin/dashboard');
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors
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

          {/* System Stats Footer */}
          {systemStats && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">
                System Status
              </div>
              
              <div className="space-y-2">
                {/* CPU */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Cpu className="w-3 h-3 text-gray-400" />
                    <span className="text-xs text-gray-600 dark:text-gray-400">CPU</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="text-xs font-medium">
                      {systemStats.cpu.usage.toFixed(1)}%
                    </span>
                    <span className={`text-xs font-medium ${getTempColor(systemStats.cpu.temperature)}`}>
                      {systemStats.cpu.temperature.toFixed(1)}°C
                    </span>
                  </div>
                </div>

                {/* Memory */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <MemoryStick className="w-3 h-3 text-gray-400" />
                    <span className="text-xs text-gray-600 dark:text-gray-400">RAM</span>
                  </div>
                  <span className="text-xs font-medium">
                    {formatBytes(systemStats.memory.used)} / {formatBytes(systemStats.memory.total)}
                  </span>
                </div>

                {/* Memory bar */}
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                  <div
                    className="bg-pcd-blue-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${systemStats.memory.usage}%` }}
                  />
                </div>

                {/* Uptime */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-3 h-3 text-gray-400" />
                    <span className="text-xs text-gray-600 dark:text-gray-400">Uptime</span>
                  </div>
                  <span className="text-xs font-medium">
                    {formatUptime(systemStats.uptime)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-between h-16 px-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center space-x-2">
            <Monitor className="w-6 h-6 text-pcd-blue-600" />
            <span className="text-lg font-semibold text-gray-900 dark:text-white">
              Admin Panel
            </span>
          </div>
          <div className="w-9" /> {/* Spacer */}
        </div>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;