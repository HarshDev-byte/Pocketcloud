/**
 * Browser drag-drop upload widget using Pocket Cloud SDK
 */

import { PocketCloudClient, UploadCancelledError } from '../src/index.js';

interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error' | 'cancelled';
  error?: string;
  uploadId?: string;
  cancel?: () => void;
}

class UploadWidget {
  private client: PocketCloudClient;
  private container: HTMLElement;
  private uploads: Map<string, UploadItem> = new Map();
  private folderId?: string;

  constructor(client: PocketCloudClient, containerId: string) {
    this.client = client;
    this.container = document.getElementById(containerId)!;
    this.setupUI();
    this.setupEventListeners();
  }

  /**
   * Set target folder for uploads
   */
  setFolder(folderId?: string): void {
    this.folderId = folderId;
  }

  /**
   * Setup the upload widget UI
   */
  private setupUI(): void {
    this.container.innerHTML = `
      <div class="upload-widget">
        <div class="drop-zone" id="dropZone">
          <div class="drop-zone-content">
            <svg class="upload-icon" viewBox="0 0 24 24" width="48" height="48">
              <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
            </svg>
            <h3>Drop files here or click to browse</h3>
            <p>Supports all file types, any size</p>
            <button class="browse-btn" id="browseBtn">Choose Files</button>
          </div>
        </div>
        <input type="file" id="fileInput" multiple style="display: none;">
        <div class="upload-list" id="uploadList"></div>
      </div>
    `;

    // Add CSS styles
    const style = document.createElement('style');
    style.textContent = `
      .upload-widget {
        max-width: 600px;
        margin: 0 auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      
      .drop-zone {
        border: 2px dashed #ccc;
        border-radius: 8px;
        padding: 40px;
        text-align: center;
        background: #fafafa;
        transition: all 0.3s ease;
        cursor: pointer;
      }
      
      .drop-zone:hover, .drop-zone.drag-over {
        border-color: #007bff;
        background: #f0f8ff;
      }
      
      .drop-zone-content h3 {
        margin: 16px 0 8px;
        color: #333;
      }
      
      .drop-zone-content p {
        margin: 0 0 20px;
        color: #666;
      }
      
      .browse-btn {
        background: #007bff;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
      }
      
      .browse-btn:hover {
        background: #0056b3;
      }
      
      .upload-icon {
        fill: #007bff;
      }
      
      .upload-list {
        margin-top: 20px;
      }
      
      .upload-item {
        display: flex;
        align-items: center;
        padding: 12px;
        border: 1px solid #eee;
        border-radius: 6px;
        margin-bottom: 8px;
        background: white;
      }
      
      .upload-info {
        flex: 1;
        margin-right: 12px;
      }
      
      .upload-name {
        font-weight: 500;
        margin-bottom: 4px;
      }
      
      .upload-details {
        font-size: 12px;
        color: #666;
      }
      
      .upload-progress {
        width: 100px;
        height: 6px;
        background: #eee;
        border-radius: 3px;
        overflow: hidden;
        margin-right: 12px;
      }
      
      .upload-progress-bar {
        height: 100%;
        background: #007bff;
        transition: width 0.3s ease;
      }
      
      .upload-status {
        font-size: 12px;
        padding: 4px 8px;
        border-radius: 4px;
        white-space: nowrap;
      }
      
      .status-pending { background: #f8f9fa; color: #6c757d; }
      .status-uploading { background: #e3f2fd; color: #1976d2; }
      .status-completed { background: #e8f5e8; color: #2e7d32; }
      .status-error { background: #ffebee; color: #c62828; }
      .status-cancelled { background: #f3e5f5; color: #7b1fa2; }
      
      .cancel-btn {
        background: none;
        border: none;
        color: #dc3545;
        cursor: pointer;
        padding: 4px;
        margin-left: 8px;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    const dropZone = document.getElementById('dropZone')!;
    const fileInput = document.getElementById('fileInput')! as HTMLInputElement;
    const browseBtn = document.getElementById('browseBtn')!;

    // Drag and drop
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      
      const files = Array.from(e.dataTransfer?.files || []);
      this.handleFiles(files);
    });

    // Click to browse
    dropZone.addEventListener('click', () => {
      fileInput.click();
    });

    browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      const files = Array.from(fileInput.files || []);
      this.handleFiles(files);
      fileInput.value = ''; // Reset input
    });
  }

  /**
   * Handle selected files
   */
  private handleFiles(files: File[]): void {
    files.forEach(file => {
      const uploadItem: UploadItem = {
        id: Math.random().toString(36).substr(2, 9),
        file,
        progress: 0,
        status: 'pending'
      };

      this.uploads.set(uploadItem.id, uploadItem);
      this.renderUploadItem(uploadItem);
      this.startUpload(uploadItem);
    });
  }

  /**
   * Start uploading a file
   */
  private async startUpload(item: UploadItem): Promise<void> {
    try {
      item.status = 'uploading';
      this.updateUploadItem(item);

      // Start chunked upload for better progress tracking
      const upload = await this.client.upload.start(item.file, {
        folderId: this.folderId,
        onProgress: ({ percent, speed, eta }) => {
          item.progress = percent;
          this.updateUploadItem(item, { speed, eta });
        }
      });

      // Store upload reference for cancellation
      item.uploadId = upload.info.id;
      item.cancel = () => {
        upload.cancel();
        item.status = 'cancelled';
        this.updateUploadItem(item);
      };

      // Complete upload
      const file = await upload.complete();
      
      item.status = 'completed';
      item.progress = 100;
      this.updateUploadItem(item);

      console.log('Upload completed:', file);

    } catch (error) {
      if (error instanceof UploadCancelledError) {
        item.status = 'cancelled';
      } else {
        item.status = 'error';
        item.error = error instanceof Error ? error.message : 'Upload failed';
      }
      this.updateUploadItem(item);
    }
  }

  /**
   * Render upload item in the list
   */
  private renderUploadItem(item: UploadItem): void {
    const uploadList = document.getElementById('uploadList')!;
    
    const itemElement = document.createElement('div');
    itemElement.className = 'upload-item';
    itemElement.id = `upload-${item.id}`;
    
    uploadList.appendChild(itemElement);
    this.updateUploadItem(item);
  }

  /**
   * Update upload item display
   */
  private updateUploadItem(item: UploadItem, extra?: { speed?: number; eta?: number }): void {
    const element = document.getElementById(`upload-${item.id}`);
    if (!element) return;

    const formatSize = (bytes: number) => {
      const sizes = ['B', 'KB', 'MB', 'GB'];
      if (bytes === 0) return '0 B';
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    };

    const formatSpeed = (bytesPerSec: number) => {
      return formatSize(bytesPerSec) + '/s';
    };

    let details = formatSize(item.file.size);
    if (extra?.speed && item.status === 'uploading') {
      details += ` • ${formatSpeed(extra.speed)}`;
      if (extra.eta) {
        details += ` • ${extra.eta}s remaining`;
      }
    }

    const statusText = {
      pending: 'Pending',
      uploading: `${item.progress}%`,
      completed: 'Completed',
      error: 'Failed',
      cancelled: 'Cancelled'
    }[item.status];

    element.innerHTML = `
      <div class="upload-info">
        <div class="upload-name">${item.file.name}</div>
        <div class="upload-details">${details}</div>
        ${item.error ? `<div style="color: #c62828; font-size: 12px;">${item.error}</div>` : ''}
      </div>
      <div class="upload-progress">
        <div class="upload-progress-bar" style="width: ${item.progress}%"></div>
      </div>
      <div class="upload-status status-${item.status}">${statusText}</div>
      ${item.status === 'uploading' && item.cancel ? 
        '<button class="cancel-btn" onclick="uploadWidget.cancelUpload(\'' + item.id + '\')">✕</button>' : 
        ''}
    `;
  }

  /**
   * Cancel an upload
   */
  cancelUpload(itemId: string): void {
    const item = this.uploads.get(itemId);
    if (item?.cancel) {
      item.cancel();
    }
  }

  /**
   * Clear completed uploads
   */
  clearCompleted(): void {
    const completedItems = Array.from(this.uploads.values())
      .filter(item => item.status === 'completed');
    
    completedItems.forEach(item => {
      const element = document.getElementById(`upload-${item.id}`);
      element?.remove();
      this.uploads.delete(item.id);
    });
  }

  /**
   * Get upload statistics
   */
  getStats(): {
    total: number;
    pending: number;
    uploading: number;
    completed: number;
    failed: number;
    cancelled: number;
  } {
    const items = Array.from(this.uploads.values());
    return {
      total: items.length,
      pending: items.filter(i => i.status === 'pending').length,
      uploading: items.filter(i => i.status === 'uploading').length,
      completed: items.filter(i => i.status === 'completed').length,
      failed: items.filter(i => i.status === 'error').length,
      cancelled: items.filter(i => i.status === 'cancelled').length
    };
  }
}

// Example usage
async function initUploadWidget() {
  const client = new PocketCloudClient({
    baseUrl: 'http://192.168.4.1:3000',
    apiKey: 'your-api-key-here'
  });

  const uploadWidget = new UploadWidget(client, 'uploadContainer');
  
  // Set target folder (optional)
  uploadWidget.setFolder('folder-id-123');

  // Make widget globally accessible for cancel buttons
  (window as any).uploadWidget = uploadWidget;

  // Real-time upload notifications
  const rt = client.realtime.connect();
  rt.on('upload:complete', (event) => {
    console.log('Upload completed via WebSocket:', event.data.filename);
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUploadWidget);
} else {
  initUploadWidget();
}

export { UploadWidget };