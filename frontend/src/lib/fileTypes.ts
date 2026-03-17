import {
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  File,
  FileSpreadsheet,
  type LucideIcon,
} from 'lucide-react';

export interface FileTypeInfo {
  icon: LucideIcon;
  color: string;
  label: string;
}

export function getFileTypeInfo(mimeType: string, filename: string): FileTypeInfo {
  // Images
  if (mimeType.startsWith('image/')) {
    return {
      icon: FileImage,
      color: 'text-amber-500',
      label: 'Image',
    };
  }

  // Videos
  if (mimeType.startsWith('video/')) {
    return {
      icon: FileVideo,
      color: 'text-purple-500',
      label: 'Video',
    };
  }

  // Audio
  if (mimeType.startsWith('audio/')) {
    return {
      icon: FileAudio,
      color: 'text-pink-500',
      label: 'Audio',
    };
  }

  // PDFs
  if (mimeType === 'application/pdf') {
    return {
      icon: FileText,
      color: 'text-red-500',
      label: 'PDF',
    };
  }

  // Word documents
  if (
    mimeType.includes('word') ||
    mimeType.includes('msword') ||
    filename.match(/\.(doc|docx)$/i)
  ) {
    return {
      icon: FileText,
      color: 'text-blue-500',
      label: 'Document',
    };
  }

  // Excel spreadsheets
  if (
    mimeType.includes('excel') ||
    mimeType.includes('spreadsheet') ||
    filename.match(/\.(xls|xlsx)$/i)
  ) {
    return {
      icon: FileSpreadsheet,
      color: 'text-green-500',
      label: 'Spreadsheet',
    };
  }

  // Archives
  if (
    mimeType.includes('zip') ||
    mimeType.includes('rar') ||
    mimeType.includes('tar') ||
    mimeType.includes('7z') ||
    filename.match(/\.(zip|rar|tar|gz|7z)$/i)
  ) {
    return {
      icon: FileArchive,
      color: 'text-orange-500',
      label: 'Archive',
    };
  }

  // Code files
  if (
    mimeType.includes('javascript') ||
    mimeType.includes('typescript') ||
    mimeType.includes('json') ||
    mimeType.includes('xml') ||
    mimeType.includes('html') ||
    mimeType.includes('css') ||
    filename.match(/\.(js|ts|jsx|tsx|json|xml|html|css|py|java|cpp|c|h|go|rs|php)$/i)
  ) {
    return {
      icon: FileCode,
      color: 'text-gray-500',
      label: 'Code',
    };
  }

  // Default
  return {
    icon: File,
    color: 'text-surface-500',
    label: 'File',
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  
  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;
  return `${years}y ago`;
}
