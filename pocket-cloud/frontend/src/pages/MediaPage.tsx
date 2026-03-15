import React, { useState, useEffect } from 'react';
import { Play, Clock, Film, Tv, Music, Camera, Search, Filter } from 'lucide-react';
import { apiClient } from '../api/client';
import { VideoPlayer } from '../components/MediaViewer/VideoPlayer';
import { MusicPlayer } from '../components/MusicPlayer';

interface MediaFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  position?: number;
  duration?: number;
  lastPlayed?: string;
  progressPercent?: number;
  thumbnailUrl?: string;
  posterUrl?: string;
  width?: number;
  height?: number;
}

interface MediaSection {
  title: string;
  items: MediaFile[];
  type: 'continue' | 'movies' | 'episodes' | 'music' | 'photos';
}

export const MediaPage: React.FC = () => {
  const [sections, setSections] = useState<MediaSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<MediaFile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [showMusicPlayer, setShowMusicPlayer] = useState(false);
  const [currentPlaylist, setCurrentPlaylist] = useState<MediaFile[]>([]);

  useEffect(() => {
    loadMediaSections();
  }, []);

  const loadMediaSections = async () => {
    try {
      setLoading(true);
      
      // Load different media sections
      const [continueWatching, recentVideos, allFiles] = await Promise.all([
        apiClient.get('/api/stream/continue'),
        apiClient.get('/api/stream/recent?limit=20'),
        apiClient.get('/api/files?type=media&limit=100')
      ]);

      const sections: MediaSection[] = [];

      // Continue Watching section
      if (continueWatching.data.length > 0) {
        sections.push({
          title: 'Continue Watching',
          items: continueWatching.data,
          type: 'continue'
        });
      }

      // Categorize media files
      const mediaFiles = allFiles.data.files || [];
      
      // Movies (videos > 60 minutes)
      const movies = mediaFiles.filter((file: any) => 
        file.mime_type?.startsWith('video/') && 
        (file.duration_seconds || 0) > 3600
      );
      
      if (movies.length > 0) {
        sections.push({
          title: 'Movies',
          items: movies.map(formatMediaFile),
          type: 'movies'
        });
      }

      // TV Episodes (videos < 60 minutes or with episode naming)
      const episodes = mediaFiles.filter((file: any) => 
        file.mime_type?.startsWith('video/') && 
        ((file.duration_seconds || 0) <= 3600 || /S\d+E\d+/i.test(file.name))
      );
      
      if (episodes.length > 0) {
        sections.push({
          title: 'TV Episodes',
          items: episodes.map(formatMediaFile),
          type: 'episodes'
        });
      }

      // Music
      const music = mediaFiles.filter((file: any) => 
        file.mime_type?.startsWith('audio/')
      );
      
      if (music.length > 0) {
        sections.push({
          title: 'Music',
          items: music.map(formatMediaFile),
          type: 'music'
        });
      }

      // Photos
      const photos = mediaFiles.filter((file: any) => 
        file.mime_type?.startsWith('image/')
      );
      
      if (photos.length > 0) {
        sections.push({
          title: 'Photos',
          items: photos.slice(0, 20).map(formatMediaFile), // Limit photos for performance
          type: 'photos'
        });
      }

      setSections(sections);
    } catch (error) {
      console.error('Failed to load media sections:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatMediaFile = (file: any): MediaFile => ({
    fileId: file.id,
    fileName: file.name,
    mimeType: file.mime_type,
    size: file.size,
    createdAt: file.created_at,
    duration: file.duration_seconds,
    thumbnailUrl: `/api/files/${file.id}/thumbnail?size=sm`,
    posterUrl: `/api/files/${file.id}/poster`,
    width: file.width,
    height: file.height
  });

  const handlePlayVideo = (file: MediaFile) => {
    setSelectedVideo(file);
  };

  const handlePlayMusic = (file: MediaFile, playlist?: MediaFile[]) => {
    setCurrentPlaylist(playlist || [file]);
    setShowMusicPlayer(true);
  };

  const getQualityBadge = (file: MediaFile) => {
    if (!file.width || !file.height) return null;
    
    if (file.height >= 2160) return '4K';
    if (file.height >= 1080) return '1080p';
    if (file.height >= 720) return '720p';
    if (file.height >= 480) return '480p';
    return 'SD';
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const filteredSections = sections.filter(section => {
    if (filterType === 'all') return true;
    return section.type === filterType;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Loading your media library...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Media Library</h1>
          
          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search movies, shows, music..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="pl-10 pr-8 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
              >
                <option value="all">All Media</option>
                <option value="continue">Continue Watching</option>
                <option value="movies">Movies</option>
                <option value="episodes">TV Shows</option>
                <option value="music">Music</option>
                <option value="photos">Photos</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      {/* Media Sections */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {filteredSections.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <Film size={64} className="mx-auto mb-4" />
              <p className="text-xl">No media files found</p>
              <p className="text-sm mt-2">Upload some videos, music, or photos to get started</p>
            </div>
          </div>
        ) : (
          filteredSections.map((section) => (
            <div key={section.title} className="mb-12">
              <div className="flex items-center mb-6">
                {section.type === 'continue' && <Clock className="mr-2" size={24} />}
                {section.type === 'movies' && <Film className="mr-2" size={24} />}
                {section.type === 'episodes' && <Tv className="mr-2" size={24} />}
                {section.type === 'music' && <Music className="mr-2" size={24} />}
                {section.type === 'photos' && <Camera className="mr-2" size={24} />}
                <h2 className="text-2xl font-semibold">{section.title}</h2>
                <span className="ml-3 text-gray-400">({section.items.length})</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {section.items
                  .filter(item => 
                    searchQuery === '' || 
                    item.fileName.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((item) => (
                    <MediaCard
                      key={item.fileId}
                      file={item}
                      sectionType={section.type}
                      onPlayVideo={handlePlayVideo}
                      onPlayMusic={handlePlayMusic}
                      getQualityBadge={getQualityBadge}
                      formatDuration={formatDuration}
                    />
                  ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Video Player Modal */}
      {selectedVideo && (
        <VideoPlayer
          fileId={selectedVideo.fileId}
          fileName={selectedVideo.fileName}
          onClose={() => setSelectedVideo(null)}
        />
      )}

      {/* Music Player */}
      {showMusicPlayer && (
        <MusicPlayer
          playlist={currentPlaylist}
          onClose={() => setShowMusicPlayer(false)}
        />
      )}
    </div>
  );
};

interface MediaCardProps {
  file: MediaFile;
  sectionType: string;
  onPlayVideo: (file: MediaFile) => void;
  onPlayMusic: (file: MediaFile, playlist?: MediaFile[]) => void;
  getQualityBadge: (file: MediaFile) => string | null;
  formatDuration: (seconds?: number) => string;
}

const MediaCard: React.FC<MediaCardProps> = ({
  file,
  sectionType,
  onPlayVideo,
  onPlayMusic,
  getQualityBadge,
  formatDuration
}) => {
  const isVideo = file.mimeType.startsWith('video/');
  const isAudio = file.mimeType.startsWith('audio/');
  const isImage = file.mimeType.startsWith('image/');

  const handleClick = () => {
    if (isVideo) {
      onPlayVideo(file);
    } else if (isAudio) {
      onPlayMusic(file);
    }
    // For images, could open in lightbox
  };

  return (
    <div 
      className="group relative bg-gray-800 rounded-lg overflow-hidden cursor-pointer transform transition-all duration-200 hover:scale-105 hover:bg-gray-700"
      onClick={handleClick}
    >
      {/* Thumbnail/Poster */}
      <div className="aspect-video relative overflow-hidden">
        {file.thumbnailUrl ? (
          <img
            src={file.thumbnailUrl}
            alt={file.fileName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gray-700 flex items-center justify-center">
            {isVideo && <Film className="text-gray-500" size={32} />}
            {isAudio && <Music className="text-gray-500" size={32} />}
            {isImage && <Camera className="text-gray-500" size={32} />}
          </div>
        )}

        {/* Play Button Overlay */}
        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 flex items-center justify-center transition-all duration-200">
          <Play 
            className="text-white opacity-0 group-hover:opacity-100 transform scale-75 group-hover:scale-100 transition-all duration-200" 
            size={48} 
            fill="white"
          />
        </div>

        {/* Quality Badge */}
        {isVideo && getQualityBadge(file) && (
          <div className="absolute top-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
            {getQualityBadge(file)}
          </div>
        )}

        {/* Progress Bar for Continue Watching */}
        {sectionType === 'continue' && file.progressPercent && (
          <div className="absolute bottom-0 left-0 right-0 bg-gray-900 bg-opacity-75">
            <div className="h-1 bg-gray-600">
              <div 
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${file.progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* File Info */}
      <div className="p-3">
        <h3 className="font-medium text-sm truncate mb-1" title={file.fileName}>
          {file.fileName.replace(/\.[^/.]+$/, '')} {/* Remove extension */}
        </h3>
        
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>{formatDuration(file.duration)}</span>
          {sectionType === 'continue' && file.progressPercent && (
            <span>{file.progressPercent}% watched</span>
          )}
        </div>

        {/* Resume Button for Continue Watching */}
        {sectionType === 'continue' && (
          <div className="mt-2 text-xs text-blue-400">
            ▶ Resume at {formatDuration(file.position)}
          </div>
        )}
      </div>
    </div>
  );
};