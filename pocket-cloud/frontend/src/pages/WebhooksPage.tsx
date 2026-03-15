import React, { useState, useEffect } from 'react';
import { 
  Webhook, 
  Plus, 
  Edit3, 
  Trash2, 
  TestTube, 
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  Copy
} from 'lucide-react';
import { apiClient } from '../api/client';

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  secretPreview: string;
  is_active: boolean;
  created_at: number;
  last_fired_at?: number;
  last_status?: number;
  fail_count: number;
}

interface WebhookDelivery {
  id: string;
  event_type: string;
  status?: number;
  response?: string;
  duration_ms?: number;
  created_at: number;
  delivered_at?: number;
}

interface EventType {
  type: string;
  name: string;
  description: string;
}

const WebhooksPage: React.FC = () => {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [newWebhook, setNewWebhook] = useState({
    name: '',
    url: '',
    events: [] as string[]
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [webhooksRes, eventsRes] = await Promise.all([
        apiClient.get('/developer/webhooks'),
        apiClient.get('/developer/webhooks/events')
      ]);

      setWebhooks(webhooksRes.data);
      setEventTypes(eventsRes.data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  };

  const createWebhook = async () => {
    try {
      if (!newWebhook.name || !newWebhook.url || newWebhook.events.length === 0) {
        setError('Name, URL, and at least one event are required');
        return;
      }

      await apiClient.post('/developer/webhooks', newWebhook);
      
      setShowCreateModal(false);
      setNewWebhook({ name: '', url: '', events: [] });
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create webhook');
    }
  };

  const deleteWebhook = async (webhookId: string) => {
    if (!confirm('Are you sure you want to delete this webhook? This action cannot be undone.')) {
      return;
    }

    try {
      await apiClient.delete(`/developer/webhooks/${webhookId}`);
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to delete webhook');
    }
  };

  const testWebhook = async (webhookId: string) => {
    try {
      await apiClient.post(`/developer/webhooks/${webhookId}/test`);
      alert('Test webhook sent successfully!');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to send test webhook');
    }
  };

  const toggleWebhook = async (webhookId: string, isActive: boolean) => {
    try {
      await apiClient.patch(`/developer/webhooks/${webhookId}`, {
        is_active: !isActive
      });
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to update webhook');
    }
  };

  const showDeliveries = async (webhookId: string) => {
    try {
      const response = await apiClient.get(`/developer/webhooks/${webhookId}/deliveries`);
      setDeliveries(response.data);
      setSelectedWebhook(webhookId);
      setShowDeliveryModal(true);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load deliveries');
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const getStatusIcon = (status?: number) => {
    if (!status) return <Clock className="w-4 h-4 text-gray-400" />;
    if (status >= 200 && status < 300) return <CheckCircle className="w-4 h-4 text-green-600" />;
    return <XCircle className="w-4 h-4 text-red-600" />;
  };

  const getStatusColor = (webhook: Webhook) => {
    if (!webhook.is_active) return 'text-gray-500';
    if (webhook.fail_count > 0) return 'text-orange-600';
    return 'text-green-600';
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
            <Webhook className="w-8 h-8 mr-3 text-blue-600" />
            Webhooks
          </h1>
          <p className="text-gray-600 mt-2">
            Get notified when files change - perfect for automation and workflows
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Webhook
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

      {/* Webhooks List */}
      <div className="bg-white rounded-lg shadow border">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Your Webhooks</h2>
        </div>

        <div className="p-6">
          {webhooks.length === 0 ? (
            <div className="text-center py-8">
              <Webhook className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No webhooks yet</h3>
              <p className="text-gray-600 mb-4">
                Create your first webhook to start receiving notifications when files change
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add Webhook
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {webhooks.map((webhook) => (
                <div key={webhook.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h3 className="font-medium text-gray-900">{webhook.name}</h3>
                        <span className={`text-sm ${getStatusColor(webhook)}`}>
                          {webhook.is_active ? (
                            webhook.fail_count > 0 ? `⚠️ ${webhook.fail_count} failures` : '🟢 Active'
                          ) : '⚪ Inactive'}
                        </span>
                      </div>
                      
                      <div className="mt-1 text-sm text-gray-600">
                        <ExternalLink className="w-4 h-4 inline mr-1" />
                        {webhook.url}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1">
                        {webhook.events.map((event) => (
                          <span
                            key={event}
                            className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                          >
                            {event}
                          </span>
                        ))}
                      </div>

                      <div className="mt-2 text-xs text-gray-500">
                        Created {formatDate(webhook.created_at)}
                        {webhook.last_fired_at && (
                          <span className="ml-4">
                            Last fired {formatRelativeTime(webhook.last_fired_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => testWebhook(webhook.id)}
                        className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded"
                        title="Send test"
                      >
                        <TestTube className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => showDeliveries(webhook.id)}
                        className="p-2 text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded"
                        title="Delivery log"
                      >
                        <Activity className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleWebhook(webhook.id, webhook.is_active)}
                        className={`p-2 rounded ${
                          webhook.is_active 
                            ? 'text-orange-600 hover:text-orange-700 hover:bg-orange-50' 
                            : 'text-green-600 hover:text-green-700 hover:bg-green-50'
                        }`}
                        title={webhook.is_active ? 'Disable' : 'Enable'}
                      >
                        {webhook.is_active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => deleteWebhook(webhook.id)}
                        className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                        title="Delete"
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

      {/* Create Webhook Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Webhook</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newWebhook.name}
                  onChange={(e) => setNewWebhook(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Home Assistant, Backup Notifier"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL
                </label>
                <input
                  type="url"
                  value={newWebhook.url}
                  onChange={(e) => setNewWebhook(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://your-server.com/webhook"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Events
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                  {eventTypes.map((eventType) => (
                    <label key={eventType.type} className="flex items-start">
                      <input
                        type="checkbox"
                        checked={newWebhook.events.includes(eventType.type)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewWebhook(prev => ({
                              ...prev,
                              events: [...prev.events, eventType.type]
                            }));
                          } else {
                            setNewWebhook(prev => ({
                              ...prev,
                              events: prev.events.filter(e => e !== eventType.type)
                            }));
                          }
                        }}
                        className="mr-2 mt-0.5"
                      />
                      <div>
                        <span className="text-sm font-medium">{eventType.type}</span>
                        <div className="text-xs text-gray-600">{eventType.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={createWebhook}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create Webhook
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

      {/* Delivery Log Modal */}
      {showDeliveryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Delivery Log</h3>
              <button
                onClick={() => setShowDeliveryModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-3">
              {deliveries.length === 0 ? (
                <p className="text-gray-600 text-center py-8">No deliveries yet</p>
              ) : (
                deliveries.map((delivery) => (
                  <div key={delivery.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {getStatusIcon(delivery.status)}
                        <span className="font-medium text-sm">{delivery.event_type}</span>
                        <span className="text-sm text-gray-600">
                          {formatRelativeTime(delivery.created_at)}
                        </span>
                        {delivery.duration_ms && (
                          <span className="text-xs text-gray-500">
                            {delivery.duration_ms}ms
                          </span>
                        )}
                      </div>
                      <div className="text-sm">
                        {delivery.status ? (
                          <span className={`px-2 py-1 rounded text-xs ${
                            delivery.status >= 200 && delivery.status < 300
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {delivery.status}
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">
                            Pending
                          </span>
                        )}
                      </div>
                    </div>
                    {delivery.response && (
                      <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                        {delivery.response}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebhooksPage;