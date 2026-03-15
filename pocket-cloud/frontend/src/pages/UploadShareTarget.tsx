import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Upload, ArrowRight } from 'lucide-react';

interface SharedFile {
  id: number;
  name: string;
  type: string;
  size: number;
  data: ArrayBuffer;
  timestamp: number;
}

export const UploadShareTarget: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleSharedFiles = async () => {
      try {
        // Check if we came from share target
        const isShared = searchParams.get('shared') === 'true';
        const fileCount = parseInt(searchParams.get('count') || '0');

        if (isShared && fileCount > 0) {
          // Get shared files from IndexedDB (stored by service worker)
          const files = await getSharedFilesFromDB();
          if (files.length > 0) {
            setSharedFiles(files);
            await uploadSharedFiles(files);
          } else {
            setError('No files found to upload');
          }
        } else {
          // Handle GET request - show loading state
          setIsUploading(true);
        }
      } catch (err) {
        console.error('Failed to handle shared files:', err);
        setError('Failed to process shared files');
      }
    };

    handleSharedFiles();
  }, [searchParams]);

  const getSharedFilesFromDB = async (): Promise<SharedFile[]> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('shared-files', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['files'], 'readonly');
        const store = transaction.objectStore('files');
        const getAllRequest = store.getAll();
        
        getAllRequest.onsuccess = () => {
          resolve(getAllRequest.result);
        };
        getAllRequest.onerror = () => reject(getAllRequest.error);
      };
    });
  };

  const uploadSharedFiles = async (files: SharedFile[]) => {
    setIsUploading(true);
    
    try {
      for (const file of files) {
        const formData = new FormData();
        const blob = new Blob([file.data], { type: file.type });
        const fileObj = new File([blob], file.name, { type: file.type });
        
        formData.append('file', fileObj);
        formData.append('folderId', ''); // Upload to root folder
        
        // Track progress
        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
        
        const xhr = new XMLHttpRequest();
        
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = (event.loaded / event.total) * 100;
            setUploadProgress(prev => ({ ...prev, [file.name]: progress }));
          }
        };
        
        await new Promise<void>((resolve, reject) => {
          xhr.onload = () => {
            if (xhr.status === 200) {
              setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
              resolve();
            } else {
              reject(new Error(`Upload failed: ${xhr.statusText}`));
            }
          };
          
          xhr.onerror = () => reject(new Error('Upload failed'));
          
          xhr.open('POST', '/api/upload');
          xhr.send(formData);
        });
      }
      
      // Clear shared files from IndexedDB
      await clearSharedFilesFromDB();
      
      setUploadComplete(true);
      setIsUploading(false);
      
    } catch (err) {
      console.error('Upload failed:', err);
      setError('Upload failed. Please try again.');
      setIsUploading(false);
    }
  };

  const clearSharedFilesFromDB = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('shared-files', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['files'], 'readwrite');
        const store = transaction.objectStore('files');
        const clearRequest = store.clear();
        
        clearRequest.onsuccess = () => resolve();
        clearRequest.onerror = () => reject(clearRequest.error);
      };
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusMessage = () => {
    if (error) {
      return error;
    }
    
    if (uploadComplete) {
      return `✓ Uploaded to PocketCloud`;
    }
    
    if (isUploading && sharedFiles.length > 0) {
      return `Uploading ${sharedFiles.length} file${sharedFiles.length > 1 ? 's' : ''} from ${getSourceApp()}...`;
    }
    
    return 'Processing shared files...';
  };

  const getSourceApp = () => {
    const userAgent = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(userAgent)) {
      return 'Photos';
    } else if (/Android/.test(userAgent)) {
      return 'Gallery';
    }
    return 'your device';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
            {uploadComplete ? (
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            ) : (
              <Upload className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            )}
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            PocketCloud
          </h1>
        </div>

        {/* Status Message */}
        <div className="text-center mb-6">
          <p className="text-lg text-gray-700 dark:text-gray-300 mb-4">
            {getStatusMessage()}
          </p>

          {/* Progress Bars */}
          {isUploading && sharedFiles.length > 0 && (
            <div className="space-y-3">
              {sharedFiles.map((file) => (
                <div key={file.id} className="text-left">
                  <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-400 mb-1">
                    <span className="truncate flex-1 mr-2">{file.name}</span>
                    <span className="text-xs">{Math.round(uploadProgress[file.name] || 0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress[file.name] || 0}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {formatFileSize(file.size)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* File List */}
        {sharedFiles.length > 0 && !isUploading && (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Files uploaded:
            </h3>
            <div className="space-y-2">
              {sharedFiles.map((file) => (
                <div key={file.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center flex-1 min-w-0">
                    <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                    <span className="truncate text-gray-600 dark:text-gray-400">{file.name}</span>
                  </div>
                  <span className="text-xs text-gray-500 ml-2">{formatFileSize(file.size)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          {uploadComplete && (
            <button
              onClick={() => navigate('/files')}
              className="w-full bg-blue-600 text-white font-medium py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              Open PocketCloud
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          
          {error && (
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-gray-600 text-white font-medium py-3 px-4 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Try Again
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Files are uploaded to your personal cloud storage
          </p>
        </div>
      </div>
    </div>
  );
};