import React, { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, FileText } from 'lucide-react';
import { apiClient } from '../../api/client';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface PDFViewerProps {
  fileId: string;
  fileName: string;
  onClose?: () => void;
}

interface PDFMetadata {
  page_count?: number;
  processing_status?: string;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({ fileId, fileName, onClose }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [metadata, setMetadata] = useState<PDFMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pdfUrl = `/api/files/${fileId}/download`;

  useEffect(() => {
    loadMetadata();
  }, [fileId]);

  const loadMetadata = async () => {
    try {
      const response = await apiClient.get(`/api/files/${fileId}/info`);
      setMetadata(response.data);
    } catch (err) {
      console.error('Failed to load PDF metadata:', err);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('PDF load error:', error);
    setError('Failed to load PDF document');
    setLoading(false);
  };

  const goToPrevPage = () => {
    setPageNumber(prev => Math.max(1, prev - 1));
  };

  const goToNextPage = () => {
    setPageNumber(prev => Math.min(numPages, prev + 1));
  };

  const zoomIn = () => {
    setScale(prev => Math.min(3.0, prev + 0.2));
  };

  const zoomOut = () => {
    setScale(prev => Math.max(0.5, prev - 0.2));
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= numPages) {
      setPageNumber(page);
    }
  };

  const downloadPDF = () => {
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 text-white p-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <FileText size={24} />
          <div>
            <h2 className="font-semibold">{fileName}</h2>
            {metadata?.page_count && (
              <p className="text-sm text-gray-400">
                {metadata.page_count} pages
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Page navigation */}
          <div className="flex items-center space-x-2">
            <button
              onClick={goToPrevPage}
              disabled={pageNumber <= 1}
              className="p-2 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={20} />
            </button>
            
            <div className="flex items-center space-x-2">
              <input
                type="number"
                min="1"
                max={numPages}
                value={pageNumber}
                onChange={(e) => goToPage(parseInt(e.target.value))}
                className="w-16 px-2 py-1 bg-gray-700 text-white text-center rounded"
              />
              <span className="text-gray-400">of {numPages}</span>
            </div>

            <button
              onClick={goToNextPage}
              disabled={pageNumber >= numPages}
              className="p-2 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={zoomOut}
              className="p-2 rounded hover:bg-gray-700"
            >
              <ZoomOut size={20} />
            </button>
            
            <span className="text-sm text-gray-400 min-w-16 text-center">
              {Math.round(scale * 100)}%
            </span>
            
            <button
              onClick={zoomIn}
              className="p-2 rounded hover:bg-gray-700"
            >
              <ZoomIn size={20} />
            </button>
          </div>

          {/* Download */}
          <button
            onClick={downloadPDF}
            className="p-2 rounded hover:bg-gray-700"
            title="Download PDF"
          >
            <Download size={20} />
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-gray-700 text-xl"
          >
            ×
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-gray-600 p-4">
        {loading && (
          <div className="flex items-center justify-center h-full text-white">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
              <p>Loading PDF...</p>
              {metadata?.processing_status === 'processing' && (
                <p className="text-sm text-gray-300 mt-2">Processing document...</p>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full text-white">
            <div className="text-center">
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {!loading && !error && (
          <div className="flex justify-center">
            <div className="bg-white shadow-lg">
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={
                  <div className="flex items-center justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600"></div>
                  </div>
                }
              >
                <Page
                  pageNumber={pageNumber}
                  scale={scale}
                  loading={
                    <div className="flex items-center justify-center p-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600"></div>
                    </div>
                  }
                />
              </Document>
            </div>
          </div>
        )}
      </div>

      {/* Footer with page thumbnails (optional) */}
      {numPages > 1 && !loading && !error && (
        <div className="bg-gray-800 p-2 overflow-x-auto">
          <div className="flex space-x-2">
            {Array.from({ length: Math.min(numPages, 20) }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => goToPage(page)}
                className={`flex-shrink-0 w-16 h-20 border-2 rounded overflow-hidden ${
                  page === pageNumber 
                    ? 'border-blue-500 bg-blue-100' 
                    : 'border-gray-600 bg-white hover:border-gray-400'
                }`}
              >
                <Document file={pdfUrl}>
                  <Page
                    pageNumber={page}
                    width={60}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </Document>
              </button>
            ))}
            {numPages > 20 && (
              <div className="flex items-center px-2 text-gray-400 text-sm">
                +{numPages - 20} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};