import { X, Download, RotateCcw, Clock } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../ui';
import { api } from '../../lib/api';
import { toast } from '../ui';
import { formatFileSize } from '../../lib/fileTypes';

interface VersionHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
}

interface FileVersion {
  id: string;
  version: number;
  size: number;
  created_at: number;
  is_current: boolean;
  comment?: string;
}

export function VersionHistoryPanel({ isOpen, onClose, fileId, fileName }: VersionHistoryPanelProps) {
  const queryClient = useQueryClient();

  const { data: versions, isLoading } = useQuery({
    queryKey: ['file-versions', fileId],
    queryFn: async () => {
      const response = await api.get(`/api/files/${fileId}/versions`);
      return response.data.versions as FileVersion[];
    },
    enabled: isOpen && !!fileId,
  });

  const restoreVersionMutation = useMutation({
    mutationFn: async (versionId: string) => {
      await api.post(`/api/files/${fileId}/versions/${versionId}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-versions', fileId] });
      queryClient.invalidateQueries({ queryKey: ['folder'] });
      toast.success('Version restored successfully');
    },
    onError: () => {
      toast.error('Failed to restore version');
    },
  });

  const downloadVersion = async (versionId: string, version: number) => {
    try {
      const response = await api.get(`/api/files/${fileId}/versions/${versionId}/download`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName} (v${version})`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Failed to download version');
    }
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Today ${date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      })}`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
  };

  const getTotalSize = (): number => {
    return versions?.reduce((total, version) => total + version.size, 0) || 0;
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-surface-800 border-l border-surface-200 dark:border-surface-700 shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-200 dark:border-surface-700">
          <div>
            <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
              Version History
            </h2>
            <p className="text-sm text-surface-600 dark:text-surface-400 truncate">
              {fileName}
            </p>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            size="sm"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-surface-600 dark:text-surface-400">Loading versions...</div>
            </div>
          ) : versions && versions.length > 0 ? (
            <div className="p-4 space-y-4">
              {versions.map((version, index) => (
                <div
                  key={version.id}
                  className="relative pl-8 pb-4"
                >
                  {/* Timeline line */}
                  {index < versions.length - 1 && (
                    <div className="absolute left-3 top-6 bottom-0 w-px bg-surface-200 dark:bg-surface-700" />
                  )}

                  {/* Timeline dot */}
                  <div className={`absolute left-1 top-2 w-4 h-4 rounded-full border-2 ${
                    version.is_current
                      ? 'bg-brand-500 border-brand-500'
                      : 'bg-white dark:bg-surface-800 border-surface-300 dark:border-surface-600'
                  }`} />

                  {/* Version info */}
                  <div className="bg-surface-50 dark:bg-surface-700 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-surface-900 dark:text-surface-100">
                          v{version.version}
                          {version.is_current && (
                            <span className="text-xs text-brand-600 dark:text-brand-400 ml-1">
                              (current)
                            </span>
                          )}
                        </span>
                        {version.version === 1 && (
                          <span className="text-xs text-surface-500">(original)</span>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          onClick={() => downloadVersion(version.id, version.version)}
                          variant="ghost"
                          size="sm"
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                        {!version.is_current && (
                          <Button
                            onClick={() => {
                              if (confirm(`Restore version ${version.version}? This will create a new version.`)) {
                                restoreVersionMutation.mutate(version.id);
                              }
                            }}
                            variant="ghost"
                            size="sm"
                            disabled={restoreVersionMutation.isPending}
                          >
                            <RotateCcw className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="text-sm text-surface-600 dark:text-surface-400 space-y-1">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        {formatDate(version.created_at)}
                      </div>
                      <div>{formatFileSize(version.size)}</div>
                      {version.comment && (
                        <div className="italic">{version.comment}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <div className="text-center">
                <Clock className="w-8 h-8 text-surface-400 mx-auto mb-2" />
                <p className="text-surface-600 dark:text-surface-400">No version history</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {versions && versions.length > 0 && (
          <div className="p-4 border-t border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900">
            <div className="text-sm text-surface-600 dark:text-surface-400 text-center">
              {versions.length} version{versions.length > 1 ? 's' : ''} · {formatFileSize(getTotalSize())} total storage
            </div>
          </div>
        )}
      </div>
    </>
  );
}