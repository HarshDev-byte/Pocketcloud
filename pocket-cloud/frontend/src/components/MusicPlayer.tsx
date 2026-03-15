import React, { useRef, useEffect, useState } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, 
  Repeat, Shuffle, List, ChevronUp, ChevronDown, X 
} from 'lucide-react';

interface MediaFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  duration?: number;
  thumbnailUrl?: string;
  artist?: string;
  album?: string;
  title?: string;
}

interface MusicPlayerProps {
  playlist: MediaFile[];
  onClose: () => void;
  initialTrack?: number;
}

export const MusicPlayer: React.FC<MusicPlayerProps> = ({ 
  playlist, 
  onClose, 
  initialTrack = 0 
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(initialTrack);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isShuffled, setIsShuffled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [showQueue, setShowQueue] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const currentTrack = playlist[currentTrackIndex];

  useEffect(() => {
    if (currentTrack) {
      loadTrack(currentTrack);
    }
  }, [currentTrackIndex]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => handleTrackEnd();
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleLoadStart = () => setLoading(true);
    const handleCanPlay = () => setLoading(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, []);

  const loadTrack = (track: MediaFile) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.src = `/api/files/${track.fileId}/download`;
    audio.load();
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  };

  const handleTrackEnd = () => {
    if (repeatMode === 'one') {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play();
      }
      return;
    }

    if (repeatMode === 'all' || currentTrackIndex < playlist.length - 1) {
      nextTrack();
    } else {
      setIsPlaying(false);
    }
  };

  const nextTrack = () => {
    if (isShuffled) {
      const randomIndex = Math.floor(Math.random() * playlist.length);
      setCurrentTrackIndex(randomIndex);
    } else {
      setCurrentTrackIndex((prev) => 
        prev < playlist.length - 1 ? prev + 1 : (repeatMode === 'all' ? 0 : prev)
      );
    }
  };

  const previousTrack = () => {
    if (currentTime > 3) {
      // If more than 3 seconds played, restart current track
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
      }
    } else {
      setCurrentTrackIndex((prev) => 
        prev > 0 ? prev - 1 : (repeatMode === 'all' ? playlist.length - 1 : prev)
      );
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const time = parseFloat(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const vol = parseFloat(e.target.value);
    audio.volume = vol;
    setVolume(vol);
    setIsMuted(vol === 0);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isMuted) {
      audio.volume = volume;
      setIsMuted(false);
    } else {
      audio.volume = 0;
      setIsMuted(true);
    }
  };

  const toggleShuffle = () => {
    setIsShuffled(!isShuffled);
  };

  const toggleRepeat = () => {
    const modes: Array<'off' | 'all' | 'one'> = ['off', 'all', 'one'];
    const currentIndex = modes.indexOf(repeatMode);
    setRepeatMode(modes[(currentIndex + 1) % modes.length]);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTrackTitle = (track: MediaFile) => {
    return track.title || track.fileName.replace(/\.[^/.]+$/, '');
  };

  const getTrackArtist = (track: MediaFile) => {
    return track.artist || 'Unknown Artist';
  };

  if (!currentTrack) {
    return null;
  }

  return (
    <>
      <audio ref={audioRef} preload="metadata" />
      
      {/* Compact Player Bar */}
      <div className={`fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 transition-all duration-300 ${
        isExpanded ? 'h-screen' : 'h-20'
      } z-50`}>
        
        {isExpanded ? (
          /* Full Player View */
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <button
                onClick={() => setIsExpanded(false)}
                className="text-gray-400 hover:text-white"
              >
                <ChevronDown size={24} />
              </button>
              <h2 className="text-lg font-semibold text-white">Now Playing</h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            {/* Album Art and Info */}
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="w-64 h-64 bg-gray-800 rounded-lg mb-6 overflow-hidden">
                {currentTrack.thumbnailUrl ? (
                  <img
                    src={currentTrack.thumbnailUrl}
                    alt={getTrackTitle(currentTrack)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Volume2 className="text-gray-500" size={64} />
                  </div>
                )}
              </div>

              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-white mb-2">
                  {getTrackTitle(currentTrack)}
                </h3>
                <p className="text-lg text-gray-400">
                  {getTrackArtist(currentTrack)}
                </p>
                {currentTrack.album && (
                  <p className="text-sm text-gray-500 mt-1">
                    {currentTrack.album}
                  </p>
                )}
              </div>

              {/* Progress Bar */}
              <div className="w-full max-w-md mb-8">
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-sm text-gray-400 mt-2">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center space-x-6 mb-8">
                <button
                  onClick={toggleShuffle}
                  className={`${isShuffled ? 'text-blue-400' : 'text-gray-400'} hover:text-white`}
                >
                  <Shuffle size={24} />
                </button>

                <button
                  onClick={previousTrack}
                  className="text-white hover:text-gray-300"
                >
                  <SkipBack size={32} />
                </button>

                <button
                  onClick={togglePlay}
                  className="bg-white text-black rounded-full p-3 hover:bg-gray-200"
                  disabled={loading}
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-black" />
                  ) : isPlaying ? (
                    <Pause size={32} />
                  ) : (
                    <Play size={32} />
                  )}
                </button>

                <button
                  onClick={nextTrack}
                  className="text-white hover:text-gray-300"
                >
                  <SkipForward size={32} />
                </button>

                <button
                  onClick={toggleRepeat}
                  className={`${repeatMode !== 'off' ? 'text-blue-400' : 'text-gray-400'} hover:text-white relative`}
                >
                  <Repeat size={24} />
                  {repeatMode === 'one' && (
                    <span className="absolute -top-1 -right-1 text-xs bg-blue-400 text-white rounded-full w-4 h-4 flex items-center justify-center">
                      1
                    </span>
                  )}
                </button>
              </div>

              {/* Volume */}
              <div className="flex items-center space-x-3">
                <button
                  onClick={toggleMute}
                  className="text-gray-400 hover:text-white"
                >
                  {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-24 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>
        ) : (
          /* Compact Player Bar */
          <div className="h-20 flex items-center px-4">
            {/* Track Info */}
            <div 
              className="flex items-center flex-1 cursor-pointer"
              onClick={() => setIsExpanded(true)}
            >
              <div className="w-12 h-12 bg-gray-800 rounded overflow-hidden mr-3">
                {currentTrack.thumbnailUrl ? (
                  <img
                    src={currentTrack.thumbnailUrl}
                    alt={getTrackTitle(currentTrack)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Volume2 className="text-gray-500" size={20} />
                  </div>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">
                  {getTrackTitle(currentTrack)}
                </p>
                <p className="text-gray-400 text-sm truncate">
                  {getTrackArtist(currentTrack)}
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center space-x-4">
              <button
                onClick={previousTrack}
                className="text-gray-400 hover:text-white"
              >
                <SkipBack size={20} />
              </button>

              <button
                onClick={togglePlay}
                className="bg-white text-black rounded-full p-2 hover:bg-gray-200"
                disabled={loading}
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black" />
                ) : isPlaying ? (
                  <Pause size={20} />
                ) : (
                  <Play size={20} />
                )}
              </button>

              <button
                onClick={nextTrack}
                className="text-gray-400 hover:text-white"
              >
                <SkipForward size={20} />
              </button>

              <button
                onClick={() => setShowQueue(!showQueue)}
                className="text-gray-400 hover:text-white"
              >
                <List size={20} />
              </button>

              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Queue Panel */}
        {showQueue && !isExpanded && (
          <div className="absolute bottom-20 right-4 w-80 max-h-96 bg-gray-800 rounded-lg shadow-lg overflow-hidden">
            <div className="p-3 border-b border-gray-700">
              <h3 className="text-white font-medium">Queue ({playlist.length})</h3>
            </div>
            <div className="overflow-y-auto max-h-80">
              {playlist.map((track, index) => (
                <div
                  key={track.fileId}
                  className={`p-3 hover:bg-gray-700 cursor-pointer ${
                    index === currentTrackIndex ? 'bg-gray-700' : ''
                  }`}
                  onClick={() => setCurrentTrackIndex(index)}
                >
                  <p className="text-white text-sm truncate">
                    {getTrackTitle(track)}
                  </p>
                  <p className="text-gray-400 text-xs truncate">
                    {getTrackArtist(track)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
};