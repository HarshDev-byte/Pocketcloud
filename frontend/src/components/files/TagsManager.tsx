import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Input } from '../ui';
import { api } from '../../lib/api';
import { toast } from '../ui';

interface TagsManagerProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  position: { x: number; y: number };
}

interface FileTag {
  id: string;
  name: string;
  color: string;
  applied: boolean;
}

const TAG_COLORS = [
  { name: 'Red', value: 'red', class: 'bg-red-500' },
  { name: 'Orange', value: 'orange', class: 'bg-orange-500' },
  { name: 'Yellow', value: 'yellow', class: 'bg-yellow-500' },
  { name: 'Green', value: 'green', class: 'bg-green-500' },
  { name: 'Blue', value: 'blue', class: 'bg-blue-500' },
  { name: 'Purple', value: 'purple', class: 'bg-purple-500' },
  { name: 'Pink', value: 'pink', class: 'bg-pink-500' },
  { name: 'Gray', value: 'gray', class: 'bg-gray-500' },
];

export function TagsManager({ isOpen, onClose, fileId, fileName, position }: TagsManagerProps) {
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('blue');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: tags, isLoading } = useQuery({
    queryKey: ['file-tags', fileId],
    queryFn: async () => {
      const response = await api.get(`/api/files/${fileId}/tags`);
      return response.data.tags as FileTag[];
    },
    enabled: isOpen && !!fileId,
  });

  const toggleTagMutation = useMutation({
    mutationFn: async ({ tagId, applied }: { tagId: string; applied: boolean }) => {
      if (applied) {
        await api.delete(`/api/files/${fileId}/tags/${tagId}`);
      } else {
        await api.post(`/api/files/${fileId}/tags/${tagId}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-tags', fileId] });
      queryClient.invalidateQueries({ queryKey: ['folder'] });
    },
    onError: () => {
      toast.error('Failed to update tag');
    },
  });

  const createTagMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/api/tags', {
        name: newTagName,
        color: newTagColor,
      });
      return response.data.tag;
    },
    onSuccess: (newTag) => {
      // Apply the new tag to the file
      toggleTagMutation.mutate({ tagId: newTag.id, applied: false });
      setNewTagName('');
      setShowCreateForm(false);
      toast.success('Tag created and applied');
    },
    onError: () => {
      toast.error('Failed to create tag');
    },
  });

  const handleToggleTag = (tag: FileTag) => {
    toggleTagMutation.mutate({ tagId: tag.id, applied: tag.applied });
  };

  const handleCreateTag = () => {
    if (!newTagName.trim()) return;
    createTagMutation.mutate();
  };

  const getColorClass = (color: string): string => {
    const colorConfig = TAG_COLORS.find(c => c.value === color);
    return colorConfig?.class || 'bg-blue-500';
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Popover */}
      <div
        className="fixed z-50 w-72 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-xl"
        style={{ 
          left: Math.min(position.x, window.innerWidth - 300), 
          top: Math.min(position.y, window.innerHeight - 400) 
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-surface-200 dark:border-surface-700">
          <div>
            <h3 className="font-medium text-surface-900 dark:text-surface-100">
              Add tags
            </h3>
            <p className="text-xs text-surface-600 dark:text-surface-400 truncate">
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
        <div className="p-3 max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-4">
              <div className="text-surface-600 dark:text-surface-400">Loading tags...</div>
            </div>
          ) : (
            <div className="space-y-2">
              {tags?.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => handleToggleTag(tag)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
                  disabled={toggleTagMutation.isPending}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${getColorClass(tag.color)}`} />
                    <span className="text-sm text-surface-900 dark:text-surface-100">
                      {tag.name}
                    </span>
                  </div>
                  <div className="ml-auto">
                    {tag.applied ? (
                      <div className="w-4 h-4 bg-brand-500 rounded text-white flex items-center justify-center">
                        <X className="w-3 h-3" />
                      </div>
                    ) : (
                      <div className="w-4 h-4 border border-surface-300 dark:border-surface-600 rounded flex items-center justify-center">
                        <Plus className="w-3 h-3 text-surface-400" />
                      </div>
                    )}
                  </div>
                </button>
              ))}

              {/* Create new tag */}
              <div className="border-t border-surface-200 dark:border-surface-700 pt-2 mt-2">
                {showCreateForm ? (
                  <div className="space-y-2">
                    <Input
                      placeholder="Tag name"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateTag();
                        } else if (e.key === 'Escape') {
                          setShowCreateForm(false);
                          setNewTagName('');
                        }
                      }}
                      autoFocus
                    />
                    
                    <div className="flex gap-1 flex-wrap">
                      {TAG_COLORS.map(color => (
                        <button
                          key={color.value}
                          onClick={() => setNewTagColor(color.value)}
                          className={`w-6 h-6 rounded-full ${color.class} ${
                            newTagColor === color.value 
                              ? 'ring-2 ring-surface-900 dark:ring-surface-100' 
                              : ''
                          }`}
                          title={color.name}
                        />
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={handleCreateTag}
                        variant="primary"
                        size="sm"
                        disabled={!newTagName.trim() || createTagMutation.isPending}
                      >
                        Create
                      </Button>
                      <Button
                        onClick={() => {
                          setShowCreateForm(false);
                          setNewTagName('');
                        }}
                        variant="secondary"
                        size="sm"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="w-full flex items-center gap-2 p-2 text-sm text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Create new tag...
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}