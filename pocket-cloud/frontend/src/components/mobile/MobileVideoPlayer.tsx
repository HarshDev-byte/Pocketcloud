import React, { useRef, useState, useEffect, useCallback } from 'react';
import Hls from 'hls.js';
import { useMobileGestures } from '../../hooks/useMobileGestures';

interface MobileVideoPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  onClose?: () => void;
  autoPlay?: boolean;
}

interface VideoQuality {
  height: number;
  label: string;
  url: string;
}

export const MobileVideoPlayer: React.FC<MobileVideoPlayerProps> = ({
  src,
  poster,
  title,
  onClose,
  autoPlay = false
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [qualities, setQualities] = useState<VideoQuality[]>([]);
  const [currentQuality, setCurrentQuality] = useState<VideoQuality | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);

  const controlsTimeoutRef = useRef<NodeJS.Timeout>();

  // Load saved playback position
  useEffect(() => {
    const savedPosition = localStorage.getItem(`video-position-${src}`);
    if (savedPosition) {
      setPlaybackPosition(parseFloat(savedPosition));
    }
  }, [src]);

  // Initialize HLS player
  useEffect(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;

    if (Hls.isSupported() && src.includes('.m3u8')) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90
      });

      hls.loadSource(src);
      hls.attachMedia(video);
      
      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        // Extract quality levels
        const levels = data.levels.map((level, index) => ({
          height: level.height,
          label: `${level.height}p`,
          url: level.url[0] || src
        }));
        
        setQualities(levels);
        setCurrentQuality(levels[levels.length - 1]); // Start with highest quality
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS Error:', data);
        if (data.fatal) {
          // Fallback to native video
          video.src = src;
        }
      });

      hlsRef.current = hls;
    } else {
      // Native video support
      video.src = src;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [src]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      if (playbackPosition > 0) {
        video.currentTime = playbackPosition;
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      // Save position every 5 seconds
      if (Math.floor(video.currentTime) % 5 === 0) {
        localStorage.setItem(`video-position-${src}`, video.currentTime.toString());
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleWaiting = () => setIsBuffering(true);
    const handleCanPlay = () => setIsBuffering(false);
    const handleVolumeChange = () => setVolume(video.volume);

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('volumechange', handleVolumeChange);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('volumechange', handleVolumeChange);
    };
  }, [src, playbackPosition]);

  // Auto-hide controls
  useEffect(() => {
    if (showControls && isPlaying) {
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

  // Mobile gestures
  const { gestures } = useMobileGestures({
    onSwipeLeft: () => seek(10),
    onSwipeRight: () => seek(-10)
  });

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  const seek = (seconds: number) => {
    if (!videoRef.current) return;
    
    const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleProgressClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current) return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;
    
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      if (!isFullscreen) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  };

  const adjustVolume = (delta: number) => {
    if (!videoRef.current) return;
    
    const newVolume = Math.max(0, Math.min(1, volume + delta));
    videoRef.current.volume = newVolume;
    setVolume(newVolume);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleDoubleTap = (event: React.MouseEvent) => {
    const rect = videoRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clickX = event.clientX - rect.left;
    const isLeftSide = clickX < rect.width / 2;
    
    seek(isLeftSide ? -10 : 10);
    
    // Show seek indicator
    setShowControls(true);
  };

  const handleVolumeGesture = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    const startY = touch.clientY;
    
    const handleTouchMove = (e: TouchEvent) => {
      const currentY = e.touches[0].clientY;
      const deltaY = startY - currentY;
      const volumeDelta = deltaY / 200; // Adjust sensitivity
      
      adjustVolume(volumeDelta);
    };

    const handleTouchEnd = () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };

    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);
  };

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 bg-black z-50 flex items-center justify-center"
      onClick={() => setShowControls(!showControls)}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        poster={poster}
        autoPlay={autoPlay}
        playsInline
        webkit-playsinline="true"
        x-webkit-airplay="allow"
        onDoubleClick={handleDoubleTap}
        onTouchStart={handleVolumeGesture}
        {...gestures.pinchZoomGesture()}
      />

      {/* Loading Spinner */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        </div>
      )}

      {/* Controls Overlay */}
      <div className={`absolute inset-0 transition-opacity duration-300 ${
        showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}>
        {/* Top Bar */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-4 pt-safe-top">
          <div className="flex items-center justify-between">
            <button
              onClick={onClose}
              className="text-white p-2 hover:bg-white/20 rounded-full"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {title && (
              <h1 className="text-white font-medium truncate mx-4">{title}</h1>
            )}

            {/* Quality Selector */}
            {qualities.length > 1 && (
              <div className="relative">
                <button className="text-white bg-black/50 px-3 py-1 rounded text-sm">
                  {currentQuality?.label || 'Auto'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Center Play Button */}
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={togglePlayPause}
              className="bg-white/20 backdrop-blur-sm rounded-full p-6 hover:bg-white/30 transition-colors"
            >
              <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>
          </div>
        )}

        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 pb-safe-bottom">
          {/* Progress Bar */}
          <div 
            className="w-full h-1 bg-white/30 rounded-full mb-4 cursor-pointer"
            onClick={handleProgressClick}
          >
            <div 
              className="h-full bg-white rounded-full transition-all"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={togglePlayPause}
                className="text-white p-2 hover:bg-white/20 rounded-full"
              >
                {isPlaying ? (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>

              <button
                onClick={() => seek(-10)}
                className="text-white p-2 hover:bg-white/20 rounded-full"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
                </svg>
              </button>

              <button
                onClick={() => seek(10)}
                className="text-white p-2 hover:bg-white/20 rounded-full"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
                </svg>
              </button>
            </div>

            <div className="flex items-center space-x-2 text-white text-sm">
              <span>{formatTime(currentTime)}</span>
              <span>/</span>
              <span>{formatTime(duration)}</span>
            </div>

            <div className="flex items-center space-x-2">
              {/* Volume Indicator */}
              <div className="text-white text-sm">
                {Math.round(volume * 100)}%
              </div>

              {/* AirPlay Button (iOS) */}
              <button className="text-white p-2 hover:bg-white/20 rounded-full">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 22h12l-6-6-6 6zM21 3H3c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h4v-2H3V5h18v10h-4v2h4c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
                </svg>
              </button>

              <button
                onClick={toggleFullscreen}
                className="text-white p-2 hover:bg-white/20 rounded-full"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};