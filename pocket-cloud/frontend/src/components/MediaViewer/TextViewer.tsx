import React, { useState, useEffect } from 'react';
import hljs from 'highlight.js';
import { Download, Copy, FileText, Eye, Code } from 'lucide-react';
import 'highlight.js/styles/github-dark.css';

interface TextViewerProps {
  fileId: string;
  fileName: string;
  mimeType: string;
  onClose?: () => void;
}

export const TextViewer: React.FC<TextViewerProps> = ({ fileId, fileName, mimeType, onClose }) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'raw' | 'highlighted'>('highlighted');
  const [language, setLanguage] = useState<string>('');
  const [lineNumbers, setLineNumbers] = useState(true);
  const [wordWrap, setWordWrap] = useState(false);

  const textUrl = `/api/files/${fileId}/download`;

  useEffect(() => {
    loadContent();
  }, [fileId]);

  useEffect(() => {
    if (content && viewMode === 'highlighted') {
      highlightCode();
    }
  }, [content, viewMode, language]);

  const loadContent = async () => {
    try {
      setLoading(true);
      const response = await fetch(textUrl);
      
      if (!response.ok) {
        throw new Error('Failed to load file');
      }

      const text = await response.text();
      setContent(text);
      
      // Auto-detect language from file extension and MIME type
      const detectedLanguage = detectLanguage(fileName, mimeType);
      setLanguage(detectedLanguage);
      
    } catch (err) {
      console.error('Failed to load text content:', err);
      setError('Failed to load file content');
    } finally {
      setLoading(false);
    }
  };

  const detectLanguage = (filename: string, mimeType: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    
    // First try to detect from MIME type
    if (mimeType) {
      const mimeLanguageMap: { [key: string]: string } = {
        'application/javascript': 'javascript',
        'application/json': 'json',
        'application/xml': 'xml',
        'text/html': 'html',
        'text/css': 'css',
        'text/x-python': 'python',
        'text/x-java-source': 'java',
        'text/x-c': 'c',
        'text/x-c++': 'cpp',
        'text/x-csharp': 'csharp',
        'text/x-php': 'php',
        'text/x-ruby': 'ruby',
        'text/x-go': 'go',
        'text/x-rust': 'rust',
        'text/x-swift': 'swift',
        'text/x-kotlin': 'kotlin',
        'text/x-scala': 'scala',
        'text/x-sh': 'bash',
        'text/markdown': 'markdown',
        'text/x-sql': 'sql',
        'text/yaml': 'yaml'
      };
      
      if (mimeLanguageMap[mimeType]) {
        return mimeLanguageMap[mimeType];
      }
    }
    
    // Language mapping based on file extension
    const languageMap: { [key: string]: string } = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'cc': 'cpp',
      'cxx': 'cpp',
      'h': 'c',
      'hpp': 'cpp',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'swift': 'swift',
      'kt': 'kotlin',
      'scala': 'scala',
      'sh': 'bash',
      'bash': 'bash',
      'zsh': 'bash',
      'fish': 'bash',
      'ps1': 'powershell',
      'html': 'html',
      'htm': 'html',
      'xml': 'xml',
      'css': 'css',
      'scss': 'scss',
      'sass': 'sass',
      'less': 'less',
      'json': 'json',
      'yaml': 'yaml',
      'yml': 'yaml',
      'toml': 'toml',
      'ini': 'ini',
      'cfg': 'ini',
      'conf': 'ini',
      'sql': 'sql',
      'md': 'markdown',
      'markdown': 'markdown',
      'tex': 'latex',
      'r': 'r',
      'R': 'r',
      'matlab': 'matlab',
      'm': 'matlab',
      'pl': 'perl',
      'lua': 'lua',
      'vim': 'vim',
      'dockerfile': 'dockerfile',
      'makefile': 'makefile',
      'cmake': 'cmake',
      'gradle': 'gradle'
    };

    return languageMap[ext] || 'plaintext';
  };

  const highlightCode = () => {
    const codeElement = document.getElementById('code-content');
    if (!codeElement) return;

    try {
      if (language && language !== 'plaintext') {
        const highlighted = hljs.highlight(content, { language });
        codeElement.innerHTML = highlighted.value;
      } else {
        // Auto-detect language
        const highlighted = hljs.highlightAuto(content);
        codeElement.innerHTML = highlighted.value;
        setLanguage(highlighted.language || 'plaintext');
      }
    } catch (err) {
      console.error('Syntax highlighting failed:', err);
      codeElement.textContent = content;
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(content);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const downloadFile = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getFileStats = () => {
    const lines = content.split('\n').length;
    const chars = content.length;
    const words = content.split(/\s+/).filter(word => word.length > 0).length;
    const bytes = new Blob([content]).size;
    
    return { lines, chars, words, bytes };
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const stats = getFileStats();

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 text-white p-4 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center space-x-4">
          <FileText size={24} />
          <div>
            <h2 className="font-semibold">{fileName}</h2>
            <div className="text-sm text-gray-400 flex items-center space-x-4">
              <span>{stats.lines} lines</span>
              <span>{stats.words} words</span>
              <span>{formatBytes(stats.bytes)}</span>
              {language && language !== 'plaintext' && (
                <span className="bg-blue-600 px-2 py-1 rounded text-xs">
                  {language.toUpperCase()}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* View mode toggle */}
          <div className="flex bg-gray-700 rounded">
            <button
              onClick={() => setViewMode('highlighted')}
              className={`px-3 py-1 rounded-l flex items-center space-x-1 ${
                viewMode === 'highlighted' ? 'bg-blue-600' : 'hover:bg-gray-600'
              }`}
            >
              <Code size={16} />
              <span className="text-sm">Code</span>
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`px-3 py-1 rounded-r flex items-center space-x-1 ${
                viewMode === 'raw' ? 'bg-blue-600' : 'hover:bg-gray-600'
              }`}
            >
              <Eye size={16} />
              <span className="text-sm">Raw</span>
            </button>
          </div>

          {/* Options */}
          <button
            onClick={() => setLineNumbers(!lineNumbers)}
            className={`px-3 py-1 rounded text-sm ${
              lineNumbers ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            Line #
          </button>

          <button
            onClick={() => setWordWrap(!wordWrap)}
            className={`px-3 py-1 rounded text-sm ${
              wordWrap ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            Wrap
          </button>

          {/* Actions */}
          <button
            onClick={copyToClipboard}
            className="p-2 rounded hover:bg-gray-700"
            title="Copy to clipboard"
          >
            <Copy size={20} />
          </button>

          <button
            onClick={downloadFile}
            className="p-2 rounded hover:bg-gray-700"
            title="Download file"
          >
            <Download size={20} />
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-gray-700 text-xl"
          >
            ×
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-gray-900">
        {loading && (
          <div className="flex items-center justify-center h-full text-white">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
              <p>Loading file...</p>
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

        {!loading && !error && content && (
          <div className="h-full">
            {viewMode === 'highlighted' ? (
              <div className="flex h-full">
                {lineNumbers && (
                  <div className="bg-gray-800 text-gray-400 text-sm font-mono p-4 border-r border-gray-700 select-none">
                    {content.split('\n').map((_, index) => (
                      <div key={index} className="text-right pr-2">
                        {index + 1}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex-1 overflow-auto">
                  <pre className={`text-sm font-mono p-4 ${wordWrap ? 'whitespace-pre-wrap' : 'whitespace-pre'}`}>
                    <code id="code-content" className={`hljs language-${language}`}>
                      {content}
                    </code>
                  </pre>
                </div>
              </div>
            ) : (
              <div className="flex h-full">
                {lineNumbers && (
                  <div className="bg-gray-800 text-gray-400 text-sm font-mono p-4 border-r border-gray-700 select-none">
                    {content.split('\n').map((_, index) => (
                      <div key={index} className="text-right pr-2">
                        {index + 1}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex-1 overflow-auto">
                  <pre className={`text-sm font-mono p-4 text-gray-300 ${wordWrap ? 'whitespace-pre-wrap' : 'whitespace-pre'}`}>
                    {content}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};