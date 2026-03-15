import React, { useState, useEffect } from 'react';
import { 
  Key, 
  Plus, 
  Copy, 
  Trash2, 
  Edit3, 
  AlertTriangle,
  Code,
  ExternalLink,
  Calendar,
  Activity
} from 'lucide-react';
import { apiClient } from '../api/client';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: number | null;
  expiresAt: number | null;
  createdAt: number;
  isActive: boolean;
}

interface ApiScope {
  name: string;
  description: string;
  requiresAdmin: boolean;
}

interface CreateKeyData {
  name: string;
  scopes: string[];
  expiresInDays?: number;
}

const DeveloperPage: React.FC = () => {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [scopes, setScopes] = useState<ApiScope[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKeyData, setNewKeyData] = useState<CreateKeyData>({ name: '', scopes: [] });
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Get Pi IP for examples
  const piIp = window.location.hostname;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [keysRes, scopesRes] = await Promise.all([
        apiClient.get('/developer/keys'),
        apiClient.get('/developer/scopes')
      ]);

      setApiKeys(keysRes.data);
      setScopes(scopesRes.data);
    } catch (err) {
      setError('Failed to load developer data');
    } finally {
      setLoading(false);
    }
  };

  const createApiKey = async () => {
    try {
      if (!newKeyData.name || newKeyData.scopes.length === 0) {
        setError('Name and at least one scope are required');
        return;
      }

      const response = await apiClient.post('/developer/keys', newKeyData);
      
      setCreatedKey(response.data.key);
      setShowCreateModal(false);
      setShowKeyModal(true);
      setNewKeyData({ name: '', scopes: [] });
      
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create API key');
    }
  };

  const deleteApiKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) {
      return;
    }

    try {
      await apiClient.delete(`/developer/keys/${keyId}`);
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to revoke API key');
    }
  };

  const updateApiKey = async (keyId: string) => {
    try {
      await apiClient.patch(`/developer/keys/${keyId}`, { name: editName });
      setEditingKey(null);
      setEditName('');
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to update API key');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days} days ago`;
    
    return formatDate(timestamp);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <Code className="w-8 h-8 mr-3 text-blue-600" />
            Developer API
          </h1>
          <p className="text-gray-600 mt-2">
            Build apps and automations that connect to your Pocket Cloud Drive
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create API Key
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
            <span className="text-red-800">{error}</span>
          </div>
        </div>
      )}

      {/* API Keys Section */}
      <div className="bg-white rounded-lg shadow border">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center">
            <Key className="w-5 h-5 mr-2" />
            API Keys
          </h2>
          <p className="text-gray-600 mt-1">
            Manage your API keys for programmatic access
          </p>
        </div>

        <div className="p-6">
          {apiKeys.length === 0 ? (
            <div className="text-center py-8">
              <Key className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No API keys yet</h3>
              <p className="text-gray-600 mb-4">
                Create your first API key to start building with the Pocket Cloud Drive API
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create API Key
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {apiKeys.map((key) => (
                <div key={key.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        {editingKey === key.id ? (
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="px-3 py-1 border border-gray-300 rounded text-sm"
                              onKeyPress={(e) => e.key === 'Enter' && updateApiKey(key.id)}
                            />
                            <button
                              onClick={() => updateApiKey(key.id)}
                              className="text-green-600 hover:text-green-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingKey(null)}
                              className="text-gray-600 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <h3 className="font-medium text-gray-900">{key.name}</h3>
                            <button
                              onClick={() => {
                                setEditingKey(key.id);
                                setEditName(key.name);
                              }}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                      
                      <div className="mt-2 flex items-center space-x-4 text-sm text-gray-600">
                        <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                          {key.prefix}...
                        </span>
                        <span className="flex items-center">
                          <Calendar className="w-4 h-4 mr-1" />
                          Created {formatDate(key.createdAt)}
                        </span>
                        {key.lastUsedAt && (
                          <span className="flex items-center">
                            <Activity className="w-4 h-4 mr-1" />
                            Last used {formatRelativeTime(key.lastUsedAt)}
                          </span>
                        )}
                        {key.expiresAt && (
                          <span className="flex items-center text-orange-600">
                            <AlertTriangle className="w-4 h-4 mr-1" />
                            Expires {formatDate(key.expiresAt)}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1">
                        {key.scopes.map((scope) => (
                          <span
                            key={scope}
                            className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                          >
                            {scope}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => deleteApiKey(key.id)}
                        className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Webhooks Section */}
      <div className="bg-white rounded-lg shadow border">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center">
            <ExternalLink className="w-5 h-5 mr-2" />
            Webhooks & Automation
          </h2>
          <p className="text-gray-600 mt-1">
            Get notified when files change - perfect for home automation and workflows
          </p>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Home Assistant Integration</h3>
            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
              <div className="text-green-400"># configuration.yaml</div>
              <div>automation:</div>
              <div>  - alias: "New file uploaded"</div>
              <div>    trigger:</div>
              <div>      platform: webhook</div>
              <div>      webhook_id: pocketcloud_file_created</div>
              <div>    action:</div>
              <div>      - service: notify.mobile_app</div>
              <div>        data:</div>
              <div>          message: "New file: {`{{ trigger.json.data.file.name }}`}"</div>
            </div>
          </div>

          <div>
            <h3 className="font-medium text-gray-900 mb-2">Node.js Webhook Receiver</h3>
            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
              <div className="text-green-400">// Express.js webhook endpoint</div>
              <div>const crypto = require('crypto');</div>
              <div></div>
              <div>app.post('/webhook', (req, res) =&gt; {'{'}</div>
              <div>  const sig = req.headers['x-pocketcloud-signature'];</div>
              <div>  const expected = 'sha256=' + crypto</div>
              <div>    .createHmac('sha256', process.env.WEBHOOK_SECRET)</div>
              <div>    .update(JSON.stringify(req.body))</div>
              <div>    .digest('hex');</div>
              <div></div>
              <div>  if (sig !== expected) return res.status(401).end();</div>
              <div></div>
              <div>  console.log('Event:', req.body.type);</div>
              <div>  console.log('File:', req.body.data.file.name);</div>
              <div>  res.status(200).end();</div>
              <div>{`}`});</div>
            </div>
          </div>

          <div>
            <h3 className="font-medium text-gray-900 mb-2">Available Events</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">file.created</span>
                  <span className="ml-2 text-gray-600">New file uploaded</span>
                </div>
                <div className="text-sm">
                  <span className="font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">file.deleted</span>
                  <span className="ml-2 text-gray-600">File moved to trash</span>
                </div>
                <div className="text-sm">
                  <span className="font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">upload.complete</span>
                  <span className="ml-2 text-gray-600">Upload finished</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">folder.created</span>
                  <span className="ml-2 text-gray-600">New folder created</span>
                </div>
                <div className="text-sm">
                  <span className="font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">storage.warning</span>
                  <span className="ml-2 text-gray-600">Storage &gt; 80% full</span>
                </div>
                <div className="text-sm">
                  <span className="font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">user.login</span>
                  <span className="ml-2 text-gray-600">User logged in</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertTriangle className="w-5 h-5 text-blue-600 mr-2 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900">Webhook Security</h4>
                <p className="text-blue-800 text-sm mt-1">
                  Always verify the X-PocketCloud-Signature header using HMAC-SHA256 to ensure webhooks are authentic.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Start Section */}
      <div className="bg-white rounded-lg shadow border">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center">
            <ExternalLink className="w-5 h-5 mr-2" />
            API Quick Start
          </h2>
          <p className="text-gray-600 mt-1">
            Common API operations with curl examples
          </p>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <h3 className="font-medium text-gray-900 mb-2">List Files</h3>
            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
              <div className="text-green-400"># List files in root directory</div>
              <div>curl -H "Authorization: Bearer YOUR_API_KEY" \</div>
              <div className="ml-4">http://{piIp}:3000/api/v1/files</div>
            </div>
          </div>

          <div>
            <h3 className="font-medium text-gray-900 mb-2">Download File</h3>
            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
              <div className="text-green-400"># Download a specific file</div>
              <div>curl -H "Authorization: Bearer YOUR_API_KEY" \</div>
              <div className="ml-4">-o "downloaded_file.pdf" \</div>
              <div className="ml-4">http://{piIp}:3000/api/v1/files/FILE_ID/download</div>
            </div>
          </div>

          <div>
            <h3 className="font-medium text-gray-900 mb-2">Search Files</h3>
            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
              <div className="text-green-400"># Search for files containing "report"</div>
              <div>curl -H "Authorization: Bearer YOUR_API_KEY" \</div>
              <div className="ml-4">"http://{piIp}:3000/api/v1/search?q=report"</div>
            </div>
          </div>

          <div>
            <h3 className="font-medium text-gray-900 mb-2">Create Folder</h3>
            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
              <div className="text-green-400"># Create a new folder</div>
              <div>curl -X POST \</div>
              <div className="ml-4">-H "Authorization: Bearer YOUR_API_KEY" \</div>
              <div className="ml-4">-H "Content-Type: application/json" \</div>
              <div className="ml-4">-d '{`{"name": "My New Folder"}`}' \</div>
              <div className="ml-4">http://{piIp}:3000/api/v1/folders</div>
            </div>
          </div>

          <div>
            <h3 className="font-medium text-gray-900 mb-2">Get Storage Info</h3>
            <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
              <div className="text-green-400"># Get storage usage and quota</div>
              <div>curl -H "Authorization: Bearer YOUR_API_KEY" \</div>
              <div className="ml-4">http://{piIp}:3000/api/v1/storage</div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertTriangle className="w-5 h-5 text-blue-600 mr-2 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900">API Documentation</h4>
                <p className="text-blue-800 text-sm mt-1">
                  Replace YOUR_API_KEY with your actual API key. All API responses follow a consistent format with success/error status and metadata.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create API Key Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Create API Key</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newKeyData.name}
                  onChange={(e) => setNewKeyData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Home Automation, Backup Script"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Scopes
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {scopes.map((scope) => (
                    <label key={scope.name} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={newKeyData.scopes.includes(scope.name)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewKeyData(prev => ({
                              ...prev,
                              scopes: [...prev.scopes, scope.name]
                            }));
                          } else {
                            setNewKeyData(prev => ({
                              ...prev,
                              scopes: prev.scopes.filter(s => s !== scope.name)
                            }));
                          }
                        }}
                        className="mr-2"
                      />
                      <div>
                        <span className="text-sm font-medium">{scope.name}</span>
                        {scope.requiresAdmin && (
                          <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-800 text-xs rounded">
                            Admin
                          </span>
                        )}
                        <div className="text-xs text-gray-600">{scope.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Expires (optional)
                </label>
                <select
                  value={newKeyData.expiresInDays || ''}
                  onChange={(e) => setNewKeyData(prev => ({
                    ...prev,
                    expiresInDays: e.target.value ? parseInt(e.target.value) : undefined
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Never expires</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="365">1 year</option>
                </select>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={createApiKey}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create Key
              </button>
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Show Created Key Modal */}
      {showKeyModal && createdKey && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <div className="flex items-center mb-4">
              <AlertTriangle className="w-6 h-6 text-orange-600 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">Save Your API Key</h3>
            </div>
            
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
              <p className="text-orange-800 text-sm">
                <strong>Important:</strong> This is the only time you'll see this key. 
                Copy it now and store it securely.
              </p>
            </div>

            <div className="bg-gray-100 p-4 rounded-lg mb-4">
              <div className="flex items-center justify-between">
                <code className="text-sm font-mono break-all">{createdKey}</code>
                <button
                  onClick={() => copyToClipboard(createdKey)}
                  className="ml-2 p-2 text-gray-600 hover:text-gray-800"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                setShowKeyModal(false);
                setCreatedKey(null);
              }}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              I've Saved the Key
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeveloperPage;