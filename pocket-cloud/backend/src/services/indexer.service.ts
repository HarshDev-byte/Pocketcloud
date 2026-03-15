import { readFileSync, existsSync } from 'fs';
import { extname } from 'path';
import { execSync } from 'child_process';
import { db } from '../db';
import { LoggerService } from './logger.service';

export interface IndexingResult {
  success: boolean;
  contentPreview?: string;
  tags?: string[];
  error?: string;
}

export class IndexerService {
  private static readonly MAX_CONTENT_LENGTH = 2000;
  private static readonly TEXT_EXTENSIONS = ['.txt', '.md', '.csv', '.json', '.log', '.js', '.ts', '.html', '.css', '.xml', '.yml', '.yaml'];
  
  /**
   * Index file content for search
   */
  public static async indexFile(fileId: string, filePath: string, mimeType: string): Promise<IndexingResult> {
    try {
      const extension = extname(filePath).toLowerCase();
      let contentPreview = '';
      let tags: string[] = [];

      // Index based on file type
      if (this.TEXT_EXTENSIONS.includes(extension) || mimeType.startsWith('text/')) {
        const result = await this.indexTextFile(filePath);
        contentPreview = result.contentPreview || '';
        tags = result.tags || [];
        
      } else if (mimeType === 'application/pdf') {
        const result = await this.indexPDF(filePath);
        contentPreview = result.contentPreview || '';
        
      } else if (mimeType.startsWith('image/')) {
        const result = await this.indexImage(filePath);
        tags = result.tags || [];
        
      } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const result = await this.indexDocx(filePath);
        contentPreview = result.contentPreview || '';
        
      } else if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        const result = await this.indexXlsx(filePath);
        contentPreview = result.contentPreview || '';
      }

      // Update database with indexed content
      await this.updateFileIndex(fileId, contentPreview, tags);

      LoggerService.info('indexer', `Indexed file ${fileId}`, undefined, { 
        fileId, 
        contentLength: contentPreview.length,
        tagsCount: tags.length 
      });

      return {
        success: true,
        contentPreview,
        tags
      };

    } catch (error) {
      LoggerService.error('indexer', `Failed to index file ${fileId}`, undefined, { 
        error: (error as Error).message,
        fileId,
        filePath 
      });

      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Index text files
   */
  private static async indexTextFile(filePath: string): Promise<IndexingResult> {
    try {
      if (!existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      const content = readFileSync(filePath, 'utf8');
      const contentPreview = content.substring(0, this.MAX_CONTENT_LENGTH);
      
      // Extract potential tags from content (hashtags, @mentions, etc.)
      const tags = this.extractTagsFromText(content);

      return {
        success: true,
        contentPreview,
        tags
      };

    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Index PDF files using pdftotext
   */
  private static async indexPDF(filePath: string): Promise<IndexingResult> {
    try {
      if (!existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      // Use pdftotext from poppler-utils to extract text
      const command = `pdftotext -l 3 "${filePath}" -`;
      const content = execSync(command, { 
        encoding: 'utf8',
        timeout: 10000, // 10 second timeout
        maxBuffer: 1024 * 1024 // 1MB max buffer
      });

      const contentPreview = content.substring(0, this.MAX_CONTENT_LENGTH);
      const tags = this.extractTagsFromText(content);

      return {
        success: true,
        contentPreview,
        tags
      };

    } catch (error) {
      // If pdftotext fails, try to extract basic metadata
      LoggerService.warn('indexer', 'PDF text extraction failed, using filename only', undefined, { 
        error: (error as Error).message,
        filePath 
      });

      return {
        success: true,
        contentPreview: '',
        tags: []
      };
    }
  }

  /**
   * Index images with EXIF data
   */
  private static async indexImage(filePath: string): Promise<IndexingResult> {
    try {
      if (!existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      const tags: string[] = [];

      try {
        // Use exiftool to extract EXIF data
        const command = `exiftool -json "${filePath}"`;
        const output = execSync(command, { 
          encoding: 'utf8',
          timeout: 5000 // 5 second timeout
        });

        const exifData = JSON.parse(output)[0];
        
        // Extract useful metadata as tags
        if (exifData.Make) tags.push(`camera:${exifData.Make}`);
        if (exifData.Model) tags.push(`model:${exifData.Model}`);
        if (exifData.DateTimeOriginal) {
          const date = new Date(exifData.DateTimeOriginal);
          tags.push(`year:${date.getFullYear()}`);
          tags.push(`month:${date.getMonth() + 1}`);
        }
        if (exifData.GPSLatitude && exifData.GPSLongitude) {
          // Add GPS coordinates as tags
          tags.push('gps:location');
          
          // Try to reverse geocode to city name (simplified)
          const city = await this.reverseGeocode(exifData.GPSLatitude, exifData.GPSLongitude);
          if (city) tags.push(`location:${city}`);
        }
        if (exifData.ISO) tags.push(`iso:${exifData.ISO}`);
        if (exifData.FocalLength) tags.push(`focal:${exifData.FocalLength}`);

      } catch (exifError) {
        // EXIF extraction failed, continue without it
        LoggerService.warn('indexer', 'EXIF extraction failed', undefined, { 
          error: (exifError as Error).message,
          filePath 
        });
      }

      return {
        success: true,
        contentPreview: '',
        tags
      };

    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Index DOCX files using mammoth
   */
  private static async indexDocx(filePath: string): Promise<IndexingResult> {
    try {
      if (!existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      // Use mammoth to extract text from DOCX
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      
      const contentPreview = result.value.substring(0, this.MAX_CONTENT_LENGTH);
      const tags = this.extractTagsFromText(result.value);

      return {
        success: true,
        contentPreview,
        tags
      };

    } catch (error) {
      // If mammoth fails, return empty content
      LoggerService.warn('indexer', 'DOCX text extraction failed', undefined, { 
        error: (error as Error).message,
        filePath 
      });

      return {
        success: true,
        contentPreview: '',
        tags: []
      };
    }
  }

  /**
   * Index XLSX files (basic sheet names and cell content)
   */
  private static async indexXlsx(filePath: string): Promise<IndexingResult> {
    try {
      if (!existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      // Use xlsx library to read spreadsheet
      const XLSX = require('xlsx');
      const workbook = XLSX.readFile(filePath);
      
      let contentPreview = '';
      const tags: string[] = [];

      // Extract sheet names as tags
      workbook.SheetNames.forEach((sheetName: string) => {
        tags.push(`sheet:${sheetName}`);
        
        // Extract some cell content for preview
        const worksheet = workbook.Sheets[sheetName];
        const sheetData = XLSX.utils.sheet_to_csv(worksheet, { header: 1 });
        
        if (contentPreview.length < this.MAX_CONTENT_LENGTH) {
          contentPreview += sheetData.substring(0, this.MAX_CONTENT_LENGTH - contentPreview.length);
        }
      });

      return {
        success: true,
        contentPreview: contentPreview.substring(0, this.MAX_CONTENT_LENGTH),
        tags
      };

    } catch (error) {
      LoggerService.warn('indexer', 'XLSX text extraction failed', undefined, { 
        error: (error as Error).message,
        filePath 
      });

      return {
        success: true,
        contentPreview: '',
        tags: []
      };
    }
  }

  /**
   * Extract tags from text content
   */
  private static extractTagsFromText(content: string): string[] {
    const tags: string[] = [];
    
    // Extract hashtags
    const hashtags = content.match(/#\w+/g);
    if (hashtags) {
      hashtags.forEach(tag => tags.push(tag.substring(1).toLowerCase()));
    }

    // Extract @mentions
    const mentions = content.match(/@\w+/g);
    if (mentions) {
      mentions.forEach(mention => tags.push(`mention:${mention.substring(1).toLowerCase()}`));
    }

    // Extract email addresses
    const emails = content.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
    if (emails) {
      emails.forEach(email => tags.push(`email:${email.toLowerCase()}`));
    }

    // Extract URLs
    const urls = content.match(/https?:\/\/[^\s]+/g);
    if (urls) {
      urls.forEach(url => {
        try {
          const domain = new URL(url).hostname;
          tags.push(`domain:${domain}`);
        } catch (e) {
          // Invalid URL, skip
        }
      });
    }

    // Extract years (4-digit numbers that look like years)
    const years = content.match(/\b(19|20)\d{2}\b/g);
    if (years) {
      years.forEach(year => tags.push(`year:${year}`));
    }

    return [...new Set(tags)]; // Remove duplicates
  }

  /**
   * Simple reverse geocoding using offline city database
   */
  private static async reverseGeocode(_lat: number, _lng: number): Promise<string | null> {
    try {
      // This is a simplified implementation
      // In production, you'd use a proper offline geocoding database
      
      // For now, just return null - could be enhanced with cities.json database
      return null;
      
    } catch (error) {
      return null;
    }
  }

  /**
   * Update file index in database
   */
  private static async updateFileIndex(fileId: string, contentPreview: string, tags: string[]): Promise<void> {
    const tagsString = tags.join(' ');
    
    // Update files table
    const updateFileStmt = db.prepare(`
      UPDATE files 
      SET content_indexed = 1, content_preview = ?, tags = ?
      WHERE id = ?
    `);
    updateFileStmt.run(contentPreview, tagsString, fileId);

    // Update FTS table
    const updateFTSStmt = db.prepare(`
      UPDATE files_fts 
      SET content_preview = ?, tags = ?
      WHERE file_id = ?
    `);
    updateFTSStmt.run(contentPreview, tagsString, fileId);
  }

  /**
   * Reindex all files (admin function)
   */
  public static async reindexAllFiles(): Promise<{ processed: number; errors: number }> {
    let processed = 0;
    let errors = 0;

    try {
      const stmt = db.prepare(`
        SELECT id, storage_path, mime_type 
        FROM files 
        WHERE is_deleted = 0
      `);
      
      const files = stmt.all() as Array<{ id: string; storage_path: string; mime_type: string }>;

      for (const file of files) {
        try {
          await this.indexFile(file.id, file.storage_path, file.mime_type);
          processed++;
        } catch (error) {
          errors++;
          LoggerService.error('indexer', `Failed to reindex file ${file.id}`, undefined, { 
            error: (error as Error).message,
            fileId: file.id 
          });
        }
      }

      LoggerService.info('indexer', `Reindexing complete`, undefined, { processed, errors });

    } catch (error) {
      LoggerService.error('indexer', 'Reindexing failed', undefined, { 
        error: (error as Error).message 
      });
    }

    return { processed, errors };
  }

  /**
   * Get indexing statistics
   */
  public static getIndexingStats(): { total: number; indexed: number; pending: number } {
    try {
      const totalStmt = db.prepare(`
        SELECT COUNT(*) as count FROM files WHERE is_deleted = 0
      `);
      const total = (totalStmt.get() as { count: number }).count;

      const indexedStmt = db.prepare(`
        SELECT COUNT(*) as count FROM files WHERE is_deleted = 0 AND content_indexed = 1
      `);
      const indexed = (indexedStmt.get() as { count: number }).count;

      return {
        total,
        indexed,
        pending: total - indexed
      };

    } catch (error) {
      LoggerService.error('indexer', 'Failed to get indexing stats', undefined, { 
        error: (error as Error).message 
      });
      
      return { total: 0, indexed: 0, pending: 0 };
    }
  }
}

export const indexerService = IndexerService;