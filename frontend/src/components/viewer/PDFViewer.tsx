import { FileItem } from '../../api/files.api';

interface PDFViewerProps {
  file: FileItem;
}

export function PDFViewer({ file }: PDFViewerProps) {
  const pdfUrl = `/api/files/${file.id}/download?inline=true`;

  return (
    <div className="w-full h-full bg-surface-900">
      <iframe
        src={pdfUrl}
        className="w-full h-full border-0"
        title={file.name}
      />
    </div>
  );
}
