/**
 * Streaming service for media files
 */

import { PocketCloudClient } from './client.js';
import { StreamInfo } from './types.js';

/**
 * Service for streaming media files
 */
export class StreamService {
  constructor(private client: PocketCloudClient) {}

  /**
   * Get streaming URL for a media file
   * 
   * @example
   * ```typescript
   * const streamUrl = client.stream.getUrl('video-file-id');
   * videoElement.src = streamUrl;
   * ```
   */
  getUrl(fileId: string, options: {
    quality?: 'auto' | '240p' | '360p' | '480p' | '720p' | '1080p';
    format?: 'hls' | 'mp4' | 'webm';
  } = {}): string {
    const config = this.client.configuration;
    const params = new URLSearchParams();
    
    if (options.quality) params.set('quality', options.quality);
    if (options.format) params.set('format', options.format);
    if (config.apiKey) params.set('token', config.apiKey);
    
    const query = params.toString();
    return `${this.client.baseUrl}/api/v1/stream/${fileId}${query ? `?${query}` : ''}`;
  }

  /**
   * Get HLS streaming URL for adaptive bitrate streaming
   * 
   * @example
   * ```typescript
   * const hlsUrl = client.stream.getHlsUrl('video-file-id');
   * 
   * // Use with hls.js
   * if (Hls.isSupported()) {
   *   const hls = new Hls();
   *   hls.loadSource(hlsUrl);
   *   hls.attachMedia(videoElement);
   * }
   * ```
   */
  getHlsUrl(fileId: string): string {
    return this.getUrl(fileId, { format: 'hls' });
  }

  /**
   * Get stream information and available qualities
   * 
   * @example
   * ```typescript
   * const info = await client.stream.getInfo('video-file-id');
   * console.log('Available qualities:', info.qualities);
   * console.log('Duration:', info.duration, 'seconds');
   * ```
   */
  async getInfo(fileId: string): Promise<{
    duration: number;
    bitrate: number;
    resolution: { width: number; height: number };
    qualities: Array<{
      quality: string;
      bitrate: number;
      resolution: { width: number; height: number };
      url: string;
    }>;
    formats: Array<{
      format: string;
      mimeType: string;
      url: string;
    }>;
  }> {
    return this.client.request('GET', `/api/v1/stream/${fileId}/info`);
  }

  /**
   * Get thumbnail/poster image for video
   * 
   * @example
   * ```typescript
   * const posterUrl = client.stream.getPosterUrl('video-file-id');
   * videoElement.poster = posterUrl;
   * ```
   */
  getPosterUrl(fileId: string, options: {
    time?: number; // seconds into video
    width?: number;
    height?: number;
  } = {}): string {
    const config = this.client.configuration;
    const params = new URLSearchParams();
    
    if (options.time) params.set('t', options.time.toString());
    if (options.width) params.set('w', options.width.toString());
    if (options.height) params.set('h', options.height.toString());
    if (config.apiKey) params.set('token', config.apiKey);
    
    const query = params.toString();
    return `${this.client.baseUrl}/api/v1/stream/${fileId}/poster${query ? `?${query}` : ''}`;
  }

  /**
   * Generate video thumbnails at specific intervals
   * 
   * @example
   * ```typescript
   * const thumbnails = await client.stream.generateThumbnails('video-file-id', {
   *   interval: 10, // every 10 seconds
   *   width: 160,
   *   height: 90
   * });
   * ```
   */
  async generateThumbnails(fileId: string, options: {
    interval?: number; // seconds
    count?: number;
    width?: number;
    height?: number;
  } = {}): Promise<Array<{
    time: number;
    url: string;
  }>> {
    const params = new URLSearchParams();
    
    if (options.interval) params.set('interval', options.interval.toString());
    if (options.count) params.set('count', options.count.toString());
    if (options.width) params.set('width', options.width.toString());
    if (options.height) params.set('height', options.height.toString());

    const query = params.toString();
    const path = `/api/v1/stream/${fileId}/thumbnails${query ? `?${query}` : ''}`;
    
    return this.client.request('POST', path);
  }

  /**
   * Start transcoding a video to different formats/qualities
   * 
   * @example
   * ```typescript
   * const job = await client.stream.transcode('video-file-id', {
   *   qualities: ['720p', '480p'],
   *   formats: ['mp4', 'webm']
   * });
   * 
   * console.log('Transcoding job ID:', job.id);
   * ```
   */
  async transcode(fileId: string, options: {
    qualities?: string[];
    formats?: string[];
    priority?: 'low' | 'normal' | 'high';
  } = {}): Promise<{
    id: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    progress: number;
    estimatedTime: number;
  }> {
    return this.client.request('POST', `/api/v1/stream/${fileId}/transcode`, options);
  }

  /**
   * Get transcoding job status
   * 
   * @example
   * ```typescript
   * const status = await client.stream.getTranscodeStatus('job-id-123');
   * console.log(`Progress: ${status.progress}%`);
   * ```
   */
  async getTranscodeStatus(jobId: string): Promise<{
    id: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    progress: number;
    estimatedTime: number;
    error?: string;
  }> {
    return this.client.request('GET', `/api/v1/stream/jobs/${jobId}`);
  }

  /**
   * Cancel a transcoding job
   * 
   * @example
   * ```typescript
   * await client.stream.cancelTranscode('job-id-123');
   * ```
   */
  async cancelTranscode(jobId: string): Promise<void> {
    await this.client.request('DELETE', `/api/v1/stream/jobs/${jobId}`);
  }

  /**
   * Get audio waveform data for visualization
   * 
   * @example
   * ```typescript
   * const waveform = await client.stream.getWaveform('audio-file-id');
   * // Use waveform.peaks to draw audio visualization
   * ```
   */
  async getWaveform(fileId: string, options: {
    width?: number; // number of data points
    height?: number; // amplitude scale
  } = {}): Promise<{
    peaks: number[];
    duration: number;
    sampleRate: number;
  }> {
    const params = new URLSearchParams();
    
    if (options.width) params.set('width', options.width.toString());
    if (options.height) params.set('height', options.height.toString());

    const query = params.toString();
    const path = `/api/v1/stream/${fileId}/waveform${query ? `?${query}` : ''}`;
    
    return this.client.request('GET', path);
  }

  /**
   * Create a streaming playlist for multiple files
   * 
   * @example
   * ```typescript
   * const playlist = await client.stream.createPlaylist([
   *   'song1-id',
   *   'song2-id',
   *   'song3-id'
   * ], {
   *   name: 'My Playlist',
   *   shuffle: false
   * });
   * ```
   */
  async createPlaylist(fileIds: string[], options: {
    name?: string;
    shuffle?: boolean;
    repeat?: boolean;
  } = {}): Promise<{
    id: string;
    name: string;
    files: Array<{
      id: string;
      name: string;
      duration: number;
      streamUrl: string;
    }>;
    totalDuration: number;
    m3uUrl: string;
  }> {
    return this.client.request('POST', '/api/v1/stream/playlists', {
      fileIds,
      ...options
    });
  }

  /**
   * Get streaming statistics
   * 
   * @example
   * ```typescript
   * const stats = await client.stream.getStats('video-file-id');
   * console.log(`Viewed ${stats.viewCount} times`);
   * ```
   */
  async getStats(fileId: string): Promise<{
    viewCount: number;
    totalWatchTime: number;
    averageWatchTime: number;
    lastViewed: number;
    popularQualities: Array<{
      quality: string;
      percentage: number;
    }>;
  }> {
    return this.client.request('GET', `/api/v1/stream/${fileId}/stats`);
  }

  /**
   * Record a view/play event
   * 
   * @example
   * ```typescript
   * await client.stream.recordView('video-file-id', {
   *   watchTime: 120, // seconds watched
   *   quality: '720p'
   * });
   * ```
   */
  async recordView(fileId: string, options: {
    watchTime?: number;
    quality?: string;
    userAgent?: string;
  } = {}): Promise<void> {
    await this.client.request('POST', `/api/v1/stream/${fileId}/view`, options);
  }
}