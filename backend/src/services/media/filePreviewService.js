const fs = require('fs-extra');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { marked } = require('marked');
const hljs = require('highlight.js');
const db = require('../../config/database');

class FilePreviewService {
  constructor() {
    this.previewableFormats = {
      text: ['.txt', '.log', '.csv', '.json', '.xml', '.yaml', '.yml', '.ini', '.conf', '.config'],
      code: ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.sh', '.bash', '.sql', '.html', '.css', '.scss', '.sass', '.less'],
      markdown: ['.md', '.markdown'],
      pdf: ['.pdf'],
      office: ['.docx', '.doc'],
      image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'],
      video: ['.mp4', '.webm', '.ogg', '.avi', '.mov'],
      audio: ['.mp3', '.wav', '.ogg', '.m4a', '.flac']
    };
  }

  /**
   * Check if file can be previewed
   */
  canPreview(filename) {
    const ext = path.extname(filename).toLowerCase();
    return Object.values(this.previewableFormats).some(formats => formats.includes(ext));
  }

  /**
   * Get preview type for file
   */
  getPreviewType(filename) {
    const ext = path.extname(filename).toLowerCase();
    
    for (const [type, formats] of Object.entries(this.previewableFormats)) {
      if (formats.includes(ext)) {
        return type;
      }
    }
    
    return null;
  }

  /**
   * Generate preview for file
   */
  async generatePreview(fileId, userId, options = {}) {
    try {
      const file = await db.getFileById(fileId);
      
      if (!file) {
        throw new Error('File not found');
      }

      if (file.user_id !== userId) {
        throw new Error('Unauthorized');
      }

      const previewType = this.getPreviewType(file.filename);
      
      if (!previewType) {
        throw new Error('File type not supported for preview');
      }

      switch (previewType) {
        case 'text':
          return await this.previewText(file.file_path, options);
        case 'code':
          return await this.previewCode(file.file_path, file.filename, options);
        case 'markdown':
          return await this.previewMarkdown(file.file_path, options);
        case 'pdf':
          return await this.previewPdf(file.file_path, options);
        case 'office':
          return await this.previewOffice(file.file_path, options);
        case 'image':
          return { type: 'image', url: `/api/files/${fileId}/download` };
        case 'video':
          return { type: 'video', url: `/api/stream/video/${fileId}` };
        case 'audio':
          return { type: 'audio', url: `/api/stream/audio/${fileId}` };
        default:
          throw new Error('Unsupported preview type');
      }
    } catch (error) {
      console.error('Error generating preview:', error);
      throw error;
    }
  }

  /**
   * Preview text file
   */
  async previewText(filePath, options = {}) {
    try {
      const { maxLines = 1000, maxSize = 1024 * 1024 } = options; // 1MB max
      
      const stat = await fs.stat(filePath);
      
      if (stat.size > maxSize) {
        // Read only first part of large files
        const buffer = Buffer.alloc(maxSize);
        const fd = await fs.open(filePath, 'r');
        await fs.read(fd, buffer, 0, maxSize, 0);
        await fs.close(fd);
        
        return {
          type: 'text',
          content: buffer.toString('utf8'),
          truncated: true,
          size: stat.size
        };
      }

      let content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      
      if (lines.length > maxLines) {
        content = lines.slice(0, maxLines).join('\n');
        return {
          type: 'text',
          content,
          truncated: true,
          totalLines: lines.length
        };
      }

      return {
        type: 'text',
        content,
        truncated: false
      };
    } catch (error) {
      console.error('Error previewing text:', error);
      throw error;
    }
  }

  /**
   * Preview code file with syntax highlighting
   */
  async previewCode(filePath, filename, options = {}) {
    try {
      const textPreview = await this.previewText(filePath, options);
      const ext = path.extname(filename).toLowerCase().substring(1);
      
      // Map extensions to highlight.js language names
      const langMap = {
        'js': 'javascript',
        'ts': 'typescript',
        'jsx': 'javascript',
        'tsx': 'typescript',
        'py': 'python',
        'rb': 'ruby',
        'sh': 'bash',
        'yml': 'yaml'
      };

      const language = langMap[ext] || ext;
      
      let highlighted;
      try {
        highlighted = hljs.highlight(textPreview.content, { language }).value;
      } catch {
        // If language not supported, use auto-detection
        highlighted = hljs.highlightAuto(textPreview.content).value;
      }

      return {
        type: 'code',
        content: textPreview.content,
        highlighted,
        language,
        truncated: textPreview.truncated,
        totalLines: textPreview.totalLines
      };
    } catch (error) {
      console.error('Error previewing code:', error);
      throw error;
    }
  }

  /**
   * Preview markdown file
   */
  async previewMarkdown(filePath, options = {}) {
    try {
      const textPreview = await this.previewText(filePath, options);
      
      // Configure marked for syntax highlighting
      marked.setOptions({
        highlight: function(code, lang) {
          if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
          }
          return hljs.highlightAuto(code).value;
        }
      });

      const html = marked(textPreview.content);

      return {
        type: 'markdown',
        content: textPreview.content,
        html,
        truncated: textPreview.truncated
      };
    } catch (error) {
      console.error('Error previewing markdown:', error);
      throw error;
    }
  }

  /**
   * Preview PDF file
   */
  async previewPdf(filePath, options = {}) {
    try {
      const { page = 1, maxPages = 10 } = options;
      
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);

      return {
        type: 'pdf',
        text: data.text,
        pages: data.numpages,
        info: data.info,
        metadata: data.metadata,
        version: data.version
      };
    } catch (error) {
      console.error('Error previewing PDF:', error);
      throw error;
    }
  }

  /**
   * Preview Office document (DOCX)
   */
  async previewOffice(filePath, options = {}) {
    try {
      const ext = path.extname(filePath).toLowerCase();
      
      if (ext === '.docx') {
        const result = await mammoth.convertToHtml({ path: filePath });
        
        return {
          type: 'office',
          format: 'docx',
          html: result.value,
          messages: result.messages
        };
      } else {
        throw new Error('Unsupported office format');
      }
    } catch (error) {
      console.error('Error previewing office document:', error);
      throw error;
    }
  }

  /**
   * Extract text content from file
   */
  async extractText(fileId, userId) {
    try {
      const file = await db.getFileById(fileId);
      
      if (!file) {
        throw new Error('File not found');
      }

      if (file.user_id !== userId) {
        throw new Error('Unauthorized');
      }

      const ext = path.extname(file.filename).toLowerCase();
      
      if (this.previewableFormats.text.includes(ext) || this.previewableFormats.code.includes(ext)) {
        const content = await fs.readFile(file.file_path, 'utf8');
        return { text: content };
      } else if (ext === '.pdf') {
        const dataBuffer = await fs.readFile(file.file_path);
        const data = await pdfParse(dataBuffer);
        return { text: data.text };
      } else if (ext === '.docx') {
        const result = await mammoth.extractRawText({ path: file.file_path });
        return { text: result.value };
      } else if (ext === '.md' || ext === '.markdown') {
        const content = await fs.readFile(file.file_path, 'utf8');
        return { text: content };
      } else {
        throw new Error('Text extraction not supported for this file type');
      }
    } catch (error) {
      console.error('Error extracting text:', error);
      throw error;
    }
  }

  /**
   * Get file info for preview
   */
  async getFileInfo(fileId, userId) {
    try {
      const file = await db.getFileById(fileId);
      
      if (!file) {
        throw new Error('File not found');
      }

      if (file.user_id !== userId) {
        throw new Error('Unauthorized');
      }

      const stat = await fs.stat(file.file_path);
      const previewType = this.getPreviewType(file.filename);

      return {
        id: file.id,
        filename: file.filename,
        size: stat.size,
        mimeType: file.mime_type,
        canPreview: this.canPreview(file.filename),
        previewType,
        uploadedAt: file.uploaded_at,
        modifiedAt: stat.mtime
      };
    } catch (error) {
      console.error('Error getting file info:', error);
      throw error;
    }
  }
}

module.exports = new FilePreviewService();
