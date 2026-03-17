import { Shield } from 'lucide-react';
import { EmptyState } from '../components/ui';

export default function AdminPage() {
  return (
    <div className="h-full flex flex-col p-6">
      <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-6">
        Admin Panel
      </h1>

      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          icon={<Shield className="w-12 h-12" />}
          title="Admin panel coming soon"
          description="System administration and user management tools will be available here"
        />
      </div>
    </div>
  );
}