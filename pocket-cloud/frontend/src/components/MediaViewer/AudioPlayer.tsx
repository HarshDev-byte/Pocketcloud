import React, { useRef, useEffect, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward, Repeat, Shuffle } from 'lucide-react';
import { apiClient } from '../../api/client';

interface AudioPlayerProps {
  fileId: string;
  fileName: string;
  onClose?: () => void;
}

interface AudioMetadata {
  duration_seconds?: number;
  bitrate?: number;
  sample_rate?: number;
  codec?: string;
  artist?: string;
  album?: string;
  title?: string;
  processing_status?: string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ fileId, fileName, onClose }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationRef = useRef<number>();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [metadata, setMetadata] = useState<AudioMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const audioUrl = `/api/files/${fileId}/download`;
  const albumArtUrl = `/api/files/${fileId}/thumbnail?size=md`;

  useEffect(() => {
    loadMetadata();
    initializeAudio();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [fileId]);

  const loadMetadata = async () => {
    try {
      const response = await apiClient.get(`/api/files/${fileId}/info`);
      setMetadata(response.data);
    } catch (err) {
      console.error('Failed to load audio metadata:', err);
    }
  };

  const initializeAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.src = audioUrl;

    // Audio event listeners
    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
      setLoading(false);
      initializeVisualizer();
    });

    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
    });

    audio.addEventListener('play', () => {
      setIsPlaying(true);
      startVisualization();
    });

    audio.addEventListener('pause', () => {
      setIsPlaying(false);
      stopVisualization();
    });

    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      if (!isLooping) {
        setCurrentTime(0);
      }
    });

    audio.addEventListener('error', () => {
      setError('Failed to load audio file');
      setLoading(false);
    });
  };

  const initializeVisualizer = () => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;

    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      sourceRef.current = audioContextRef.current.createMediaElementSource(audio);
      
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination);
      
      analyserRef.current.fftSize = 256;
    } catch (err) {
      console.error('Failed to initialize audio visualizer:', err);
    }
  };

  const startVisualization = () => {
    if (!analyserRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isPlaying) return;

      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = 'rgb(15, 23, 42)'; // slate-900
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height * 0.8;

        // Create gradient
        const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        gradient.addColorStop(0, '#3b82f6'); // blue-500
        gradient.addColorStop(1, '#1e40af'); // blue-700

        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
  };

  const stopVisualization = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (isPlaying) {
        audio.pause();
      } else {
        // Resume audio context if suspended
        if (audioContextRef.current?.state === 'suspended') {
          await audioContextRef.current.resume();
        }
        await audio.play();
      }
    } catch (err) {
      console.error('Playback error:', err);
      setError('Playback failed');
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

  const skipBackward = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, audio.currentTime - 10);
  };

  const skipForward = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(duration, audio.currentTime + 10);
  };

  const toggleLoop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    
    audio.loop = !isLooping;
    setIsLooping(!isLooping);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatBitrate = (bitrate?: number) => {
    if (!bitrate) return 'Unknown';
    return `${Math.round(bitrate / 1000)} kbps`;
  };

  const formatSampleRate = (sampleRate?: number) => {
    if (!sampleRate) return 'Unknown';
    return `${(sampleRate / 1000).toFixed(1)} kHz`;
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 to-slate-800 z-50 flex items-center justify-center">
      <div className="w-full max-w-4xl mx-auto p-8">
        {loading && (
          <div className="text-center text-white">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p>Loading audio...</p>
          </div>
        )}

        {error && (
          <div className="text-center text-white">
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && (
          <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-2xl p-8 text-white">
            {/* Header */}
            <div className="flex justify-between items-start mb-8">
              <div className="flex items-center space-x-6">
                {/* Album art */}
                <div className="w-24 h-24 bg-gray-700 rounded-lg overflow-hidden flex-shrink-0">
                  <img
                    src={albumArtUrl}
                    alt="Album art"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>

                {/* Track info */}
                <div>
                  <h2 className="text-2xl font-bold mb-2">
                    {metadata?.title || fileName}
                  </h2>
                  {metadata?.artist && (
                    <p className="text-lg text-gray-300 mb-1">{metadata.artist}</p>
                  )}
                  {metadata?.album && (
                    <p className="text-gray-400">{metadata.album}</p>
                  )}
                </div>
              </div>

              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            {/* Visualizer */}
            <div className="mb-8">
              <canvas
                ref={canvasRef}
                width={800}
                height={200}
                className="w-full h-32 rounded-lg bg-slate-900"
              />
            </div>

            {/* Progress bar */}
            <div className="mb-6">
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
            <div className="flex items-center justify-center space-x-6 mb-6">
              <button
                onClick={toggleLoop}
                className={`hover:text-gray-300 ${isLooping ? 'text-blue-400' : 'text-white'}`}
              >
                <Repeat size={20} />
              </button>

              <button
                onClick={skipBackward}
                className="text-white hover:text-gray-300"
              >
                <SkipBack size={24} />
              </button>

              <button
                onClick={togglePlay}
                className="bg-blue-600 hover:bg-blue-700 rounded-full p-4 text-white"
              >
                {isPlaying ? <Pause size={32} /> : <Play size={32} />}
              </button>

              <button
                onClick={skipForward}
                className="text-white hover:text-gray-300"
              >
                <SkipForward size={24} />
              </button>

              <button className="text-white hover:text-gray-300">
                <Shuffle size={20} />
              </button>
            </div>

            {/* Volume and metadata */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
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
                  className="w-24 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="text-sm text-gray-400 space-x-4">
                {metadata?.codec && (
                  <span>{metadata.codec.toUpperCase()}</span>
                )}
                {metadata?.bitrate && (
                  <span>{formatBitrate(metadata.bitrate)}</span>
                )}
                {metadata?.sample_rate && (
                  <span>{formatSampleRate(metadata.sample_rate)}</span>
                )}
              </div>
            </div>
          </div>
        )}

        <audio ref={audioRef} />
      </div>
    </div>
  );
};