import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, Lock, Folder, AlertCircle } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button, Input } from '../components/ui';
import { api } from '../lib/api';
import { formatFileSize, getFileTypeInfo } from '../lib/fileTypes';

interface ShareData {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  mime_type?: string;
  expires_at: number | null;
  max_downloads: number | null;
  download_count: number;
  has_password: boolean;
  files?: Array<{
    id: string;
    name: string;
    size: number;
    mime_type: string;
  }>;
}

export default function SharePublicPage() {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const { data: shareData, isLoading, error } = useQuery({
    queryKey: ['public-share', token],
    queryFn: async () => {
      const response = await api.get(`/api/s/${token}`);
      return response.data as ShareData;
    },
    enabled: !!token,
    retry: false,
  });

  const authenticateMutation = useMutation({
    mutationFn: async (password: string) => {
      const response = await api.post(`/api/s/${token}/auth`, { password });
      return response.data;
    },
    onSuccess: () => {
      setIsAuthenticated(true);
    },
    onError: () => {
      alert('Incorrect password');
    },
  });

  const downloadMutation = useMutation<void, Error, string | undefined>({
    mutationFn: async (fileId?: string) => {
      const url = fileId 
        ? `/api/s/${token}/download/${fileId}`
        : `/api/s/${token}/download`;
      
      const response = await api.get(url, { responseType: 'blob' });
      
      // Create download link
      const blob = new Blob([response.data]);
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileId 
        ? shareData?.files?.find(f => f.id === fileId)?.name || 'file'
        : shareData?.name || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    },
  });

  const formatExpiry = (expiresAt: number | null): string => {
    if (!expiresAt) return '';
    
    const now = Date.now();
    const diff = expiresAt - now;
    
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `Expires in ${days} day${days > 1 ? 's' : ''}`;
    return `Expires in ${hours} hour${hours > 1 ? 's' : ''}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-50 dark:bg-surface-900 flex items-center justify-center">
        <div className="text-surface-600 dark:text-surface-400">Loading...</div>
      </div>
    );
  }

  if (error || !shareData) {
    return (
      <div className="min-h-screen bg-surface-50 dark:bg-surface-900 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-surface-900 dark:text-surface-100 mb-2">
            Share not found
          </h1>
          <p className="text-surface-600 dark:text-surface-400">
            This share link may have expired or been revoked.
          </p>
        </div>
      </div>
    );
  }

  const needsPassword = shareData.has_password && !isAuthenticated;
  const isExpired = shareData.expires_at && shareData.expires_at < Date.now();
  const isDownloadLimitReached = shareData.max_downloads && 
    shareData.download_count >= shareData.max_downloads;

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900">
      <div className="max-w-2xl mx-auto py-12 px-6">
        <div className="bg-white dark:bg-surface-800 rounded-xl shadow-lg border border-surface-200 dark:border-surface-700 overflow-hidden">
          {/* Header */}
          <div className="p-8 text-center border-b border-surface-200 dark:border-surface-700">
            <div className="w-16 h-16 mx-auto mb-4 bg-brand-100 dark:bg-brand-900/20 rounded-full flex items-center justify-center">
              {shareData.type === 'folder' ? (
                <Folder className="w-8 h-8 text-brand-600 dark:text-brand-400" />
              ) : (
                (() => {
                  const fileInfo = getFileTypeInfo(shareData.mime_type || '', shareData.name);
                  const IconComponent = fileInfo.icon;
                  return <IconComponent className={`w-8 h-8 ${fileInfo.color}`} />;
                })()
              )}
            </div>
            
            <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-2">
              {shareData.name}
            </h1>
            
            <div className="flex items-center justify-center gap-4 text-sm text-surface-600 dark:text-surface-400">
              {shareData.size && (
                <span>{formatFileSize(shareData.size)}</span>
              )}
              <span>Shared via PocketCloud</span>
            </div>

            {/* Status indicators */}
            <div className="mt-4 space-y-2">
              {shareData.expires_at && (
                <div className={`text-sm ${isExpired ? 'text-red-600' : 'text-amber-600'}`}>
                  {formatExpiry(shareData.expires_at)}
                </div>
              )}
              
              {shareData.max_downloads && (
                <div className="text-sm text-surface-600 dark:text-surface-400">
                  {shareData.download_count} of {shareData.max_downloads} downloads used
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="p-8">
            {needsPassword ? (
              <div className="space-y-4">
                <div className="text-center">
                  <Lock className="w-8 h-8 text-surface-400 mx-auto mb-3" />
                  <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-2">
                    Password Required
                  </h2>
                  <p className="text-surface-600 dark:text-surface-400 mb-4">
                    This share is password protected
                  </p>
                </div>

                <Input
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && password) {
                      authenticateMutation.mutate(password);
                    }
                  }}
                />

                <Button
                  onClick={() => authenticateMutation.mutate(password)}
                  variant="primary"
                  className="w-full"
                  disabled={!password || authenticateMutation.isPending}
                >
                  Access File
                </Button>
              </div>
            ) : isExpired ? (
              <div className="text-center">
                <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
                <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-2">
                  Share Expired
                </h2>
                <p className="text-surface-600 dark:text-surface-400">
                  This share link has expired and is no longer available.
                </p>
              </div>
            ) : isDownloadLimitReached ? (
              <div className="text-center">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
                <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-2">
                  Download Limit Reached
                </h2>
                <p className="text-surface-600 dark:text-surface-400">
                  This share has reached its maximum number of downloads.
                </p>
              </div>
            ) : shareData.type === 'folder' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
                    Folder Contents
                  </h3>
                  <Button
                    onClick={() => downloadMutation.mutate(undefined)}
                    variant="primary"
                    disabled={downloadMutation.isPending}
                  >
                    <Download className="w-4 h-4" />
                    Download All as ZIP
                  </Button>
                </div>

                <div className="space-y-2">
                  {shareData.files?.map(file => {
                    const fileInfo = getFileTypeInfo(file.mime_type, file.name);
                    return (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-3 bg-surface-50 dark:bg-surface-700 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {(() => {
                            const IconComponent = fileInfo.icon;
                            return <IconComponent className={`w-5 h-5 ${fileInfo.color}`} />;
                          })()}
                          <div>
                            <div className="font-medium text-surface-900 dark:text-surface-100">
                              {file.name}
                            </div>
                            <div className="text-sm text-surface-600 dark:text-surface-400">
                              {formatFileSize(file.size)}
                            </div>
                          </div>
                        </div>
                        <Button
                          onClick={() => downloadMutation.mutate(file.id)}
                          variant="secondary"
                          size="sm"
                          disabled={downloadMutation.isPending}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center">
                <Button
                  onClick={() => downloadMutation.mutate(undefined)}
                  variant="primary"
                  size="lg"
                  className="w-full"
                  disabled={downloadMutation.isPending}
                >
                  <Download className="w-5 h-5" />
                  Download
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-sm text-surface-500">
            Powered by PocketCloud
          </p>
        </div>
      </div>
    </div>
  );
}