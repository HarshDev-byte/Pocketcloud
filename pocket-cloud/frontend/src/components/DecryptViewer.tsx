import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, Download, AlertTriangle, Clock, FileText } from 'lucide-react';
import { CryptoService, EncryptionProgress } from '../services/crypto.service';
import { apiClient } from '../api/client';

interface DecryptViewerProps {
  fileId: string;
  fileName: string;
  fileSize: number;
  encryptionHint?: string;
  createdAt: string;
  onClose: () => void;
  onDecrypted?: (decryptedFile: File) => void;
}

export const DecryptViewer: React.FC<DecryptViewerProps> = ({
  fileId,
  fileName,
  fileSize,
  encryptionHint,
  createdAt,
  onClose,
  onDecrypted
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptionProgress, setDecryptionProgress] = useState<EncryptionProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string | null>(null);
  const [originalMimeType, setOriginalMimeType] = useState<string | null>(null);

  useEffect(() => {
    loadFileMetadata();
  }, [fileId]);

  const loadFileMetadata = async () => {
    try {
      // Download a small chunk to read the header
      const response = await apiClient.get(`/api/files/${fileId}/download`, {
        headers: { Range: 'bytes=0-1023' },
        responseType: 'blob'
      });

      const originalName = await CryptoService.getOriginalFilename(response.data);
      if (originalName) {
        setOriginalFileName(originalName);
        // Guess MIME type from extension
        const ext = originalName.split('.').pop()?.toLowerCase();
        const mimeTypes: Record<string, string> = {
          'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
          'gif': 'image/gif', 'webp': 'image/webp',
          'mp4': 'video/mp4', 'webm': 'video/webm', 'mov': 'video/quicktime',
          'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'flac': 'audio/flac',
          'pdf': 'application/pdf', 'txt': 'text/plain',
          'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        };
        setOriginalMimeType(mimeTypes[ext || ''] || 'application/octet-stream');
      }
    } catch (error) {
      console.error('Failed to load file metadata:', error);
    }
  };

  const handleDecrypt = async (action: 'view' | 'download') => {
    if (!password.trim()) {
      setError('Please enter the decryption password');
      return;
    }

    setIsDecrypting(true);
    setError(null);
    setDecryptionProgress({ phase: 'deriving-key', progress: 0 });

    try {
      // Download the encrypted file
      const response = await apiClient.get(`/api/files/${fileId}/download`, {
        responseType: 'blob',
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const downloadProgress = Math.round((progressEvent.loaded / progressEvent.total) * 30);
            setDecryptionProgress({ phase: 'deriving-key', progress: downloadProgress });
          }
        }
      });

      // Decrypt the file
      const decryptedFile = await CryptoService.decryptFile(
        response.data,
        password,
        (progress) => {
          setDecryptionProgress({
            ...progress,
            progress: 30 + Math.round(progress.progress * 0.7) // Scale to 30-100%
          });
        }
      );

      setDecryptionProgress({ phase: 'complete', progress: 100 });

      if (action === 'view') {
        // Open in viewer
        onDecrypted?.(decryptedFile);
        onClose();
      } else {
        // Download decrypted file
        const url = URL.createObjectURL(decryptedFile);
        const a = document.createElement('a');
        a.href = url;
        a.download = decryptedFile.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        onClose();
      }

    } catch (error) {
      console.error('Decryption failed:', error);
      if ((error as Error).message.includes('Incorrect password')) {
        setError('Incorrect password. Please try again.');
      } else {
        setError(`Decryption failed: ${(error as Error).message}`);
      }
    } finally {
      setIsDecrypting(false);
      setDecryptionProgress(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFileIcon = () => {
    if (!originalFileName) return <FileText className="text-gray-500" size={48} />;
    
    const ext = originalFileName.split('.').pop()?.toLowerCase();
    const iconProps = { size: 48, className: "text-blue-500" };
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
      return <FileText {...iconProps} className="text-green-500" />;
    }
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext || '')) {
      return <FileText {...iconProps} className="text-red-500" />;
    }
    if (['mp3', 'wav', 'flac', 'aac'].includes(ext || '')) {
      return <FileText {...iconProps} className="text-purple-500" />;
    }
    if (ext === 'pdf') {
      return <FileText {...iconProps} className="text-red-600" />;
    }
    
    return <FileText {...iconProps} />;
  };
  if (isDecrypting && decryptionProgress) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <Lock className="mx-auto mb-4 text-blue-600 animate-pulse" size={48} />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Decrypting File
            </h3>
            <p className="text-gray-600 mb-4">
              {decryptionProgress.phase === 'deriving-key' && 'Deriving encryption key...'}
              {decryptionProgress.phase === 'decrypting' && 'Decrypting file content...'}
              {decryptionProgress.phase === 'complete' && 'Decryption complete!'}
            </p>
            
            <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
              <div 
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${decryptionProgress.progress}%` }}
              />
            </div>
            
            <div className="flex justify-between text-sm text-gray-500">
              <span>{decryptionProgress.progress}% complete</span>
              {decryptionProgress.currentChunk && decryptionProgress.totalChunks && (
                <span>Chunk {decryptionProgress.currentChunk} of {decryptionProgress.totalChunks}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="bg-orange-50 border-b border-orange-200 p-6">
          <div className="flex items-center">
            <Lock className="text-orange-600 mr-3" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Encrypted File
              </h2>
              <p className="text-gray-600 mt-1">
                Enter password to decrypt and access
              </p>
            </div>
          </div>
        </div>

        {/* File Info */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              {getFileIcon()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="mb-2">
                <p className="text-sm text-gray-500">Original file:</p>
                <p className="font-medium text-gray-900 truncate">
                  {originalFileName || 'Loading...'}
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                <div>
                  <span className="text-gray-500">Size:</span>
                  <span className="ml-1 font-mono">{formatFileSize(fileSize)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Encrypted:</span>
                  <span className="ml-1">{formatDate(createdAt)}</span>
                </div>
              </div>

              {encryptionHint && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">Hint:</span> {encryptionHint}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Password Input */}
        <div className="p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Decryption Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && password.trim()) {
                    handleDecrypt('view');
                  }
                }}
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter the password used to encrypt this file"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center">
                <AlertTriangle className="text-red-600 mr-2" size={16} />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}

          {/* Security Notice */}
          <div className="bg-gray-50 rounded-lg p-3 mb-4">
            <div className="flex items-start">
              <Lock className="text-gray-500 mr-2 mt-0.5" size={14} />
              <div className="text-xs text-gray-600">
                <p className="font-medium mb-1">Security Notice</p>
                <p>
                  Decryption happens entirely in your browser. The decrypted file 
                  exists only in memory and is never stored on the server.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-between items-center">
          <button
            onClick={onClose}
            className="text-gray-700 hover:text-gray-900 font-medium"
          >
            Cancel
          </button>
          <div className="flex space-x-3">
            <button
              onClick={() => handleDecrypt('download')}
              disabled={!password.trim() || isDecrypting}
              className="px-4 py-2 text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center"
            >
              <Download className="mr-2" size={16} />
              Decrypt & Download
            </button>
            <button
              onClick={() => handleDecrypt('view')}
              disabled={!password.trim() || isDecrypting}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
            >
              <Eye className="mr-2" size={16} />
              Decrypt & View
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};