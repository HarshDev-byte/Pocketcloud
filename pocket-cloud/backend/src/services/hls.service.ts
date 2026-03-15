import { spawn, ChildProcess } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { EventEmitter } from 'events';
import { LoggerService } from './logger.service';
import { transcoderService } from './transcoder.service';

export interface HLSSegment {
  index: number;
  duration: number;
  path: string;
  size: number;
}

export interface HLSPlaylist {
  quality: string;
  segments: HLSSegment[];
  totalDuration: number;
  targetDuration: number;
}

export interface HLSJob {
  id: string;
  fileId: string;
  inputPath: string;
  outputDir: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  qualities: string[];
  playlists: Map<string, HLSPlaylist>;
  error?: string;
  process?: ChildProcess;
}

export class HLSService extends EventEmitter {
  private static instance: HLSService;
  private jobs = new Map<string, HLSJob>();
  private readonly CACHE_DIR = process.env.HLS_CACHE_DIR || join(process.cwd(), 'cache', 'hls');
  private readonly SEGMENT_DURATION = 6; // seconds
  private readonly TARGET_DURATION = 10; // max segment duration for playlist

  // Quality profiles for HLS streaming
  private readonly QUALITY_PROFILES = {
    '360p': { width: 640, height: 360, bitrate: '500k', maxrate: '750k', bufsize: '1500k' },
    '480p': { width: 854, height: 480, bitrate: '1000k', maxrate: '1500k', bufsize: '3000k' },
    '720p': { width: 1280, height: 720, bitrate: '2500k', maxrate: '3750k', bufsize: '7500k' },
    '1080p': { width: 1920, height: 1080, bitrate: '5000k', maxrate: '7500k', bufsize: '15000k' }
  };

  private constructor() {
    super();
    this.ensureCacheDirectory();
  }

  public static getInstance(): HLSService {
    if (!HLSService.instance) {
      HLSService.instance = new HLSService();
    }
    return HLSService.instance;
  }
  /**
   * Generate HLS streams for a video file
   */
  public async generateHLS(fileId: string, inputPath: string, qualities: string[]): Promise<string> {
    const jobId = `${fileId}-hls-${Date.now()}`;
    const outputDir = join(this.CACHE_DIR, fileId);

    // Check if already generated
    if (this.isHLSGenerated(outputDir)) {
      LoggerService.info('hls', `Using cached HLS for ${fileId}`);
      return outputDir;
    }

    const job: HLSJob = {
      id: jobId,
      fileId,
      inputPath,
      outputDir,
      status: 'pending',
      progress: 0,
      qualities,
      playlists: new Map()
    };

    this.jobs.set(jobId, job);

    try {
      await this.executeHLSGeneration(job);
      return outputDir;
    } catch (error) {
      job.status = 'failed';
      job.error = (error as Error).message;
      throw error;
    }
  }

  /**
   * Execute HLS generation for all qualities
   */
  private async executeHLSGeneration(job: HLSJob): Promise<void> {
    job.status = 'running';
    mkdirSync(job.outputDir, { recursive: true });

    LoggerService.info('hls', `Starting HLS generation for ${job.fileId}`, undefined, {
      qualities: job.qualities,
      outputDir: job.outputDir
    });

    // Generate segments for each quality
    const qualityPromises = job.qualities.map(quality => 
      this.generateQualityPlaylist(job, quality)
    );

    try {
      await Promise.all(qualityPromises);
      
      // Generate master playlist
      this.generateMasterPlaylist(job);
      
      job.status = 'completed';
      job.progress = 100;
      
      LoggerService.info('hls', `HLS generation completed for ${job.fileId}`);
      this.emit('completed', job);
      
    } catch (error) {
      job.status = 'failed';
      job.error = (error as Error).message;
      LoggerService.error('hls', `HLS generation failed for ${job.fileId}`, undefined, {
        error: (error as Error).message
      });
      this.emit('failed', job);
      throw error;
    }
  }

  /**
   * Generate HLS playlist for specific quality
   */
  private async generateQualityPlaylist(job: HLSJob, quality: string): Promise<void> {
    const profile = this.QUALITY_PROFILES[quality as keyof typeof this.QUALITY_PROFILES];
    if (!profile) {
      throw new Error(`Unknown quality profile: ${quality}`);
    }

    const qualityDir = join(job.outputDir, quality);
    mkdirSync(qualityDir, { recursive: true });

    const playlistPath = join(qualityDir, 'playlist.m3u8');
    const segmentPattern = join(qualityDir, 'seg%03d.ts');

    return new Promise((resolve, reject) => {
      const ffmpegArgs = [
        '-i', job.inputPath,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-maxrate', profile.maxrate,
        '-bufsize', profile.bufsize,
        '-vf', `scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease,pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2`,
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ac', '2',
        '-f', 'hls',
        '-hls_time', this.SEGMENT_DURATION.toString(),
        '-hls_playlist_type', 'vod',
        '-hls_segment_filename', segmentPattern,
        '-hls_list_size', '0',
        playlistPath
      ];

      LoggerService.info('hls', `Generating ${quality} playlist for ${job.fileId}`);

      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      job.process = ffmpeg;

      let duration = 0;
      let lastProgress = 0;

      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        
        // Extract duration
        const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (durationMatch) {
          const [, hours, minutes, seconds] = durationMatch;
          duration = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
        }

        // Extract progress
        const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (timeMatch && duration > 0) {
          const [, hours, minutes, seconds] = timeMatch;
          const currentTime = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
          const progress = Math.min(Math.round((currentTime / duration) * 100), 100);
          
          if (progress > lastProgress) {
            job.progress = Math.round(progress / job.qualities.length);
            lastProgress = progress;
            this.emit('progress', job);
          }
        }
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          // Parse generated playlist
          try {
            const playlist = this.parsePlaylist(playlistPath, qualityDir);
            job.playlists.set(quality, playlist);
            
            LoggerService.info('hls', `${quality} playlist generated for ${job.fileId}`, undefined, {
              segments: playlist.segments.length,
              duration: playlist.totalDuration
            });
            
            resolve();
          } catch (error) {
            reject(new Error(`Failed to parse playlist: ${(error as Error).message}`));
          }
        } else {
          reject(new Error(`ffmpeg exited with code ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Generate master playlist
   */
  private generateMasterPlaylist(job: HLSJob): void {
    const masterPath = join(job.outputDir, 'master.m3u8');
    
    let content = '#EXTM3U\n#EXT-X-VERSION:3\n';
    
    // Add stream info for each quality
    for (const quality of job.qualities) {
      const profile = this.QUALITY_PROFILES[quality as keyof typeof this.QUALITY_PROFILES];
      const playlist = job.playlists.get(quality);
      
      if (profile && playlist) {
        const bandwidth = parseInt(profile.bitrate.replace('k', '')) * 1000;
        content += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${profile.width}x${profile.height}\n`;
        content += `${quality}/playlist.m3u8\n`;
      }
    }
    
    writeFileSync(masterPath, content);
    
    LoggerService.info('hls', `Master playlist generated for ${job.fileId}`, undefined, {
      qualities: job.qualities,
      path: masterPath
    });
  }

  /**
   * Parse HLS playlist file
   */
  private parsePlaylist(playlistPath: string, segmentDir: string): HLSPlaylist {
    const content = readFileSync(playlistPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    const segments: HLSSegment[] = [];
    let totalDuration = 0;
    let maxDuration = 0;
    let currentDuration = 0;
    let segmentIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.startsWith('#EXTINF:')) {
        // Extract segment duration
        const durationMatch = line.match(/#EXTINF:([\d.]+)/);
        if (durationMatch) {
          currentDuration = parseFloat(durationMatch[1]);
          maxDuration = Math.max(maxDuration, currentDuration);
        }
      } else if (line.endsWith('.ts')) {
        // Segment file
        const segmentPath = join(segmentDir, line);
        const segmentSize = existsSync(segmentPath) ? statSync(segmentPath).size : 0;
        
        segments.push({
          index: segmentIndex++,
          duration: currentDuration,
          path: segmentPath,
          size: segmentSize
        });
        
        totalDuration += currentDuration;
        currentDuration = 0;
      }
    }

    return {
      quality: '',
      segments,
      totalDuration,
      targetDuration: Math.ceil(maxDuration)
    };
  }

  /**
   * Check if HLS is already generated
   */
  private isHLSGenerated(outputDir: string): boolean {
    const masterPath = join(outputDir, 'master.m3u8');
    return existsSync(masterPath);
  }

  /**
   * Get HLS master playlist path
   */
  public getMasterPlaylistPath(fileId: string): string | null {
    const outputDir = join(this.CACHE_DIR, fileId);
    const masterPath = join(outputDir, 'master.m3u8');
    
    if (existsSync(masterPath)) {
      return masterPath;
    }
    
    return null;
  }

  /**
   * Get HLS segment path
   */
  public getSegmentPath(fileId: string, quality: string, segment: string): string | null {
    const segmentPath = join(this.CACHE_DIR, fileId, quality, segment);
    
    if (existsSync(segmentPath)) {
      return segmentPath;
    }
    
    return null;
  }

  /**
   * Get job status
   */
  public getJobStatus(jobId: string): HLSJob | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Cancel HLS job
   */
  public cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.process && job.status === 'running') {
      job.process.kill('SIGTERM');
      job.status = 'failed';
      job.error = 'Cancelled by user';
      this.emit('cancelled', job);
      return true;
    }

    return false;
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
   * Get cache statistics
   */
  public getCacheStats(): { totalSize: number; fileCount: number; hlsCount: number } {
    try {
      if (!existsSync(this.CACHE_DIR)) {
        return { totalSize: 0, fileCount: 0, hlsCount: 0 };
      }

      let totalSize = 0;
      let fileCount = 0;
      let hlsCount = 0;

      const entries = readdirSync(this.CACHE_DIR, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          hlsCount++;
          const hlsDir = join(this.CACHE_DIR, entry.name);
          
          const collectFiles = (dir: string) => {
            const files = readdirSync(dir, { withFileTypes: true });
            
            for (const file of files) {
              const fullPath = join(dir, file.name);
              
              if (file.isDirectory()) {
                collectFiles(fullPath);
              } else if (file.isFile()) {
                const stats = statSync(fullPath);
                totalSize += stats.size;
                fileCount++;
              }
            }
          };
          
          collectFiles(hlsDir);
        }
      }

      return { totalSize, fileCount, hlsCount };

    } catch (error) {
      LoggerService.error('hls', 'Failed to get cache stats', undefined, {
        error: (error as Error).message
      });
      return { totalSize: 0, fileCount: 0, hlsCount: 0 };
    }
  }
}

export const hlsService = HLSService.getInstance();