import { Search, Upload, Bell, Wifi } from 'lucide-react';
import { Button } from '../ui';
import { useUIStore } from '@/store/ui.store';

export function Topbar() {
  const { setSearchOpen, setUploadPanelOpen } = useUIStore();

  return (
    <header className="h-14 border-b border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 flex items-center justify-between px-4 gap-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-surface-900 dark:text-surface-100 font-medium">My Files</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          icon={<Search className="w-4 h-4" />}
          onClick={() => setSearchOpen(true)}
        >
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden lg:inline-flex items-center gap-1 px-1.5 py-0.5 text-2xs font-mono bg-surface-100 dark:bg-surface-700 rounded">
            ⌘K
          </kbd>
        </Button>

        <Button
          variant="primary"
          size="sm"
          icon={<Upload className="w-4 h-4" />}
          onClick={() => setUploadPanelOpen(true)}
        >
          <span className="hidden sm:inline">Upload</span>
        </Button>

        <div className="flex items-center gap-1 ml-2">
          <Button variant="ghost" size="sm" icon={<Wifi className="w-4 h-4 text-green-500" />} />
          <Button variant="ghost" size="sm" icon={<Bell className="w-4 h-4" />} />
        </div>
      </div>
    </header>
  );
}
