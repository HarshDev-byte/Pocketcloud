import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Share2, 
  ZoomIn, 
  ZoomOut, 
  RotateCw,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  FileText,
  File
} from 'lucide-react';
import { FileItem } from '../types/files';

interface FilePreviewProps {
  file: FileItem;
  files: FileItem[];
  onClose: () => void;
  onNavigate: (file: FileItem) => void;
}

const FilePreview: React.FC<FilePreviewProps> = ({
  file,
  files,
  onClose,
  onNavigate,
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [textContent, setTextContent] = useState<string>('');
  const [isLoadingText, setIsLoadingText] = useState(false);

  const currentIndex = files.findIndex(f => f.id === file.id);
  const canNavigatePrev = currentIndex > 0;
  const canNavigateNext = currentIndex < files.length - 1;

  // Get file type category
  const getFileType = useCallback((mimeType: string) => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.startsWith('text/') || 
        mimeType.includes('json') || 
        mimeType.includes('xml') ||
        mimeType.includes('javascript') ||
        mimeType.includes('css')) return 'text';
    return 'other';
  }, []);

  const fileType = getFileType(file.mime_type);

  // Format file size
  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }, []);

  // Format duration
  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Navigation handlers
  const handlePrevious = useCallback(() => {
    if (canNavigatePrev) {
      onNavigate(files[currentIndex - 1]);
    }
  }, [canNavigatePrev, currentIndex, files, onNavigate]);

  const handleNext = useCallback(() => {
    if (canNavigateNext) {
      onNavigate(files[currentIndex + 1]);
    }
  }, [canNavigateNext, currentIndex, files, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          handlePrevious();
          break;
        case 'ArrowRight':
          handleNext();
          break;
        case ' ':
          if (fileType === 'video' || fileType === 'audio') {
            e.preventDefault();
            setIsPlaying(prev => !prev);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handlePrevious, handleNext, fileType]);

  // Load text content for text files
  useEffect(() => {
    if (fileType === 'text') {
      setIsLoadingText(true);
      fetch(`/api/files/${file.id}/download`)
        .then(response => response.text())
        .then(text => {
          setTextContent(text);
          setIsLoadingText(false);
        })
        .catch(error => {
          console.error('Failed to load text content:', error);
          setTextContent('Failed to load file content');
          setIsLoadingText(false);
        });
    }
  }, [file.id, fileType]);

  // Reset state when file changes
  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [file.id]);

  // Zoom handlers for images
  const handleZoomIn = () => setZoom(prev => Math.min(prev * 1.2, 5));
  const handleZoomOut = () => setZoom(prev => Math.max(prev / 1.2, 0.1));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  // Media handlers
  const handlePlayPause = () => setIsPlaying(prev => !prev);
  const handleMute = () => setIsMuted(prev => !prev);

  // Download handler
  const handleDownload = () => {
    window.open(`/api/files/${file.id}/download`, '_blank');
  };

  // Fullscreen handler
  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-black bg-opacity-50 text-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-medium truncate">{file.name}</h2>
            <span className="text-sm text-gray-300">
              {formatFileSize(file.size)} • {currentIndex + 1} of {files.length}
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Image controls */}
            {fileType === 'image' && (
              <>
                <button
                  onClick={handleZoomOut}
                  className="p-2 hover:bg-white hover:bg-opacity-20 rounded"
                  title="Zoom out"
                >
                  <ZoomOut className="w-5 h-5" />
                </button>
                <button
                  onClick={handleZoomIn}
                  className="p-2 hover:bg-white hover:bg-opacity-20 rounded"
                  title="Zoom in"
                >
                  <ZoomIn className="w-5 h-5" />
                </button>
                <button
                  onClick={handleRotate}
                  className="p-2 hover:bg-white hover:bg-opacity-20 rounded"
                  title="Rotate"
                >
                  <RotateCw className="w-5 h-5" />
                </button>
              </>
            )}

            {/* Media controls */}
            {(fileType === 'video' || fileType === 'audio') && (
              <>
                <button
                  onClick={handlePlayPause}
                  className="p-2 hover:bg-white hover:bg-opacity-20 rounded"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </button>
                <button
                  onClick={handleMute}
                  className="p-2 hover:bg-white hover:bg-opacity-20 rounded"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
              </>
            )}

            {/* Common controls */}
            <button
              onClick={handleFullscreen}
              className="p-2 hover:bg-white hover:bg-opacity-20 rounded"
              title="Fullscreen"
            >
              <Maximize className="w-5 h-5" />
            </button>
            <button
              onClick={handleDownload}
              className="p-2 hover:bg-white hover:bg-opacity-20 rounded"
              title="Download"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white hover:bg-opacity-20 rounded"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Navigation arrows */}
      {canNavigatePrev && (
        <button
          onClick={handlePrevious}
          className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 p-3 bg-black bg-opacity-50 text-white hover:bg-opacity-70 rounded-full"
          title="Previous file"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {canNavigateNext && (
        <button
          onClick={handleNext}
          className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 p-3 bg-black bg-opacity-50 text-white hover:bg-opacity-70 rounded-full"
          title="Next file"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Content */}
      <div className="w-full h-full flex items-center justify-center p-16">
        {/* Image preview */}
        {fileType === 'image' && (
          <div className="max-w-full max-h-full overflow-auto">
            <img
              src={`/api/files/${file.id}/download`}
              alt={file.name}
              className="max-w-none transition-transform duration-200"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                cursor: zoom > 1 ? 'grab' : 'default'
              }}
              onLoad={(e) => {
                const img = e.target as HTMLImageElement;
                const containerWidth = window.innerWidth - 128; // Account for padding
                const containerHeight = window.innerHeight - 128;
                const scaleX = containerWidth / img.naturalWidth;
                const scaleY = containerHeight / img.naturalHeight;
                const initialZoom = Math.min(scaleX, scaleY, 1);
                setZoom(initialZoom);
              }}
            />
          </div>
        )}

        {/* Video preview */}
        {fileType === 'video' && (
          <div className="w-full h-full flex items-center justify-center">
            <video
              src={`/api/files/${file.id}/download`}
              controls
              className="max-w-full max-h-full"
              autoPlay={isPlaying}
              muted={isMuted}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
              onLoadedMetadata={(e) => setDuration((e.target as HTMLVideoElement).duration)}
            />
          </div>
        )}

        {/* Audio preview */}
        {fileType === 'audio' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-md w-full">
            <div className="text-center mb-6">
              <div className="w-24 h-24 bg-pcd-blue-100 dark:bg-pcd-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <Volume2 className="w-12 h-12 text-pcd-blue-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{file.name}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{formatFileSize(file.size)}</p>
            </div>
            
            <audio
              src={`/api/files/${file.id}/download`}
              controls
              className="w-full"
              autoPlay={isPlaying}
              muted={isMuted}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={(e) => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
              onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration)}
            />
            
            {duration > 0 && (
              <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            )}
          </div>
        )}

        {/* PDF preview */}
        {fileType === 'pdf' && (
          <div className="w-full h-full">
            <iframe
              src={`/api/files/${file.id}/download`}
              className="w-full h-full border-0"
              title={file.name}
            />
          </div>
        )}

        {/* Text preview */}
        {fileType === 'text' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-4xl w-full max-h-full overflow-auto">
            <div className="flex items-center space-x-3 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
              <FileText className="w-6 h-6 text-pcd-blue-600" />
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">{file.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{formatFileSize(file.size)}</p>
              </div>
            </div>
            
            {isLoadingText ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pcd-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-500 dark:text-gray-400">Loading content...</p>
              </div>
            ) : (
              <pre className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap font-mono overflow-auto">
                {textContent}
              </pre>
            )}
          </div>
        )}

        {/* Other file types */}
        {fileType === 'other' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-md w-full text-center">
            <div className="w-24 h-24 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <File className="w-12 h-12 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{file.name}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{file.mime_type}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{formatFileSize(file.size)}</p>
            
            <div className="space-y-3">
              <p className="text-gray-600 dark:text-gray-400">
                Preview not available for this file type
              </p>
              <button
                onClick={handleDownload}
                className="inline-flex items-center px-4 py-2 bg-pcd-blue-600 text-white rounded-md hover:bg-pcd-blue-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Download File
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FilePreview;