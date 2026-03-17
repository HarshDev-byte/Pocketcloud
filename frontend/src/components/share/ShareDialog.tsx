import { useState } from 'react';
import { Link, Copy, QrCode, Eye, Trash2, Check } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal, Button, Input, Checkbox } from '../ui';
import { api } from '../../lib/api';
import { toast } from '../ui';

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
}

interface ShareLink {
  id: string;
  token: string;
  expires_at: number | null;
  max_downloads: number | null;
  download_count: number;
  has_password: boolean;
  created_at: number;
}

export function ShareDialog({ isOpen, onClose, fileId, fileName }: ShareDialogProps) {
  const [activeTab, setActiveTab] = useState<'create' | 'manage'>('create');
  const [expiry, setExpiry] = useState('24h');
  const [hasPassword, setHasPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [hasDownloadLimit, setHasDownloadLimit] = useState(false);
  const [downloadLimit, setDownloadLimit] = useState(10);
  const [showQR, setShowQR] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data: existingShares } = useQuery({
    queryKey: ['shares', fileId],
    queryFn: async () => {
      const response = await api.get(`/api/files/${fileId}/shares`);
      return response.data.shares as ShareLink[];
    },
    enabled: isOpen,
  });

  const createShareMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        expires_in: expiry === 'never' ? null : expiry,
      };

      if (hasPassword) {
        payload.password = password;
      }

      if (hasDownloadLimit) {
        payload.max_downloads = downloadLimit;
      }

      const response = await api.post(`/api/files/${fileId}/share`, payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shares', fileId] });
      setActiveTab('manage');
      toast.success('Share link created');
    },
    onError: () => {
      toast.error('Failed to create share link');
    },
  });

  const revokeShareMutation = useMutation({
    mutationFn: async (shareId: string) => {
      await api.delete(`/api/shares/${shareId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shares', fileId] });
      toast.success('Share link revoked');
    },
    onError: () => {
      toast.error('Failed to revoke share link');
    },
  });

  const handleCopyLink = (token: string) => {
    const url = `${window.location.origin}/s/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
    toast.success('Link copied to clipboard');
  };

  const formatExpiry = (expiresAt: number | null): string => {
    if (!expiresAt) return 'Never expires';
    
    const now = Date.now();
    const diff = expiresAt - now;
    
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `Expires in ${days}d`;
    return `Expires in ${hours}h`;
  };

  const getQRCodeUrl = (token: string): string => {
    const url = `${window.location.origin}/s/${token}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
  };

  return (
    <Modal open={isOpen} onClose={onClose} title={`Share: ${fileName}`} size="md">
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex border-b border-surface-200 dark:border-surface-700">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'create'
                ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100'
            }`}
          >
            Create Link
          </button>
          {existingShares && existingShares.length > 0 && (
            <button
              onClick={() => setActiveTab('manage')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'manage'
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100'
              }`}
            >
              Manage ({existingShares.length})
            </button>
          )}
        </div>

        {activeTab === 'create' ? (
          <div className="space-y-4">
            {/* Expiry */}
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
                Expiry
              </label>
              <select
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="w-full px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="1h">1 hour</option>
                <option value="24h">24 hours</option>
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
                <option value="never">Never</option>
              </select>
            </div>

            {/* Password */}
            <div>
              <Checkbox
                checked={hasPassword}
                onChange={(e) => setHasPassword(e.target.checked)}
                label="Add password protection"
              />
              {hasPassword && (
                <div className="mt-2">
                  <Input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Download limit */}
            <div>
              <Checkbox
                checked={hasDownloadLimit}
                onChange={(e) => setHasDownloadLimit(e.target.checked)}
                label="Limit downloads"
              />
              {hasDownloadLimit && (
                <div className="mt-2">
                  <Input
                    type="number"
                    placeholder="Max downloads"
                    value={downloadLimit}
                    onChange={(e) => setDownloadLimit(parseInt(e.target.value) || 1)}
                    min={1}
                    max={1000}
                  />
                </div>
              )}
            </div>

            {/* Create button */}
            <Button
              onClick={() => createShareMutation.mutate()}
              variant="primary"
              className="w-full"
              disabled={createShareMutation.isPending || (hasPassword && !password)}
            >
              <Link className="w-4 h-4" />
              Create Share Link
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {existingShares?.map((share) => (
              <div
                key={share.id}
                className="p-4 border border-surface-200 dark:border-surface-700 rounded-lg"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm bg-surface-100 dark:bg-surface-800 p-2 rounded border break-all">
                      {window.location.origin}/s/{share.token}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-3">
                    <Button
                      onClick={() => handleCopyLink(share.token)}
                      variant="secondary"
                      size="sm"
                    >
                      {copiedToken === share.token ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      onClick={() => setShowQR(showQR === share.token ? null : share.token)}
                      variant="secondary"
                      size="sm"
                    >
                      <QrCode className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => revokeShareMutation.mutate(share.id)}
                      variant="danger"
                      size="sm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm text-surface-600 dark:text-surface-400">
                  <span>{formatExpiry(share.expires_at)}</span>
                  <span>
                    {share.download_count}
                    {share.max_downloads ? `/${share.max_downloads}` : '/∞'} downloads
                  </span>
                  {share.has_password && (
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      Password protected
                    </span>
                  )}
                </div>

                {showQR === share.token && (
                  <div className="mt-3 flex justify-center">
                    <img
                      src={getQRCodeUrl(share.token)}
                      alt="QR Code"
                      className="border border-surface-200 dark:border-surface-700 rounded"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Network warning */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            ⚠️ This link only works on this WiFi network
          </p>
        </div>
      </div>
    </Modal>
  );
}