import React, { useRef, useEffect, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { 
  Play, Pause, Volume2, VolumeX, Maximize, Settings, RotateCcw
} from 'lucide-react';
import { apiClient } from '../../api/client';

interface VideoPlayerProps {
  fileId: string;
  fileName: string;
  onClose?: () => void;
}

interface VideoMetadata {
  width?: number;
  height?: number;
  duration_seconds?: number;
  fps?: number;
  codec?: string;
  bitrate?: number;
  processing_status?: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ fileId, fileName, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const positionSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [availableQualities, setAvailableQualities] = useState<string[]>([]);
  const [currentQuality, setCurrentQuality] = useState<string>('auto');
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hlsUrl = `/api/stream/${fileId}/master.m3u8`;
  const posterUrl = `/api/files/${fileId}/poster`;
  const fallbackUrl = `/api/stream/${fileId}/direct`;

  // Fetch video metadata
  const fetchMetadata = useCallback(async () => {
    try {
      const response = await apiClient.get(`/api/files/${fileId}/metadata`);
      if (response.data) {
        setMetadata(response.data);
      }
    } catch (error) {
      console.warn('Failed to fetch video metadata:', error);
      // Set basic metadata from video element when available
    }
  }, [fileId]);

  useEffect(() => {
    fetchMetadata();
    initializePlayer();
    setupKeyboardShortcuts();
    
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      if (positionSaveTimeoutRef.current) {
        clearTimeout(positionSaveTimeoutRef.current);
      }
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [fileId, fetchMetadata]);

  // Auto-hide controls
  useEffect(() => {
    if (showControls && isPlaying) {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
    
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [showControls, isPlaying]);

  // Auto-save position
  useEffect(() => {
    if (currentTime > 0 && duration > 0) {
      if (positionSaveTimeoutRef.current) {
        clearTimeout(positionSaveTimeoutRef.current);
      }
      positionSaveTimeoutRef.current = setTimeout(() => {
        savePosition(currentTime);
      }, 10000); // Save every 10 seconds
    }
  }, [currentTime, duration]);

  const savePosition = async (seconds: number) => {
    try {
      await apiClient.post(`/api/stream/${fileId}/position`, {
        seconds,
        duration
      });
    } catch (err) {
      console.error('Failed to save position:', err);
    }
  };

  const setupKeyboardShortcuts = () => {
    document.addEventListener('keydown', handleKeyPress);
  };

  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    if (showSettings || showKeyboardHelp) return;

    const video = videoRef.current;
    if (!video) return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        togglePlay();
        break;
      case 'KeyF':
        e.preventDefault();
        toggleFullscreen();
        break;
      case 'KeyM':
        e.preventDefault();
        toggleMute();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        skip(-10);
        break;
      case 'ArrowRight':
        e.preventDefault();
        skip(10);
        break;
      case 'ArrowUp':
        e.preventDefault();
        adjustVolume(0.1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        adjustVolume(-0.1);
        break;
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
      case 'Digit5':
      case 'Digit6':
      case 'Digit7':
      case 'Digit8':
      case 'Digit9':
        e.preventDefault();
        const percent = parseInt(e.code.slice(-1)) * 10;
        seekToPercent(percent);
        break;
      case 'Digit0':
        e.preventDefault();
        seekToPercent(0);
        break;
      case 'Slash':
        if (e.shiftKey) {
          e.preventDefault();
          setShowKeyboardHelp(true);
        }
        break;
      case 'Escape':
        e.preventDefault();
        if (isFullscreen) {
          toggleFullscreen();
        } else if (showKeyboardHelp) {
          setShowKeyboardHelp(false);
        } else {
          onClose?.();
        }
        break;
    }
  }, [isFullscreen, showKeyboardHelp, showSettings]);

  const skip = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    
    video.currentTime = Math.max(0, Math.min(video.currentTime + seconds, duration));
  };

  const adjustVolume = (delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    
    const newVolume = Math.max(0, Math.min(1, volume + delta));
    video.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const seekToPercent = (percent: number) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    
    const time = (percent / 100) * duration;
    video.currentTime = time;
    setCurrentTime(time);
  };

  const initializePlayer = () => {
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: false, // Disable worker for Pi compatibility
        lowLatencyMode: false,
        backBufferLength: 30
      });

      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setLoading(false);
        const qualities = data.levels.map(level => `${level.height}p`);
        setAvailableQualities(['auto', ...qualities]);
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        console.error('HLS error:', data);
        if (data.fatal) {
          setError('Video streaming failed. Trying direct download...');
          // Fallback to direct video
          video.src = fallbackUrl;
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = hlsUrl;
      setLoading(false);
    } else {
      // Fallback to direct video
      video.src = fallbackUrl;
      setLoading(false);
    }

    // Video event listeners
    video.addEventListener('loadedmetadata', () => {
      setDuration(video.duration);
    });

    video.addEventListener('timeupdate', () => {
      setCurrentTime(video.currentTime);
    });

    video.addEventListener('play', () => setIsPlaying(true));
    video.addEventListener('pause', () => setIsPlaying(false));
    video.addEventListener('ended', () => setIsPlaying(false));
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const time = parseFloat(e.target.value);
    video.currentTime = time;
    setCurrentTime(time);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const vol = parseFloat(e.target.value);
    video.volume = vol;
    setVolume(vol);
    setIsMuted(vol === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isMuted) {
      video.volume = volume;
      setIsMuted(false);
    } else {
      video.volume = 0;
      setIsMuted(true);
    }
  };

  const toggleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;

    if (!isFullscreen) {
      if (video.requestFullscreen) {
        video.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
    setIsFullscreen(!isFullscreen);
  };

  const changeQuality = (quality: string) => {
    if (!hlsRef.current) return;

    if (quality === 'auto') {
      hlsRef.current.currentLevel = -1;
    } else {
      const levelIndex = hlsRef.current.levels.findIndex(
        level => `${level.height}p` === quality
      );
      if (levelIndex !== -1) {
        hlsRef.current.currentLevel = levelIndex;
      }
    }
    setCurrentQuality(quality);
    setShowSettings(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const restart = () => {
    const video = videoRef.current;
    if (!video) return;
    
    video.currentTime = 0;
    video.play();
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
      <div className="relative w-full h-full flex flex-col">
        {/* Video container */}
        <div 
          className="flex-1 relative flex items-center justify-center"
          onMouseEnter={() => setShowControls(true)}
          onMouseLeave={() => setShowControls(false)}
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <div className="text-center text-white">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                <p>Loading video...</p>
                {metadata?.processing_status === 'processing' && (
                  <p className="text-sm text-gray-300 mt-2">Processing video for streaming...</p>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <div className="text-center text-white">
                <p className="text-red-400 mb-4">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          <video
            ref={videoRef}
            className="max-w-full max-h-full"
            poster={posterUrl}
            controls={false}
            onClick={togglePlay}
          />

          {/* Controls overlay */}
          {showControls && !loading && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4">
              <div className="flex items-center space-x-4">
                {/* Play/Pause */}
                <button
                  onClick={togglePlay}
                  className="text-white hover:text-gray-300"
                >
                  {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                </button>

                {/* Restart */}
                <button
                  onClick={restart}
                  className="text-white hover:text-gray-300"
                >
                  <RotateCcw size={20} />
                </button>

                {/* Progress bar */}
                <div className="flex-1 flex items-center space-x-2">
                  <span className="text-white text-sm">{formatTime(currentTime)}</span>
                  <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    value={currentTime}
                    onChange={handleSeek}
                    className="flex-1 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-white text-sm">{formatTime(duration)}</span>
                </div>

                {/* Volume */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={toggleMute}
                    className="text-white hover:text-gray-300"
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
                    className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {/* Settings */}
                <div className="relative">
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="text-white hover:text-gray-300"
                  >
                    <Settings size={20} />
                  </button>
                  
                  {showSettings && (
                    <div className="absolute bottom-full right-0 mb-2 bg-black bg-opacity-90 rounded p-2 min-w-32">
                      <div className="text-white text-sm mb-2">Quality</div>
                      {availableQualities.map(quality => (
                        <button
                          key={quality}
                          onClick={() => changeQuality(quality)}
                          className={`block w-full text-left px-2 py-1 text-sm rounded hover:bg-gray-700 ${
                            currentQuality === quality ? 'bg-blue-600' : 'text-gray-300'
                          }`}
                        >
                          {quality}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Fullscreen */}
                <button
                  onClick={toggleFullscreen}
                  className="text-white hover:text-gray-300"
                >
                  <Maximize size={20} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Video info */}
        {metadata && (
          <div className="bg-gray-900 text-white p-4 text-sm">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-medium">{fileName}</h3>
                <div className="text-gray-400 mt-1">
                  {metadata.width && metadata.height && (
                    <span>{metadata.width} × {metadata.height} • </span>
                  )}
                  {metadata.fps && (
                    <span>{metadata.fps.toFixed(1)} fps • </span>
                  )}
                  {metadata.codec && (
                    <span>{metadata.codec.toUpperCase()} • </span>
                  )}
                  {metadata.duration_seconds && (
                    <span>{formatTime(metadata.duration_seconds)}</span>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white text-xl"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default VideoPlayer;