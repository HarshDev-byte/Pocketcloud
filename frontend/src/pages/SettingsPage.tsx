import { Settings } from 'lucide-react';
import { EmptyState } from '../components/ui';

export default function SettingsPage() {
  return (
    <div className="h-full flex flex-col p-6">
      <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-6">
        Settings
      </h1>

      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          icon={<Settings className="w-12 h-12" />}
          title="Settings coming soon"
          description="User preferences and configuration options will be available here"
        />
      </div>
    </div>
  );
}