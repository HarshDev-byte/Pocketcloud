import { Share2 } from 'lucide-react';
import { EmptyState } from '../components/ui';

export default function SharedPage() {
  return (
    <div className="h-full flex flex-col p-6">
      <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-6">
        Shared Links
      </h1>

      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          icon={<Share2 className="w-12 h-12" />}
          title="No shared links"
          description="Files you share will appear here"
        />
      </div>
    </div>
  );
}