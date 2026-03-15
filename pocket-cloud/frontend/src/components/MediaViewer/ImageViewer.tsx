import React, { useState, useEffect } from 'react';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import { Info, MapPin, Calendar, Camera, Palette } from 'lucide-react';
import { apiClient } from '../../api/client';
import 'react-photo-view/dist/react-photo-view.css';

interface ImageViewerProps {
  fileId: string;
  fileName: string;
  onClose?: () => void;
}

interface ImageMetadata {
  width?: number;
  height?: number;
  exif_date?: number;
  gps_lat?: number;
  gps_lng?: number;
  dominant_color?: string;
  processing_status?: string;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ fileId, fileName, onClose }) => {
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);
  const [showExif, setShowExif] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const imageUrl = `/api/files/${fileId}/thumbnail?size=md`;
  const fullImageUrl = `/api/files/${fileId}/download`;

  useEffect(() => {
    loadMetadata();
  }, [fileId]);

  const loadMetadata = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/api/files/${fileId}/info`);
      setMetadata(response.data);
    } catch (err) {
      console.error('Failed to load image metadata:', err);
      setError('Failed to load image information');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCoordinates = (lat?: number, lng?: number) => {
    if (!lat || !lng) return null;
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  };

  const openInMaps = () => {
    if (metadata?.gps_lat && metadata?.gps_lng) {
      const url = `https://www.google.com/maps?q=${metadata.gps_lat},${metadata.gps_lng}`;
      window.open(url, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center">
      <div className="relative w-full h-full flex">
        {/* Main image area */}
        <div className="flex-1 flex items-center justify-center p-4">
          <PhotoProvider
            maskOpacity={0.8}
            toolbarRender={({ onScale, scale }) => (
              <div className="flex items-center space-x-2 text-white">
                <button
                  onClick={() => onScale(scale + 0.2)}
                  className="px-3 py-1 bg-black bg-opacity-50 rounded hover:bg-opacity-70"
                >
                  Zoom In
                </button>
                <button
                  onClick={() => onScale(scale - 0.2)}
                  className="px-3 py-1 bg-black bg-opacity-50 rounded hover:bg-opacity-70"
                >
                  Zoom Out
                </button>
                <button
                  onClick={() => setShowExif(!showExif)}
                  className="px-3 py-1 bg-black bg-opacity-50 rounded hover:bg-opacity-70 flex items-center space-x-1"
                >
                  <Info size={16} />
                  <span>Info</span>
                </button>
                <button
                  onClick={onClose}
                  className="px-3 py-1 bg-black bg-opacity-50 rounded hover:bg-opacity-70"
                >
                  Close
                </button>
              </div>
            )}
          >
            <PhotoView src={fullImageUrl}>
              <img
                src={imageUrl}
                alt={fileName}
                className="max-w-full max-h-full object-contain cursor-zoom-in"
                style={{
                  backgroundColor: metadata?.dominant_color || 'transparent'
                }}
              />
            </PhotoView>
          </PhotoProvider>
        </div>

        {/* EXIF panel */}
        {showExif && (
          <div className="w-80 bg-gray-900 text-white p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">Image Information</h3>
              <button
                onClick={() => setShowExif(false)}
                className="text-gray-400 hover:text-white"
              >
                ×
              </button>
            </div>

            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
                <p className="mt-2 text-gray-400">Loading metadata...</p>
              </div>
            ) : error ? (
              <div className="text-center py-8 text-red-400">
                <p>{error}</p>
              </div>
            ) : metadata ? (
              <div className="space-y-6">
                {/* Basic info */}
                <div>
                  <h4 className="font-medium mb-2 flex items-center">
                    <Camera size={16} className="mr-2" />
                    Basic Information
                  </h4>
                  <div className="space-y-2 text-sm text-gray-300">
                    <div className="flex justify-between">
                      <span>Filename:</span>
                      <span className="text-right">{fileName}</span>
                    </div>
                    {metadata.width && metadata.height && (
                      <div className="flex justify-between">
                        <span>Dimensions:</span>
                        <span>{metadata.width} × {metadata.height}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Status:</span>
                      <span className={`capitalize ${
                        metadata.processing_status === 'completed' ? 'text-green-400' :
                        metadata.processing_status === 'processing' ? 'text-yellow-400' :
                        metadata.processing_status === 'failed' ? 'text-red-400' :
                        'text-gray-400'
                      }`}>
                        {metadata.processing_status || 'pending'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Date taken */}
                {metadata.exif_date && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center">
                      <Calendar size={16} className="mr-2" />
                      Date Taken
                    </h4>
                    <p className="text-sm text-gray-300">
                      {formatDate(metadata.exif_date)}
                    </p>
                  </div>
                )}

                {/* Location */}
                {metadata.gps_lat && metadata.gps_lng && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center">
                      <MapPin size={16} className="mr-2" />
                      Location
                    </h4>
                    <div className="space-y-2">
                      <p className="text-sm text-gray-300 font-mono">
                        {formatCoordinates(metadata.gps_lat, metadata.gps_lng)}
                      </p>
                      <button
                        onClick={openInMaps}
                        className="text-sm text-blue-400 hover:text-blue-300 underline"
                      >
                        View on Google Maps
                      </button>
                    </div>
                  </div>
                )}

                {/* Dominant color */}
                {metadata.dominant_color && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center">
                      <Palette size={16} className="mr-2" />
                      Dominant Color
                    </h4>
                    <div className="flex items-center space-x-3">
                      <div
                        className="w-8 h-8 rounded border border-gray-600"
                        style={{ backgroundColor: metadata.dominant_color }}
                      ></div>
                      <span className="text-sm text-gray-300 font-mono">
                        {metadata.dominant_color}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <p>No metadata available</p>
              </div>
            )}
          </div>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300 z-10"
        >
          ×
        </button>
      </div>
    </div>
  );
};