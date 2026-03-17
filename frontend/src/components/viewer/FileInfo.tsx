import { FileText, Download, Calendar, HardDrive } from 'lucide-react';
import { FileItem } from '../../api/files.api';
import { Button } from '../ui';
import { getFileTypeInfo, formatFileSize } from '../../lib/fileTypes';

interface FileInfoProps {
  file: FileItem;
}

export function FileInfo({ file }: FileInfoProps) {
  const fileTypeInfo = getFileTypeInfo(file.mime_type, file.name);

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  const handleDownload = () => {
    window.open(`/api/files/${file.id}/download`, '_blank');
  };

  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-surface-900 to-black p-8">
      <div className="max-w-2xl w-full bg-surface-800 rounded-2xl p-8 shadow-2xl">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-32 h-32 rounded-2xl bg-surface-700 flex items-center justify-center">
            <fileTypeInfo.icon className={`w-16 h-16 ${fileTypeInfo.color}`} />
          </div>
        </div>

        {/* File name */}
        <h2 className="text-2xl font-bold text-white text-center mb-2">
          {file.name}
        </h2>
        <p className="text-surface-400 text-center mb-8">
          {fileTypeInfo.label}
        </p>

        {/* Metadata */}
        <div className="space-y-4 mb-8">
          <div className="flex items-center gap-3 text-surface-300">
            <HardDrive className="w-5 h-5 text-surface-500" />
            <span className="text-sm">Size:</span>
            <span className="font-medium ml-auto">{formatFileSize(file.size)}</span>
          </div>

          <div className="flex items-center gap-3 text-surface-300">
            <Calendar className="w-5 h-5 text-surface-500" />
            <span className="text-sm">Created:</span>
            <span className="font-medium ml-auto">{formatDate(file.created_at)}</span>
          </div>

          <div className="flex items-center gap-3 text-surface-300">
            <Calendar className="w-5 h-5 text-surface-500" />
            <span className="text-sm">Modified:</span>
            <span className="font-medium ml-auto">{formatDate(file.updated_at)}</span>
          </div>

          <div className="flex items-center gap-3 text-surface-300">
            <FileText className="w-5 h-5 text-surface-500" />
            <span className="text-sm">MIME Type:</span>
            <span className="font-medium ml-auto font-mono text-xs">{file.mime_type}</span>
          </div>
        </div>

        {/* Download button */}
        <Button onClick={handleDownload} variant="primary" size="lg" className="w-full">
          <Download className="w-5 h-5" />
          Download File
        </Button>

        <p className="text-center text-sm text-surface-500 mt-4">
          This file type cannot be previewed in the browser
        </p>
      </div>
    </div>
  );
}
