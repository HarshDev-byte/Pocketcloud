import { ReactNode, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { SearchModal } from '../search/SearchModal';
import { useUIStore } from '@/store/ui.store';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { sidebarOpen, toggleSidebar, searchOpen, setSearchOpen } = useUIStore();
  
  // Initialize WebSocket connection
  useRealtimeSync();

  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K for search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }

      // Cmd+\ or Ctrl+\ for sidebar toggle
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        toggleSidebar();
      }
    };

    document.addEventListener('keydown', handleKeyboard);
    return () => document.removeEventListener('keydown', handleKeyboard);
  }, [setSearchOpen, toggleSidebar]);

  const handleFileSelect = (fileId: string) => {
    // Navigate to file viewer
    window.location.href = `/files?file=${fileId}`;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-surface-0 dark:bg-surface-900">
      {/* Sidebar */}
      {sidebarOpen && <Sidebar />}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-auto">
          <div className="max-w-[var(--content-max)] mx-auto p-6">{children}</div>
        </main>
      </div>

      {/* Search Modal */}
      <SearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onFileSelect={handleFileSelect}
      />
    </div>
  );
}
