import { useState, useMemo } from 'react';
import { Image, Download, Share2, Trash2, Check } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, Button } from '../components/ui';
import { api } from '../lib/api';
import { FileItem } from '../api/files.api';
import { formatFileSize } from '../lib/fileTypes';

export default function PhotosPage() {
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  const { data: photos, isLoading } = useQuery({
    queryKey: ['photos'],
    queryFn: async () => {
      const response = await api.get('/api/files/photos');
      return response.data.files as FileItem[];
    },
  });

  const photoGroups = useMemo(() => {
    if (!photos) return [];

    const groups: { [key: string]: FileItem[] } = {};
    
    photos.forEach(photo => {
      // Use exif_date if available, otherwise created_at
      const timestamp = photo.exif_date || photo.created_at;
      const date = new Date(timestamp);
      const monthYear = date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long' 
      });
      
      if (!groups[monthYear]) {
        groups[monthYear] = [];
      }
      groups[monthYear].push(photo);
    });

    // Sort groups by date (newest first)
    return Object.entries(groups)
      .map(([date, photos]) => ({ date, photos }))
      .sort((a, b) => new Date(b.photos[0].exif_date || b.photos[0].created_at).getTime() - 
                     new Date(a.photos[0].exif_date || a.photos[0].created_at).getTime());
  }, [photos]);

  const handlePhotoClick = (photo: FileItem) => {
    if (selectMode) {
      const newSelected = new Set(selectedPhotos);
      if (newSelected.has(photo.id)) {
        newSelected.delete(photo.id);
      } else {
        newSelected.add(photo.id);
      }
      setSelectedPhotos(newSelected);
    } else {
      // Open image viewer
      window.location.href = `/files/${photo.folder_id}?file=${photo.id}`;
    }
  };

  const handleLongPress = (photo: FileItem) => {
    setSelectMode(true);
    setSelectedPhotos(new Set([photo.id]));
  };

  const handleSelectAll = () => {
    if (!photos) return;
    setSelectedPhotos(new Set(photos.map(p => p.id)));
  };

  const handleDeselectAll = () => {
    setSelectedPhotos(new Set());
    setSelectMode(false);
  };

  const handleDownloadSelected = () => {
    // Implementation would trigger download of selected photos
    console.log('Download selected:', Array.from(selectedPhotos));
  };

  const handleShareSelected = () => {
    // Implementation would open share dialog for selected photos
    console.log('Share selected:', Array.from(selectedPhotos));
  };

  const handleDeleteSelected = () => {
    if (confirm(`Delete ${selectedPhotos.size} selected photos?`)) {
      // Implementation would delete selected photos
      console.log('Delete selected:', Array.from(selectedPhotos));
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-surface-600 dark:text-surface-400">Loading photos...</div>
      </div>
    );
  }

  if (!photos || photos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState
          icon={<Image className="w-12 h-12" />}
          title="No photos found"
          description="Upload some images to see them here"
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-surface-200 dark:border-surface-700">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
            Photos
          </h1>
          <p className="text-sm text-surface-600 dark:text-surface-400 mt-1">
            {photos.length} photos
          </p>
        </div>

        {selectMode && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-surface-600 dark:text-surface-400">
              {selectedPhotos.size} selected
            </span>
            <Button onClick={handleSelectAll} variant="secondary" size="sm">
              Select All
            </Button>
            <Button onClick={handleDeselectAll} variant="secondary" size="sm">
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Selection toolbar */}
      {selectMode && selectedPhotos.size > 0 && (
        <div className="flex items-center gap-2 p-4 bg-brand-50 dark:bg-brand-900/20 border-b border-surface-200 dark:border-surface-700">
          <Button onClick={handleDownloadSelected} variant="secondary" size="sm">
            <Download className="w-4 h-4" />
            Download
          </Button>
          <Button onClick={handleShareSelected} variant="secondary" size="sm">
            <Share2 className="w-4 h-4" />
            Share
          </Button>
          <Button onClick={handleDeleteSelected} variant="danger" size="sm">
            <Trash2 className="w-4 h-4" />
            Delete
          </Button>
        </div>
      )}

      {/* Photo grid */}
      <div className="flex-1 overflow-auto p-6">
        {photoGroups.map(group => (
          <div key={group.date} className="mb-8">
            <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4">
              {group.date}
            </h2>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {group.photos.map(photo => (
                <div
                  key={photo.id}
                  className="relative aspect-square group cursor-pointer"
                  onClick={() => handlePhotoClick(photo)}
                  onTouchStart={() => {
                    // Simple long press detection for mobile
                    const timer = setTimeout(() => handleLongPress(photo), 500);
                    const cleanup = () => clearTimeout(timer);
                    document.addEventListener('touchend', cleanup, { once: true });
                    document.addEventListener('touchmove', cleanup, { once: true });
                  }}
                >
                  {/* Photo thumbnail */}
                  <img
                    src={`/api/files/${photo.id}/thumbnail?size=200`}
                    alt={photo.name}
                    className="w-full h-full object-cover rounded-lg bg-surface-100 dark:bg-surface-800"
                    loading="lazy"
                  />

                  {/* Selection overlay */}
                  {selectMode && (
                    <div className="absolute inset-0 bg-black/20 rounded-lg flex items-center justify-center">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        selectedPhotos.has(photo.id)
                          ? 'bg-brand-500 border-brand-500'
                          : 'border-white bg-black/20'
                      }`}>
                        {selectedPhotos.has(photo.id) && (
                          <Check className="w-4 h-4 text-white" />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Hover overlay with info */}
                  {!selectMode && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg">
                      <div className="absolute bottom-2 left-2 right-2 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="text-xs font-medium truncate">
                          {photo.name}
                        </div>
                        <div className="text-xs opacity-75">
                          {formatFileSize(photo.size)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}