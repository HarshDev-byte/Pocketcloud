import { useState, useEffect } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  Share2, 
  Clock, 
  Lock, 
  Download, 
  Trash2,
  Plus,
  Eye,
  EyeOff
} from 'lucide-react';
import { QRCodeDisplay } from './QRCodeDisplay';
import { apiClient } from '../api/client';

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fileId?: string;
  folderId?: string;
  fileName: string;
  isFolder: boolean;
}

interface Share {
  id: string;
  token: string;
  expires_at?: number;
  max_downloads?: number;
  download_count: number;
  created_at: number;
  password_hash?: string;
}

interface CreateShareData {
  expiresInHours?: number;
  password?: string;
  maxDownloads?: number;
}

export function ShareDialog({ isOpen, onClose, fileId, folderId, fileName, isFolder }: ShareDialogProps) {
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  
  // Create form state
  const [expiryOption, setExpiryOption] = useState<string>('never');
  const [customHours, setCustomHours] = useState<number>(24);
  const [password, setPassword] = useState<string>('');
  const [usePassword, setUsePassword] = useState<boolean>(false);
  const [maxDownloads, setMaxDownloads] = useState<number>(0);
  const [useMaxDownloads, setUseMaxDownloads] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      loadShares();
    }
  }, [isOpen, fileId, folderId]);

  const loadShares = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/shares');
      
      // Filter shares for this specific file/folder
      const filteredShares = response.data.shares.filter((share: any) => 
        (fileId && share.file_id === fileId) || (folderId && share.folder_id === folderId)
      );
      
      setShares(filteredShares);
    } catch (error) {
      console.error('Failed to load shares:', error);
    } finally {
      setLoading(false);
    }
  };

  const createShare = async () => {
    try {
      setLoading(true);
      
      const shareData: CreateShareData = {};
      
      // Set expiry
      if (expiryOption !== 'never') {
        const hours = expiryOption === 'custom' ? customHours : parseInt(expiryOption);
        shareData.expiresInHours = hours;
      }
      
      // Set password
      if (usePassword && password.trim()) {
        shareData.password = password.trim();
      }
      
      // Set max downloads
      if (useMaxDownloads && maxDownloads > 0) {
        shareData.maxDownloads = maxDownloads;
      }

      const response = await apiClient.post('/shares', {
        fileId,
        folderId,
        ...shareData
      });

      if (response.data.success) {
        await loadShares();
        setShowCreateForm(false);
        resetCreateForm();
        
        // Auto-copy the new share URL
        const shareUrl = response.data.shareUrl;
        await copyToClipboard(shareUrl);
      }
    } catch (error: any) {
      console.error('Failed to create share:', error);
      alert(error.response?.data?.error || 'Failed to create share');
    } finally {
      setLoading(false);
    }
  };

  const revokeShare = async (shareId: string) => {
    if (!confirm('Are you sure you want to revoke this share? The link will no longer work.')) {
      return;
    }

    try {
      await apiClient.delete(`/shares/${shareId}`);
      await loadShares();
    } catch (error) {
      console.error('Failed to revoke share:', error);
      alert('Failed to revoke share');
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUrl(text);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const resetCreateForm = () => {
    setExpiryOption('never');
    setCustomHours(24);
    setPassword('');
    setUsePassword(false);
    setMaxDownloads(0);
    setUseMaxDownloads(false);
    setShowPassword(false);
  };

  const formatExpiry = (expiresAt?: number) => {
    if (!expiresAt) return 'Never expires';
    
    const now = Date.now();
    const timeLeft = expiresAt - now;
    
    if (timeLeft <= 0) return 'Expired';
    
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `Expires in ${days}d ${hours}h`;
    if (hours > 0) return `Expires in ${hours}h`;
    return 'Expires soon';
  };

  const getShareUrl = (token: string) => {
    return `http://192.168.4.1/s/${token}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <Share2 className="w-6 h-6 text-pcd-blue-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Share {isFolder ? 'Folder' : 'File'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                {fileName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {loading && shares.length === 0 ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pcd-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-500 dark:text-gray-400">Loading shares...</p>
            </div>
          ) : (
            <>
              {/* Create new share section */}
              {!showCreateForm ? (
                <div className="mb-6">
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="flex items-center space-x-2 w-full p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-pcd-blue-500 hover:bg-pcd-blue-50 dark:hover:bg-pcd-blue-900/20 transition-colors"
                  >
                    <Plus className="w-5 h-5 text-pcd-blue-600" />
                    <span className="text-pcd-blue-600 font-medium">Create new share link</span>
                  </button>
                </div>
              ) : (
                <div className="mb-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Create Share Link
                  </h3>

                  {/* Expiry options */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <Clock className="w-4 h-4 inline mr-1" />
                      Expiry
                    </label>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      {[
                        { value: '1', label: '1 hour' },
                        { value: '24', label: '1 day' },
                        { value: '168', label: '1 week' },
                        { value: '720', label: '1 month' },
                        { value: 'never', label: 'Never' },
                        { value: 'custom', label: 'Custom' }
                      ].map(option => (
                        <label key={option.value} className="flex items-center space-x-2">
                          <input
                            type="radio"
                            name="expiry"
                            value={option.value}
                            checked={expiryOption === option.value}
                            onChange={(e) => setExpiryOption(e.target.value)}
                            className="text-pcd-blue-600"
                          />
                          <span className="text-sm">{option.label}</span>
                        </label>
                      ))}
                    </div>
                    {expiryOption === 'custom' && (
                      <input
                        type="number"
                        min="1"
                        max="8760"
                        value={customHours}
                        onChange={(e) => setCustomHours(parseInt(e.target.value) || 1)}
                        className="mt-2 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700"
                        placeholder="Hours"
                      />
                    )}
                  </div>

                  {/* Password protection */}
                  <div className="mb-4">
                    <label className="flex items-center space-x-2 mb-2">
                      <input
                        type="checkbox"
                        checked={usePassword}
                        onChange={(e) => setUsePassword(e.target.checked)}
                        className="text-pcd-blue-600"
                      />
                      <Lock className="w-4 h-4" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Password protection
                      </span>
                    </label>
                    {usePassword && (
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700"
                          placeholder="Enter password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4 text-gray-400" />
                          ) : (
                            <Eye className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Download limit */}
                  <div className="mb-4">
                    <label className="flex items-center space-x-2 mb-2">
                      <input
                        type="checkbox"
                        checked={useMaxDownloads}
                        onChange={(e) => setUseMaxDownloads(e.target.checked)}
                        className="text-pcd-blue-600"
                      />
                      <Download className="w-4 h-4" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Download limit
                      </span>
                    </label>
                    {useMaxDownloads && (
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={maxDownloads}
                        onChange={(e) => setMaxDownloads(parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700"
                        placeholder="Max downloads"
                      />
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex space-x-3">
                    <button
                      onClick={createShare}
                      disabled={loading}
                      className="flex-1 bg-pcd-blue-600 text-white px-4 py-2 rounded-md hover:bg-pcd-blue-700 disabled:opacity-50"
                    >
                      {loading ? 'Creating...' : 'Create Share'}
                    </button>
                    <button
                      onClick={() => {
                        setShowCreateForm(false);
                        resetCreateForm();
                      }}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Existing shares */}
              {shares.length > 0 ? (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Active Shares ({shares.length})
                  </h3>
                  <div className="space-y-4">
                    {shares.map((share) => {
                      const shareUrl = getShareUrl(share.token);
                      const isCopied = copiedUrl === shareUrl;
                      
                      return (
                        <div key={share.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                  Share Link
                                </span>
                                {share.password_hash && (
                                  <Lock className="w-3 h-3 text-yellow-500" />
                                )}
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                {formatExpiry(share.expires_at)}
                                {share.max_downloads && (
                                  <> • {share.download_count}/{share.max_downloads} downloads</>
                                )}
                              </p>
                              <div className="flex items-center space-x-2">
                                <code className="flex-1 text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded truncate">
                                  {shareUrl}
                                </code>
                                <button
                                  onClick={() => copyToClipboard(shareUrl)}
                                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                  title="Copy link"
                                >
                                  {isCopied ? (
                                    <Check className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <Copy className="w-4 h-4 text-gray-500" />
                                  )}
                                </button>
                              </div>
                            </div>
                            <button
                              onClick={() => revokeShare(share.id)}
                              className="ml-2 p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-red-500"
                              title="Revoke share"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          
                          {/* QR Code */}
                          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                            <QRCodeDisplay url={shareUrl} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : !showCreateForm && (
                <div className="text-center py-8">
                  <Share2 className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400">
                    No active shares for this {isFolder ? 'folder' : 'file'}
                  </p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                    Create a share link to allow others to download
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}