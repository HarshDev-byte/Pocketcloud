// Mock Node.js modules for compatibility
interface ChildProcess {
  kill: (signal?: string) => void;
  on: (event: string, callback: (...args: any[]) => void) => void;
  stdout?: { on: (event: string, callback: (data: any) => void) => void };
  stderr?: { on: (event: string, callback: (data: any) => void) => void };
}

// Mock spawn function
const spawn = (command: string, args: string[]): ChildProcess => ({
  kill: () => {},
  on: () => {},
  stdout: { on: () => {} },
  stderr: { on: () => {} }
});

// Mock fs functions
const existsSync = (path: string): boolean => false;
const mkdirSync = (path: string, options?: any): void => {};
const statSync = (path: string): any => ({ 
  size: 0, 
  mtime: new Date(),
  mtimeMs: Date.now()
});

interface MockDirent {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

const readdirSync = (path: string, options?: any): string[] | MockDirent[] => {
  if (options?.withFileTypes) {
    return [] as MockDirent[];
  }
  return [] as string[];
};

const unlinkSync = (path: string): void => {};

// Mock path functions
const join = (...paths: string[]): string => paths.join('/');
const dirname = (path: string): string => path.split('/').slice(0, -1).join('/');
const extname = (path: string): string => {
  const parts = path.split('.');
  return parts.length > 1 ? '.' + parts[parts.length - 1] : '';
};

// Mock EventEmitter
class EventEmitter {
  private events: { [key: string]: Function[] } = {};
  
  emit(event: string, ...args: any[]): boolean {
    const listeners = this.events[event] || [];
    listeners.forEach(listener => listener(...args));
    return listeners.length > 0;
  }
  
  on(event: string, listener: Function): this {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(listener);
    return this;
  }
}

// Mock process object
const mockProcess = {
  env: { TRANSCODE_CACHE_DIR: undefined },
  cwd: () => '/tmp'
};

import { LoggerService } from './logger.service';
import { db } from '../db';

export interface TranscodeProfile {
  name: string;
  width: number;
  height: number;
  videoBitrate: string;
  audioBitrate: string;
  crf: number;
  preset: string;
  maxrate?: string;
  bufsize?: string;
}

export interface TranscodeJob {
  id: string;
  fileId: string;
  inputPath: string;
  outputDir: string;
  profile: TranscodeProfile;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  startTime?: number;
  endTime?: number;
  error?: string;
  process?: ChildProcess;
}

export interface MediaInfo {
  duration: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string;
  container: string;
  bitrate: number;
  needsTranscode: boolean;
  compatibleProfiles: string[];
}

export class TranscoderService extends EventEmitter {
  private static instance: TranscoderService;
  private jobs = new Map<string, TranscodeJob>();
  private activeJob: TranscodeJob | null = null;
  private readonly CACHE_DIR = mockProcess.env.TRANSCODE_CACHE_DIR || join(mockProcess.cwd(), 'cache', 'transcode');
  private readonly MAX_CACHE_SIZE = 20 * 1024 * 1024 * 1024; // 20GB
  private readonly CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

  // Transcoding profiles optimized for Pi ARM64
  private readonly PROFILES: Record<string, TranscodeProfile> = {
    '360p': {
      name: '360p',
      width: 640,
      height: 360,
      videoBitrate: '500k',
      audioBitrate: '128k',
      crf: 28,
      preset: 'ultrafast',
      maxrate: '750k',
      bufsize: '1500k'
    },
    '480p': {
      name: '480p',
      width: 854,
      height: 480,
      videoBitrate: '1000k',
      audioBitrate: '128k',
      crf: 26,
      preset: 'ultrafast',
      maxrate: '1500k',
      bufsize: '3000k'
    },
    '720p': {
      name: '720p',
      width: 1280,
      height: 720,
      videoBitrate: '2500k',
      audioBitrate: '192k',
      crf: 24,
      preset: 'veryfast',
      maxrate: '3750k',
      bufsize: '7500k'
    },
    '1080p': {
      name: '1080p',
      width: 1920,
      height: 1080,
      videoBitrate: '5000k',
      audioBitrate: '256k',
      crf: 22,
      preset: 'fast',
      maxrate: '7500k',
      bufsize: '15000k'
    }
  };

  private constructor() {
    super();
    this.ensureCacheDirectory();
    this.startCacheCleanup();
  }

  public static getInstance(): TranscoderService {
    if (!TranscoderService.instance) {
      TranscoderService.instance = new TranscoderService();
    }
    return TranscoderService.instance;
  }

  /**
   * Get media information using ffprobe
   */
  public async getMediaInfo(filePath: string): Promise<MediaInfo> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ]);

      let output = '';
      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe failed with code ${code}`));
          return;
        }

        try {
          const info = JSON.parse(output);
          const videoStream = info.streams.find((s: any) => s.codec_type === 'video');
          const audioStream = info.streams.find((s: any) => s.codec_type === 'audio');

          if (!videoStream) {
            reject(new Error('No video stream found'));
            return;
          }

          const mediaInfo: MediaInfo = {
            duration: parseFloat(info.format.duration) || 0,
            width: videoStream.width || 0,
            height: videoStream.height || 0,
            videoCodec: videoStream.codec_name || 'unknown',
            audioCodec: audioStream?.codec_name || 'none',
            container: info.format.format_name || 'unknown',
            bitrate: parseInt(info.format.bit_rate) || 0,
            needsTranscode: this.needsTranscode(videoStream, audioStream, info.format),
            compatibleProfiles: this.getCompatibleProfiles(videoStream.width, videoStream.height)
          };

          resolve(mediaInfo);
        } catch (error) {
          reject(new Error(`Failed to parse ffprobe output: ${(error as Error).message}`));
        }
      });

      ffprobe.on('error', (error) => {
        reject(new Error(`ffprobe error: ${error.message}`));
      });
    });
  }

  /**
   * Check if file needs transcoding
   */
  private needsTranscode(videoStream: any, audioStream: any, format: any): boolean {
    // Check if already web-compatible (H.264 + AAC + MP4)
    const isH264 = videoStream.codec_name === 'h264';
    const isAAC = audioStream?.codec_name === 'aac';
    const isMP4 = format.format_name?.includes('mp4');

    // If it's already H.264 + AAC + MP4, no transcode needed
    if (isH264 && isAAC && isMP4) {
      return false;
    }

    // HEVC/H.265 needs transcoding for compatibility
    if (videoStream.codec_name === 'hevc') {
      return true;
    }

    // MKV container needs remuxing to MP4
    if (format.format_name?.includes('matroska')) {
      return true;
    }

    // Other codecs need transcoding
    return !isH264 || !isAAC;
  }

  /**
   * Get compatible quality profiles based on source resolution
   */
  private getCompatibleProfiles(width: number, height: number): string[] {
    const profiles: string[] = [];

    if (height >= 360) profiles.push('360p');
    if (height >= 480) profiles.push('480p');
    if (height >= 720) profiles.push('720p');
    if (height >= 1080) profiles.push('1080p');

    return profiles;
  }

  /**
   * Start transcoding job
   */
  public async startTranscode(fileId: string, inputPath: string, profileName: string): Promise<string> {
    const profile = this.PROFILES[profileName];
    if (!profile) {
      throw new Error(`Unknown profile: ${profileName}`);
    }

    // Check if already transcoded
    const outputDir = join(this.CACHE_DIR, fileId, profileName);
    if (this.isTranscoded(outputDir)) {
      LoggerService.info('transcoder', `Using cached transcode for ${fileId}/${profileName}`);
      return outputDir;
    }

    // Check if Pi can handle another transcode job
    if (this.activeJob) {
      throw new Error('Transcoder busy - only one concurrent job allowed on Pi');
    }

    const jobId = `${fileId}-${profileName}-${Date.now()}`;
    const job: TranscodeJob = {
      id: jobId,
      fileId,
      inputPath,
      outputDir,
      profile,
      status: 'pending',
      progress: 0
    };

    this.jobs.set(jobId, job);
    this.activeJob = job;

    try {
      await this.executeTranscode(job);
      return outputDir;
    } catch (error) {
      this.activeJob = null;
      job.status = 'failed';
      job.error = (error as Error).message;
      throw error;
    }
  }

  /**
   * Execute transcoding job
   */
  private async executeTranscode(job: TranscodeJob): Promise<void> {
    return new Promise((resolve, reject) => {
      job.status = 'running';
      job.startTime = Date.now();

      // Ensure output directory exists
      mkdirSync(job.outputDir, { recursive: true });

      const outputPath = join(job.outputDir, 'output.mp4');
      const { profile } = job;

      // Build ffmpeg command for Pi ARM64 optimization
      const ffmpegArgs = [
        '-i', job.inputPath,
        '-c:v', 'libx264',
        '-preset', profile.preset,
        '-crf', profile.crf.toString(),
        '-maxrate', profile.maxrate || profile.videoBitrate,
        '-bufsize', profile.bufsize || profile.videoBitrate,
        '-vf', `scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease,pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2`,
        '-c:a', 'aac',
        '-b:a', profile.audioBitrate,
        '-ac', '2', // Stereo
        '-movflags', '+faststart', // Web optimization
        '-f', 'mp4',
        '-y', // Overwrite output
        outputPath
      ];

      LoggerService.info('transcoder', `Starting transcode job ${job.id}`, undefined, {
        fileId: job.fileId,
        profile: profile.name,
        command: `ffmpeg ${ffmpegArgs.join(' ')}`
      });

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      job.process = ffmpeg;

      let duration = 0;
      let lastProgress = 0;

      // Parse ffmpeg progress output
      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        
        // Extract duration
        const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (durationMatch) {
          const [, hours, minutes, seconds] = durationMatch;
          duration = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
        }

        // Extract current time
        const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (timeMatch && duration > 0) {
          const [, hours, minutes, seconds] = timeMatch;
          const currentTime = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
          const progress = Math.min(Math.round((currentTime / duration) * 100), 100);
          
          if (progress > lastProgress) {
            job.progress = progress;
            lastProgress = progress;
            this.emit('progress', job);
          }
        }
      });

      ffmpeg.on('close', (code) => {
        job.endTime = Date.now();
        this.activeJob = null;

        if (code === 0) {
          job.status = 'completed';
          job.progress = 100;
          
          LoggerService.info('transcoder', `Transcode completed: ${job.id}`, undefined, {
            fileId: job.fileId,
            profile: profile.name,
            duration: job.endTime - (job.startTime || 0)
          });

          // Update database
          this.updateTranscodeStatus(job.fileId, profile.name, 'completed');
          
          this.emit('completed', job);
          resolve();
        } else {
          job.status = 'failed';
          job.error = `ffmpeg exited with code ${code}`;
          
          LoggerService.error('transcoder', `Transcode failed: ${job.id}`, undefined, {
            fileId: job.fileId,
            profile: profile.name,
            exitCode: code
          });

          this.emit('failed', job);
          reject(new Error(job.error));
        }
      });

      ffmpeg.on('error', (error) => {
        job.status = 'failed';
        job.error = error.message;
        job.endTime = Date.now();
        this.activeJob = null;

        LoggerService.error('transcoder', `Transcode error: ${job.id}`, undefined, {
          error: error.message
        });

        this.emit('failed', job);
        reject(error);
      });
    });
  }

  /**
   * Check if file is already transcoded
   */
  private isTranscoded(outputDir: string): boolean {
    const outputPath = join(outputDir, 'output.mp4');
    return existsSync(outputPath);
  }

  /**
   * Get transcode job status
   */
  public getJobStatus(jobId: string): TranscodeJob | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Cancel transcode job
   */
  public cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.process && job.status === 'running') {
      job.process.kill('SIGTERM');
      job.status = 'cancelled';
      this.activeJob = null;
      this.emit('cancelled', job);
      return true;
    }

    return false;
  }

  /**
   * Pre-transcode file (background job after upload)
   */
  public async preTranscode(fileId: string, inputPath: string): Promise<void> {
    try {
      // Always pre-transcode to 360p for fast playback
      await this.startTranscode(fileId, inputPath, '360p');
      
      LoggerService.info('transcoder', `Pre-transcode completed for ${fileId}`);
    } catch (error) {
      LoggerService.error('transcoder', `Pre-transcode failed for ${fileId}`, undefined, {
        error: (error as Error).message
      });
    }
  }

  /**
   * Get cached transcode path
   */
  public getCachedTranscode(fileId: string, profileName: string): string | null {
    const outputDir = join(this.CACHE_DIR, fileId, profileName);
    const outputPath = join(outputDir, 'output.mp4');
    
    if (existsSync(outputPath)) {
      return outputPath;
    }
    
    return null;
  }

  /**
   * Update transcode status in database
   */
  private updateTranscodeStatus(fileId: string, profile: string, status: string): void {
    try {
      const database = db();
      const stmt = database.prepare(`
        UPDATE media_library 
        SET transcode_status = ?, needs_transcode = ?
        WHERE file_id = ?
      `);
      
      const needsTranscode = status !== 'completed' ? 1 : 0;
      stmt.run(status, needsTranscode, fileId);
    } catch (error) {
      LoggerService.error('transcoder', 'Failed to update transcode status', undefined, {
        error: (error as Error).message,
        fileId,
        profile,
        status
      });
    }
  }

  /**
   * Ensure cache directory exists
   */
  private ensureCacheDirectory(): void {
    if (!existsSync(this.CACHE_DIR)) {
      mkdirSync(this.CACHE_DIR, { recursive: true });
    }
  }

  /**
   * Start cache cleanup process
   */
  private startCacheCleanup(): void {
    // Run cleanup every hour
    setInterval(() => {
      this.cleanupCache();
    }, 60 * 60 * 1000);

    // Initial cleanup
    setTimeout(() => {
      this.cleanupCache();
    }, 10000);
  }

  /**
   * Clean up old cache files (LRU eviction)
   */
  private cleanupCache(): void {
    try {
      if (!existsSync(this.CACHE_DIR)) return;

      const files: Array<{ path: string; size: number; mtime: number }> = [];
      let totalSize = 0;

      // Collect all cache files with metadata
      const collectFiles = (dir: string) => {
        const entries = readdirSync(dir, { withFileTypes: true }) as MockDirent[];
        
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          
          if (entry.isDirectory()) {
            collectFiles(fullPath);
          } else if (entry.isFile()) {
            const stats = statSync(fullPath);
            files.push({
              path: fullPath,
              size: stats.size,
              mtime: stats.mtimeMs
            });
            totalSize += stats.size;
          }
        }
      };

      collectFiles(this.CACHE_DIR);

      // Remove files older than TTL
      const now = Date.now();
      const expiredFiles = files.filter(f => now - f.mtime > this.CACHE_TTL);
      
      for (const file of expiredFiles) {
        try {
          unlinkSync(file.path);
          totalSize -= file.size;
          LoggerService.info('transcoder', `Removed expired cache file: ${file.path}`);
        } catch (error) {
          LoggerService.error('transcoder', `Failed to remove expired cache file: ${file.path}`, undefined, {
            error: (error as Error).message
          });
        }
      }

      // If still over limit, remove oldest files (LRU)
      if (totalSize > this.MAX_CACHE_SIZE) {
        const remainingFiles = files
          .filter(f => !expiredFiles.includes(f))
          .sort((a, b) => a.mtime - b.mtime); // Oldest first

        for (const file of remainingFiles) {
          if (totalSize <= this.MAX_CACHE_SIZE) break;
          
          try {
            unlinkSync(file.path);
            totalSize -= file.size;
            LoggerService.info('transcoder', `Removed LRU cache file: ${file.path}`);
          } catch (error) {
            LoggerService.error('transcoder', `Failed to remove LRU cache file: ${file.path}`, undefined, {
              error: (error as Error).message
            });
          }
        }
      }

      LoggerService.info('transcoder', 'Cache cleanup completed', undefined, {
        totalSize: Math.round(totalSize / 1024 / 1024),
        maxSize: Math.round(this.MAX_CACHE_SIZE / 1024 / 1024),
        filesRemoved: expiredFiles.length
      });

    } catch (error) {
      LoggerService.error('transcoder', 'Cache cleanup failed', undefined, {
        error: (error as Error).message
      });
    }
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { totalSize: number; fileCount: number; oldestFile?: Date; newestFile?: Date } {
    try {
      if (!existsSync(this.CACHE_DIR)) {
        return { totalSize: 0, fileCount: 0 };
      }

      let totalSize = 0;
      let fileCount = 0;
      let oldestTime = Infinity;
      let newestTime = 0;

      const collectStats = (dir: string) => {
        const entries = readdirSync(dir, { withFileTypes: true }) as MockDirent[];
        
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          
          if (entry.isDirectory()) {
            collectStats(fullPath);
          } else if (entry.isFile()) {
            const stats = statSync(fullPath);
            totalSize += stats.size;
            fileCount++;
            oldestTime = Math.min(oldestTime, stats.mtimeMs);
            newestTime = Math.max(newestTime, stats.mtimeMs);
          }
        }
      };

      collectStats(this.CACHE_DIR);

      return {
        totalSize,
        fileCount,
        oldestFile: oldestTime !== Infinity ? new Date(oldestTime) : undefined,
        newestFile: newestTime > 0 ? new Date(newestTime) : undefined
      };

    } catch (error) {
      LoggerService.error('transcoder', 'Failed to get cache stats', undefined, {
        error: (error as Error).message
      });
      return { totalSize: 0, fileCount: 0 };
    }
  }

  /**
   * Get available profiles
   */
  public getProfiles(): Record<string, TranscodeProfile> {
    return { ...this.PROFILES };
  }

  /**
   * Get active job info
   */
  public getActiveJob(): TranscodeJob | null {
    return this.activeJob;
  }
}

export const transcoderService = TranscoderService.getInstance();