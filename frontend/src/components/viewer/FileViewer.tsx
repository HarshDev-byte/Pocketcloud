import { useEffect, useState } from 'react';
import { X, Download, Share2, MoreVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import { FileItem } from '../../api/files.api';
import { ImageViewer } from './ImageViewer';
import { VideoPlayer } from './VideoPlayer';
import { AudioPlayer } from './AudioPlayer';
import { PDFViewer } from './PDFViewer';
import { CodeViewer } from './CodeViewer';
import { FileInfo } from './FileInfo';
import { Button } from '../ui';

interface FileViewerProps {
  file: FileItem;
  files: FileItem[];
  onClose: () => void;
  onNavigate?: (direction: 'prev' | 'next') => void;
}

export function FileViewer({ file, files, onClose, onNavigate }: FileViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const index = files.findIndex(f => f.id === file.id);
    setCurrentIndex(index);
  }, [file.id, files]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        onNavigate?.('prev');
      } else if (e.key === 'ArrowRight' && currentIndex < files.length - 1) {
        onNavigate?.('next');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, files.length, onClose, onNavigate]);

  const getViewer = () => {
    const mimeType = file.mime_type;

    if (mimeType.startsWith('image/')) {
      return <ImageViewer file={file} />;
    } else if (mimeType.startsWith('video/')) {
      return <VideoPlayer file={file} />;
    } else if (mimeType.startsWith('audio/')) {
      return <AudioPlayer file={file} />;
    } else if (mimeType === 'application/pdf') {
      return <PDFViewer file={file} />;
    } else if (mimeType.startsWith('text/') || isCodeFile(file.name)) {
      return <CodeViewer file={file} />;
    } else {
      return <FileInfo file={file} />;
    }
  };

  const isCodeFile = (filename: string): boolean => {
    const codeExtensions = [
      'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'h',
      'css', 'scss', 'html', 'json', 'xml', 'yaml', 'yml',
      'md', 'sh', 'bash', 'sql', 'go', 'rs', 'php', 'rb'
    ];
    const ext = filename.split('.').pop()?.toLowerCase();
    return ext ? codeExtensions.includes(ext) : false;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleDownload = () => {
    window.open(`/api/files/${file.id}/download`, '_blank');
  };

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < files.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/90 border-b border-surface-700">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <h2 className="text-lg font-medium text-white truncate">
            {file.name}
          </h2>
          <span className="text-sm text-surface-400">
            {formatFileSize(file.size)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleDownload} variant="secondary" size="sm">
            <Download className="w-4 h-4" />
            Download
          </Button>
          <Button variant="secondary" size="sm">
            <Share2 className="w-4 h-4" />
          </Button>
          <Button variant="secondary" size="sm">
            <MoreVertical className="w-4 h-4" />
          </Button>
          <Button onClick={onClose} variant="secondary" size="sm">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Viewer content */}
      <div className="flex-1 relative overflow-hidden">
        {getViewer()}

        {/* Navigation arrows */}
        {hasPrev && (
          <button
            onClick={() => onNavigate?.('prev')}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {hasNext && (
          <button
            onClick={() => onNavigate?.('next')}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
}
