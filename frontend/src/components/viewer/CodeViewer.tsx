import { useState, useEffect } from 'react';
import { Copy, Check, WrapText } from 'lucide-react';
import { FileItem } from '../../api/files.api';
import { Button } from '../ui';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import json from 'highlight.js/lib/languages/json';
import 'highlight.js/styles/github-dark.css';

// Register languages
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('java', java);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('css', css);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('json', json);

interface CodeViewerProps {
  file: FileItem;
}

export function CodeViewer({ file }: CodeViewerProps) {
  const [code, setCode] = useState('');
  const [highlightedCode, setHighlightedCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/files/${file.id}/download`)
      .then(res => res.text())
      .then(text => {
        setCode(text);
        
        // Detect language from extension
        const ext = file.name.split('.').pop()?.toLowerCase();
        const language = getLanguageFromExtension(ext || '');
        
        try {
          const result = hljs.highlight(text, { language });
          setHighlightedCode(result.value);
        } catch (error) {
          setHighlightedCode(text);
        }
        
        setLoading(false);
      })
      .catch(error => {
        console.error('Failed to load file:', error);
        setLoading(false);
      });
  }, [file.id, file.name]);

  const getLanguageFromExtension = (ext: string): string => {
    const map: Record<string, string> = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      java: 'java',
      cpp: 'cpp',
      c: 'cpp',
      h: 'cpp',
      css: 'css',
      scss: 'css',
      html: 'xml',
      xml: 'xml',
      json: 'json',
    };
    return map[ext] || 'plaintext';
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-surface-900">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  const lines = code.split('\n');
  const isTooLarge = lines.length > 2000;

  return (
    <div className="w-full h-full bg-surface-900 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-800 border-b border-surface-700">
        <div className="text-sm text-surface-400">
          {lines.length} lines
          {isTooLarge && ' (showing first 2000)'}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setWordWrap(!wordWrap)}
            variant="secondary"
            size="sm"
            className={wordWrap ? 'bg-brand-500/20' : ''}
          >
            <WrapText className="w-4 h-4" />
          </Button>
          <Button onClick={handleCopy} variant="secondary" size="sm">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>
      </div>

      {/* Code */}
      <div className="flex-1 overflow-auto">
        <div className="flex">
          {/* Line numbers */}
          <div className="flex-shrink-0 px-4 py-4 bg-surface-800 text-surface-500 text-right select-none font-mono text-sm">
            {lines.slice(0, isTooLarge ? 2000 : lines.length).map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>

          {/* Code content */}
          <pre
            className={`flex-1 p-4 font-mono text-sm overflow-x-auto ${
              wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
            }`}
          >
            <code
              dangerouslySetInnerHTML={{
                __html: highlightedCode.split('\n').slice(0, isTooLarge ? 2000 : lines.length).join('\n'),
              }}
            />
          </pre>
        </div>
      </div>

      {isTooLarge && (
        <div className="px-4 py-3 bg-amber-500/10 border-t border-amber-500/20 text-amber-200 text-sm text-center">
          File is too large. Showing first 2000 lines. Download to view the complete file.
        </div>
      )}
    </div>
  );
}
