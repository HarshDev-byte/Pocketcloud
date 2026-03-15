import { EventEmitter } from 'events';
import { LoggerService } from './logger.service';
import { realtimeService } from './realtime.service';

export interface BandwidthLimits {
  uploadPerUser: number;    // bytes per second
  downloadPerUser: number;  // bytes per second
  streamingPerUser: number; // bytes per second
  globalUpload: number;     // total upload limit
  globalDownload: number;   // total download limit
}

export interface UserBandwidthUsage {
  userId: string;
  uploadBytesPerSec: number;
  downloadBytesPerSec: number;
  streamingBytesPerSec: number;
  lastActivity: number;
}

export interface BandwidthStats {
  global: {
    uploadBytesPerSec: number;
    downloadBytesPerSec: number;
    streamingBytesPerSec: number;
    totalBytesPerSec: number;
    wifiCapacityPercent: number;
  };
  perUser: Map<string, UserBandwidthUsage>;
  activeTransfers: number;
  throttledUsers: Set<string>;
}

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private capacity: number;
  private refillRate: number; // tokens per second

  constructor(rateBytes: number, burstBytes: number) {
    this.capacity = burstBytes;
    this.refillRate = rateBytes;
    this.tokens = burstBytes;
    this.lastRefill = Date.now();
  }

  /**
   * Consume tokens from bucket, waiting if necessary
   */
  public async consume(bytes: number): Promise<void> {
    this.refill();

    if (bytes <= this.tokens) {
      this.tokens -= bytes;
      return;
    }

    // Need to wait for tokens
    const tokensNeeded = bytes - this.tokens;
    const waitTime = (tokensNeeded / this.refillRate) * 1000; // milliseconds

    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    this.refill();
    this.tokens = Math.max(0, this.tokens - bytes);
  }

  /**
   * Check if tokens are available without consuming
   */
  public canConsume(bytes: number): boolean {
    this.refill();
    return bytes <= this.tokens;
  }

  /**
   * Get current token count
   */
  public getTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Update rate limit
   */
  public updateRate(rateBytes: number, burstBytes?: number): void {
    this.refill();
    this.refillRate = rateBytes;
    if (burstBytes !== undefined) {
      this.capacity = burstBytes;
      this.tokens = Math.min(this.tokens, burstBytes);
    }
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000; // seconds
    
    const tokensToAdd = timePassed * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

export class BandwidthService extends EventEmitter {
  private static instance: BandwidthService;
  
  // Default limits (configurable by admin)
  private limits: BandwidthLimits = {
    uploadPerUser: 10 * 1024 * 1024,    // 10 MB/s
    downloadPerUser: 25 * 1024 * 1024,  // 25 MB/s
    streamingPerUser: 5 * 1024 * 1024,  // 5 MB/s
    globalUpload: 50 * 1024 * 1024,     // 50 MB/s total
    globalDownload: 100 * 1024 * 1024   // 100 MB/s total
  };

  // Token buckets per user
  private uploadBuckets = new Map<string, TokenBucket>();
  private downloadBuckets = new Map<string, TokenBucket>();
  private streamingBuckets = new Map<string, TokenBucket>();

  // Global token buckets
  private globalUploadBucket: TokenBucket;
  private globalDownloadBucket: TokenBucket;

  // Usage tracking (sliding window - last 5 seconds)
  private usageHistory = new Map<string, Array<{ timestamp: number; bytes: number; type: 'upload' | 'download' | 'streaming' }>>();
  
  // Bandwidth history for charts (ring buffer - last 24 hours)
  private bandwidthHistory: Array<{ timestamp: number; stats: BandwidthStats }> = [];
  private readonly HISTORY_MAX_SIZE = 24 * 60 * 12; // 5-minute intervals for 24 hours

  // Throttled users (temporary restrictions)
  private throttledUsers = new Set<string>();
  private throttleTimeouts = new Map<string, NodeJS.Timeout>();

  // WiFi capacity estimation (Pi 4 typical: ~50-80 Mbps)
  private readonly WIFI_CAPACITY = 60 * 1024 * 1024; // 60 MB/s estimated capacity

  private constructor() {
    super();
    
    // Initialize global buckets
    this.globalUploadBucket = new TokenBucket(this.limits.globalUpload, this.limits.globalUpload * 2);
    this.globalDownloadBucket = new TokenBucket(this.limits.globalDownload, this.limits.globalDownload * 2);

    // Start monitoring and cleanup
    this.startMonitoring();
    this.startCleanup();
  }

  public static getInstance(): BandwidthService {
    if (!BandwidthService.instance) {
      BandwidthService.instance = new BandwidthService();
    }
    return BandwidthService.instance;
  }

  /**
   * Get or create token bucket for user
   */
  public getUserUploadBucket(userId: string): TokenBucket {
    if (!this.uploadBuckets.has(userId)) {
      const rate = this.throttledUsers.has(userId) 
        ? this.limits.uploadPerUser * 0.5 
        : this.limits.uploadPerUser;
      
      this.uploadBuckets.set(userId, new TokenBucket(rate, rate * 2));
    }
    return this.uploadBuckets.get(userId)!;
  }

  public getUserDownloadBucket(userId: string): TokenBucket {
    if (!this.downloadBuckets.has(userId)) {
      const rate = this.throttledUsers.has(userId) 
        ? this.limits.downloadPerUser * 0.5 
        : this.limits.downloadPerUser;
      
      this.downloadBuckets.set(userId, new TokenBucket(rate, rate * 2));
    }
    return this.downloadBuckets.get(userId)!;
  }

  public getUserStreamingBucket(userId: string): TokenBucket {
    if (!this.streamingBuckets.has(userId)) {
      // Streaming gets higher priority, less affected by throttling
      const rate = this.throttledUsers.has(userId) 
        ? this.limits.streamingPerUser * 0.8 
        : this.limits.streamingPerUser;
      
      this.streamingBuckets.set(userId, new TokenBucket(rate, rate * 3));
    }
    return this.streamingBuckets.get(userId)!;
  }

  /**
   * Consume bandwidth for a user operation
   */
  public async consumeBandwidth(
    userId: string, 
    bytes: number, 
    type: 'upload' | 'download' | 'streaming'
  ): Promise<void> {
    // Skip admin users (unlimited)
    if (await this.isAdminUser(userId)) {
      this.recordUsage(userId, bytes, type);
      return;
    }

    // Get appropriate buckets
    let userBucket: TokenBucket;
    let globalBucket: TokenBucket;

    switch (type) {
      case 'upload':
        userBucket = this.getUserUploadBucket(userId);
        globalBucket = this.globalUploadBucket;
        break;
      case 'download':
        userBucket = this.getUserDownloadBucket(userId);
        globalBucket = this.globalDownloadBucket;
        break;
      case 'streaming':
        userBucket = this.getUserStreamingBucket(userId);
        globalBucket = this.globalDownloadBucket; // Streaming counts as download
        break;
    }

    // Consume from both user and global buckets
    await Promise.all([
      userBucket.consume(bytes),
      globalBucket.consume(bytes)
    ]);

    // Record usage for monitoring
    this.recordUsage(userId, bytes, type);
  }

  /**
   * Record bandwidth usage for monitoring
   */
  private recordUsage(userId: string, bytes: number, type: 'upload' | 'download' | 'streaming'): void {
    if (!this.usageHistory.has(userId)) {
      this.usageHistory.set(userId, []);
    }

    const history = this.usageHistory.get(userId)!;
    history.push({
      timestamp: Date.now(),
      bytes,
      type
    });

    // Keep only last 5 seconds of history
    const cutoff = Date.now() - 5000;
    this.usageHistory.set(userId, history.filter(entry => entry.timestamp > cutoff));
  }

  /**
   * Get current bandwidth usage statistics
   */
  public getCurrentUsage(): BandwidthStats {
    const now = Date.now();
    const cutoff = now - 5000; // Last 5 seconds

    const perUser = new Map<string, UserBandwidthUsage>();
    let globalUpload = 0;
    let globalDownload = 0;
    let globalStreaming = 0;
    let activeTransfers = 0;

    // Calculate per-user usage
    for (const [userId, history] of this.usageHistory) {
      const recentHistory = history.filter(entry => entry.timestamp > cutoff);
      
      if (recentHistory.length === 0) continue;

      let uploadBytes = 0;
      let downloadBytes = 0;
      let streamingBytes = 0;
      let lastActivity = 0;

      for (const entry of recentHistory) {
        switch (entry.type) {
          case 'upload':
            uploadBytes += entry.bytes;
            break;
          case 'download':
            downloadBytes += entry.bytes;
            break;
          case 'streaming':
            streamingBytes += entry.bytes;
            break;
        }
        lastActivity = Math.max(lastActivity, entry.timestamp);
      }

      // Convert to bytes per second (5-second window)
      const uploadBytesPerSec = uploadBytes / 5;
      const downloadBytesPerSec = downloadBytes / 5;
      const streamingBytesPerSec = streamingBytes / 5;

      if (uploadBytesPerSec > 0 || downloadBytesPerSec > 0 || streamingBytesPerSec > 0) {
        perUser.set(userId, {
          userId,
          uploadBytesPerSec,
          downloadBytesPerSec,
          streamingBytesPerSec,
          lastActivity
        });

        globalUpload += uploadBytesPerSec;
        globalDownload += downloadBytesPerSec;
        globalStreaming += streamingBytesPerSec;
        activeTransfers++;
      }
    }

    const totalBytesPerSec = globalUpload + globalDownload + globalStreaming;
    const wifiCapacityPercent = Math.round((totalBytesPerSec / this.WIFI_CAPACITY) * 100);

    const stats: BandwidthStats = {
      global: {
        uploadBytesPerSec: globalUpload,
        downloadBytesPerSec: globalDownload,
        streamingBytesPerSec: globalStreaming,
        totalBytesPerSec,
        wifiCapacityPercent
      },
      perUser,
      activeTransfers,
      throttledUsers: new Set(this.throttledUsers)
    };

    return stats;
  }

  /**
   * Update bandwidth limits (admin only)
   */
  public updateLimits(newLimits: Partial<BandwidthLimits>): void {
    Object.assign(this.limits, newLimits);

    // Update global buckets
    if (newLimits.globalUpload) {
      this.globalUploadBucket.updateRate(newLimits.globalUpload, newLimits.globalUpload * 2);
    }
    if (newLimits.globalDownload) {
      this.globalDownloadBucket.updateRate(newLimits.globalDownload, newLimits.globalDownload * 2);
    }

    // Update existing user buckets
    for (const [userId, bucket] of this.uploadBuckets) {
      const rate = this.throttledUsers.has(userId) 
        ? this.limits.uploadPerUser * 0.5 
        : this.limits.uploadPerUser;
      bucket.updateRate(rate, rate * 2);
    }

    for (const [userId, bucket] of this.downloadBuckets) {
      const rate = this.throttledUsers.has(userId) 
        ? this.limits.downloadPerUser * 0.5 
        : this.limits.downloadPerUser;
      bucket.updateRate(rate, rate * 2);
    }

    for (const [userId, bucket] of this.streamingBuckets) {
      const rate = this.throttledUsers.has(userId) 
        ? this.limits.streamingPerUser * 0.8 
        : this.limits.streamingPerUser;
      bucket.updateRate(rate, rate * 3);
    }

    LoggerService.info('bandwidth', 'Bandwidth limits updated', undefined, newLimits);
    this.emit('limitsUpdated', this.limits);
  }

  /**
   * Temporarily throttle a user
   */
  public throttleUser(userId: string, durationMs: number = 300000): void { // 5 minutes default
    this.throttledUsers.add(userId);

    // Update existing buckets
    if (this.uploadBuckets.has(userId)) {
      this.uploadBuckets.get(userId)!.updateRate(this.limits.uploadPerUser * 0.5);
    }
    if (this.downloadBuckets.has(userId)) {
      this.downloadBuckets.get(userId)!.updateRate(this.limits.downloadPerUser * 0.5);
    }
    if (this.streamingBuckets.has(userId)) {
      this.streamingBuckets.get(userId)!.updateRate(this.limits.streamingPerUser * 0.8);
    }

    // Clear existing timeout
    if (this.throttleTimeouts.has(userId)) {
      clearTimeout(this.throttleTimeouts.get(userId)!);
    }

    // Set timeout to remove throttle
    const timeout = setTimeout(() => {
      this.unthrottleUser(userId);
    }, durationMs);

    this.throttleTimeouts.set(userId, timeout);

    LoggerService.info('bandwidth', `User throttled: ${userId}`, undefined, { durationMs });
    this.emit('userThrottled', { userId, durationMs });
  }

  /**
   * Remove throttle from user
   */
  public unthrottleUser(userId: string): void {
    this.throttledUsers.delete(userId);

    // Update existing buckets back to normal rates
    if (this.uploadBuckets.has(userId)) {
      this.uploadBuckets.get(userId)!.updateRate(this.limits.uploadPerUser);
    }
    if (this.downloadBuckets.has(userId)) {
      this.downloadBuckets.get(userId)!.updateRate(this.limits.downloadPerUser);
    }
    if (this.streamingBuckets.has(userId)) {
      this.streamingBuckets.get(userId)!.updateRate(this.limits.streamingPerUser);
    }

    // Clear timeout
    if (this.throttleTimeouts.has(userId)) {
      clearTimeout(this.throttleTimeouts.get(userId)!);
      this.throttleTimeouts.delete(userId);
    }

    LoggerService.info('bandwidth', `User unthrottled: ${userId}`);
    this.emit('userUnthrottled', { userId });
  }

  /**
   * Get current bandwidth limits
   */
  public getLimits(): BandwidthLimits {
    return { ...this.limits };
  }

  /**
   * Get bandwidth history for charts
   */
  public getBandwidthHistory(): Array<{ timestamp: number; stats: BandwidthStats }> {
    return [...this.bandwidthHistory];
  }

  /**
   * Check if user is admin (unlimited bandwidth)
   */
  private async isAdminUser(userId: string): Promise<boolean> {
    try {
      // This would typically check user role from database
      // For now, return false (implement based on your auth system)
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Start monitoring and auto-throttling
   */
  private startMonitoring(): void {
    setInterval(() => {
      const stats = this.getCurrentUsage();
      
      // Auto-throttle when WiFi is saturated (>80% capacity)
      if (stats.global.wifiCapacityPercent > 80) {
        this.handleBandwidthPressure(stats);
      }

      // Broadcast stats to admin dashboard
      realtimeService.broadcast({
        type: 'BANDWIDTH_STATS',
        data: stats,
        timestamp: Date.now()
      });

      // Store in history (every 5 minutes)
      if (this.bandwidthHistory.length === 0 || 
          Date.now() - this.bandwidthHistory[this.bandwidthHistory.length - 1].timestamp > 300000) {
        
        this.bandwidthHistory.push({
          timestamp: Date.now(),
          stats: JSON.parse(JSON.stringify(stats)) // Deep clone
        });

        // Keep only last 24 hours
        if (this.bandwidthHistory.length > this.HISTORY_MAX_SIZE) {
          this.bandwidthHistory.shift();
        }
      }

    }, 2000); // Update every 2 seconds
  }

  /**
   * Handle bandwidth pressure by auto-throttling uploads
   */
  private handleBandwidthPressure(stats: BandwidthStats): void {
    LoggerService.warn('bandwidth', 'Bandwidth pressure detected - auto-throttling uploads', undefined, {
      wifiCapacity: stats.global.wifiCapacityPercent,
      totalBandwidth: stats.global.totalBytesPerSec
    });

    // Reduce upload token buckets by 50% for all users
    for (const [, bucket] of this.uploadBuckets) {
      bucket.updateRate(this.limits.uploadPerUser * 0.5);
    }

    // Protect streaming bandwidth - increase streaming bucket rates
    for (const [, bucket] of this.streamingBuckets) {
      bucket.updateRate(this.limits.streamingPerUser * 1.2); // 20% boost for streaming
    }

    this.emit('bandwidthPressure', stats);
  }

  /**
   * Clean up inactive users
   */
  private startCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      const inactiveThreshold = 60000; // 1 minute

      // Clean up usage history for inactive users
      for (const [userId, history] of this.usageHistory) {
        const lastActivity = Math.max(...history.map(entry => entry.timestamp));
        
        if (now - lastActivity > inactiveThreshold) {
          this.usageHistory.delete(userId);
          
          // Clean up token buckets for inactive users
          this.uploadBuckets.delete(userId);
          this.downloadBuckets.delete(userId);
          this.streamingBuckets.delete(userId);
        }
      }
    }, 30000); // Clean up every 30 seconds
  }
}

export const bandwidthService = BandwidthService.getInstance();