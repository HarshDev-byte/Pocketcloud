const fs = require('fs-extra');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const db = require('../../config/database');

class VideoStreamingService {
  constructor() {
    this.supportedFormats = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpeg', '.mpg'];
  }

  /**
   * Check if file is a video
   */
  isVideo(filename) {
    const ext = path.extname(filename).toLowerCase();
    return this.supportedFormats.includes(ext);
  }

  /**
   * Get video metadata using ffprobe
   */
  async getVideoMetadata(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          const videoStream = metadata.streams.find(s => s.codec_type === 'video');
          const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
          
          resolve({
            duration: metadata.format.duration,
            size: metadata.format.size,
            bitrate: metadata.format.bit_rate,
            format: metadata.format.format_name,
            video: videoStream ? {
              codec: videoStream.codec_name,
              width: videoStream.width,
              height: videoStream.height,
              fps: eval(videoStream.r_frame_rate),
              bitrate: videoStream.bit_rate
            } : null,
            audio: audioStream ? {
              codec: audioStream.codec_name,
              sampleRate: audioStream.sample_rate,
              channels: audioStream.channels,
              bitrate: audioStream.bit_rate
            } : null
          });
        }
      });
    });
  }

  /**
   * Stream video with range support for seeking
   */
  async streamVideo(fileId, range, userId) {
    try {
      // Get file info
      const file = await db.getFileById(fileId);
      
      if (!file) {
        throw new Error('File not found');
      }

      // Check ownership
      if (file.user_id !== userId) {
        throw new Error('Unauthorized');
      }

      // Check if file is video
      if (!this.isVideo(file.filename)) {
        throw new Error('File is not a video');
      }

      const filePath = file.file_path;
      const stat = await fs.stat(filePath);
      const fileSize = stat.size;

      // Parse range header
      let start = 0;
      let end = fileSize - 1;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        start = parseInt(parts[0], 10);
        end = parts[1] ? parseInt(parts[1], 10) : end;
      }

      const chunkSize = (end - start) + 1;

      return {
        stream: fs.createReadStream(filePath, { start, end }),
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': this.getContentType(file.filename)
        },
        statusCode: range ? 206 : 200
      };
    } catch (error) {
      console.error('Error streaming video:', error);
      throw error;
    }
  }

  /**
   * Get content type based on file extension
   */
  getContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const types = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.ogg': 'video/ogg',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.wmv': 'video/x-ms-wmv',
      '.flv': 'video/x-flv',
      '.mkv': 'video/x-matroska',
      '.m4v': 'video/x-m4v',
      '.mpeg': 'video/mpeg',
      '.mpg': 'video/mpeg'
    };
    return types[ext] || 'video/mp4';
  }

  /**
   * Extract and save video metadata to database
   */
  async extractAndSaveMetadata(fileId, filePath) {
    try {
      const metadata = await this.getVideoMetadata(filePath);
      
      // Update file record with metadata
      await db.run(
        `UPDATE files 
         SET duration = ?, 
             width = ?, 
             height = ?, 
             bitrate = ?, 
             codec = ?
         WHERE id = ?`,
        [
          Math.round(metadata.duration),
          metadata.video?.width,
          metadata.video?.height,
          metadata.bitrate,
          metadata.video?.codec,
          fileId
        ]
      );

      return metadata;
    } catch (error) {
      console.error('Error extracting video metadata:', error);
      throw error;
    }
  }

  /**
   * Generate video thumbnail at specific timestamp
   */
  async generateThumbnailAtTime(filePath, outputPath, timestamp = '00:00:01') {
    return new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .screenshots({
          timestamps: [timestamp],
          filename: path.basename(outputPath),
          folder: path.dirname(outputPath),
          size: '320x240'
        })
        .on('end', () => resolve(outputPath))
        .on('error', reject);
    });
  }

  /**
   * Generate multiple thumbnails for video preview
   */
  async generateMultipleThumbnails(filePath, outputDir, count = 5) {
    try {
      const metadata = await this.getVideoMetadata(filePath);
      const duration = metadata.duration;
      const interval = duration / (count + 1);
      
      const thumbnails = [];
      
      for (let i = 1; i <= count; i++) {
        const timestamp = interval * i;
        const outputPath = path.join(outputDir, `thumb_${i}.jpg`);
        
        await this.generateThumbnailAtTime(filePath, outputPath, timestamp);
        thumbnails.push({
          path: outputPath,
          timestamp: timestamp
        });
      }

      return thumbnails;
    } catch (error) {
      console.error('Error generating multiple thumbnails:', error);
      throw error;
    }
  }

  /**
   * Transcode video to different format/quality
   */
  async transcodeVideo(inputPath, outputPath, options = {}) {
    const {
      format = 'mp4',
      resolution = '720p',
      videoBitrate = '1000k',
      audioBitrate = '128k'
    } = options;

    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .output(outputPath)
        .videoBitrate(videoBitrate)
        .audioBitrate(audioBitrate);

      // Set resolution
      if (resolution === '480p') {
        command = command.size('854x480');
      } else if (resolution === '720p') {
        command = command.size('1280x720');
      } else if (resolution === '1080p') {
        command = command.size('1920x1080');
      }

      // Set format
      if (format === 'webm') {
        command = command.videoCodec('libvpx').audioCodec('libvorbis');
      } else {
        command = command.videoCodec('libx264').audioCodec('aac');
      }

      command
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .on('progress', (progress) => {
          console.log(`Transcoding: ${progress.percent}% done`);
        })
        .run();
    });
  }
}

module.exports = new VideoStreamingService();
