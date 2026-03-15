import React, { useState } from 'react';
import { AlertTriangle, Clock, HardDrive, Download, Upload, Copy } from 'lucide-react';

interface SyncConflict {
  path: string;
  clientHash: string;
  serverHash: string;
  clientMtime: number;
  serverMtime: number;
  clientSize?: number;
  serverSize?: number;
}

interface SyncConflictResolverProps {
  conflicts: SyncConflict[];
  onResolve: (resolutions: Array<{
    path: string;
    resolution: 'keep_client' | 'keep_server' | 'keep_both';
  }>) => void;
  onCancel: () => void;
}

export const SyncConflictResolver: React.FC<SyncConflictResolverProps> = ({
  conflicts,
  onResolve,
  onCancel
}) => {
  const [resolutions, setResolutions] = useState<Map<string, string>>(new Map());
  const [globalStrategy, setGlobalStrategy] = useState<string>('');

  const handleResolutionChange = (path: string, resolution: string) => {
    const newResolutions = new Map(resolutions);
    newResolutions.set(path, resolution);
    setResolutions(newResolutions);
  };

  const applyGlobalStrategy = () => {
    if (!globalStrategy) return;
    
    const newResolutions = new Map(resolutions);
    conflicts.forEach(conflict => {
      let resolution = globalStrategy;
      
      // Apply smart strategies
      if (globalStrategy === 'newer_wins') {
        resolution = conflict.clientMtime > conflict.serverMtime ? 'keep_client' : 'keep_server';
      } else if (globalStrategy === 'larger_wins') {
        const clientSize = conflict.clientSize || 0;
        const serverSize = conflict.serverSize || 0;
        resolution = clientSize > serverSize ? 'keep_client' : 'keep_server';
      }
      
      newResolutions.set(conflict.path, resolution);
    });
    
    setResolutions(newResolutions);
  };

  const handleResolveAll = () => {
    const resolvedConflicts = conflicts.map(conflict => ({
      path: conflict.path,
      resolution: resolutions.get(conflict.path) || 'keep_both'
    })) as Array<{
      path: string;
      resolution: 'keep_client' | 'keep_server' | 'keep_both';
    }>;
    
    onResolve(resolvedConflicts);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const allResolved = conflicts.every(conflict => resolutions.has(conflict.path));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-orange-50 border-b border-orange-200 p-6">
          <div className="flex items-center">
            <AlertTriangle className="text-orange-500 mr-3" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Sync Conflicts Detected
              </h2>
              <p className="text-gray-600 mt-1">
                {conflicts.length} file{conflicts.length !== 1 ? 's' : ''} have been modified on both your device and the server. 
                Choose how to resolve each conflict.
              </p>
            </div>
          </div>
        </div>
        {/* Global Strategy */}
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Apply to All Conflicts</h3>
          <div className="flex flex-wrap gap-3">
            <select
              value={globalStrategy}
              onChange={(e) => setGlobalStrategy(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Choose strategy...</option>
              <option value="newer_wins">Keep Newer Version</option>
              <option value="larger_wins">Keep Larger File</option>
              <option value="keep_both">Keep Both Versions</option>
              <option value="keep_client">Keep Local Version</option>
              <option value="keep_server">Keep Server Version</option>
            </select>
            <button
              onClick={applyGlobalStrategy}
              disabled={!globalStrategy}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Apply to All
            </button>
          </div>
        </div>

        {/* Conflicts List */}
        <div className="overflow-y-auto max-h-96">
          {conflicts.map((conflict, index) => (
            <div key={conflict.path} className="p-6 border-b border-gray-200 last:border-b-0">
              <div className="mb-4">
                <h4 className="font-medium text-gray-900 mb-2">{conflict.path}</h4>
                
                {/* Version Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {/* Local Version */}
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center mb-2">
                      <HardDrive className="text-blue-600 mr-2" size={16} />
                      <span className="font-medium text-blue-900">Your Version</span>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div className="flex items-center">
                        <Clock className="mr-1" size={12} />
                        Modified: {formatDate(conflict.clientMtime)}
                      </div>
                      {conflict.clientSize && (
                        <div>Size: {formatFileSize(conflict.clientSize)}</div>
                      )}
                      <div className="font-mono text-xs text-gray-500">
                        Hash: {conflict.clientHash.substring(0, 8)}...
                      </div>
                    </div>
                  </div>

                  {/* Server Version */}
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="flex items-center mb-2">
                      <Download className="text-green-600 mr-2" size={16} />
                      <span className="font-medium text-green-900">Server Version</span>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div className="flex items-center">
                        <Clock className="mr-1" size={12} />
                        Modified: {formatDate(conflict.serverMtime)}
                      </div>
                      {conflict.serverSize && (
                        <div>Size: {formatFileSize(conflict.serverSize)}</div>
                      )}
                      <div className="font-mono text-xs text-gray-500">
                        Hash: {conflict.serverHash.substring(0, 8)}...
                      </div>
                    </div>
                  </div>
                </div>

                {/* Resolution Options */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Choose resolution:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      onClick={() => handleResolutionChange(conflict.path, 'keep_client')}
                      className={`p-3 rounded-lg border-2 text-left transition-colors ${
                        resolutions.get(conflict.path) === 'keep_client'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-center mb-1">
                        <HardDrive className="text-blue-600 mr-2" size={16} />
                        <span className="font-medium">Keep Mine</span>
                      </div>
                      <p className="text-xs text-gray-600">Use your local version</p>
                    </button>

                    <button
                      onClick={() => handleResolutionChange(conflict.path, 'keep_server')}
                      className={`p-3 rounded-lg border-2 text-left transition-colors ${
                        resolutions.get(conflict.path) === 'keep_server'
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 hover:border-green-300'
                      }`}
                    >
                      <div className="flex items-center mb-1">
                        <Download className="text-green-600 mr-2" size={16} />
                        <span className="font-medium">Keep Server</span>
                      </div>
                      <p className="text-xs text-gray-600">Use server version</p>
                    </button>

                    <button
                      onClick={() => handleResolutionChange(conflict.path, 'keep_both')}
                      className={`p-3 rounded-lg border-2 text-left transition-colors ${
                        resolutions.get(conflict.path) === 'keep_both'
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-purple-300'
                      }`}
                    >
                      <div className="flex items-center mb-1">
                        <Copy className="text-purple-600 mr-2" size={16} />
                        <span className="font-medium">Keep Both</span>
                      </div>
                      <p className="text-xs text-gray-600">Save both versions</p>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            {resolutions.size} of {conflicts.length} conflicts resolved
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleResolveAll}
              disabled={!allResolved}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Resolve All Conflicts
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};