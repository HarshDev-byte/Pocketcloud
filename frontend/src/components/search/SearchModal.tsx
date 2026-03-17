import { useState, useEffect, useRef } from 'react';
import { Search, X, Filter, Clock, Folder, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '../ui';
import { getFileTypeInfo, formatFileSize } from '../../lib/fileTypes';
import { api } from '../../lib/api';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelect: (fileId: string) => void;
}

interface SearchResult {
  id: string;
  name: string;
  type: 'file' | 'folder';
  mime_type?: string;
  size?: number;
  path: string;
  snippet?: string;
  updated_at: number;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  duration: number;
}

export function SearchModal({ isOpen, onClose, onFileSelect }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filters, setFilters] = useState({
    type: 'all',
    dateRange: 'any',
    sizeRange: 'any',
  });
  
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['search', query, filters],
    queryFn: async (): Promise<SearchResponse> => {
      if (!query.trim()) {
        return { results: [], total: 0, duration: 0 };
      }

      const params = new URLSearchParams({
        q: query,
        type: filters.type,
        date: filters.dateRange,
        size: filters.sizeRange,
      });

      const response = await api.get(`/api/search?${params}`);
      return response.data;
    },
    enabled: isOpen && query.length > 0,
    staleTime: 30000, // 30 seconds
  });

  const { data: recentSearches } = useQuery({
    queryKey: ['recent-searches'],
    queryFn: async () => {
      const response = await api.get('/api/search/recent');
      return response.data.searches || [];
    },
    enabled: isOpen && !query,
  });

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => 
          Math.min(prev + 1, (searchResults?.results.length || 0) - 1)
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const result = searchResults?.results[selectedIndex];
        if (result) {
          if (result.type === 'file') {
            onFileSelect(result.id);
          } else {
            window.location.href = `/files/${result.id}`;
          }
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, searchResults, onClose, onFileSelect]);

  const parseSmartFilters = (searchQuery: string) => {
    const filters: any = {};
    let cleanQuery = searchQuery;

    // Extract type: filter
    const typeMatch = searchQuery.match(/type:(\w+)/i);
    if (typeMatch) {
      filters.type = typeMatch[1].toLowerCase();
      cleanQuery = cleanQuery.replace(/type:\w+/gi, '').trim();
    }

    // Extract size: filter
    const sizeMatch = searchQuery.match(/size:([><]?\d+(?:kb|mb|gb)?)/i);
    if (sizeMatch) {
      filters.size = sizeMatch[1].toLowerCase();
      cleanQuery = cleanQuery.replace(/size:[><]?\d+(?:kb|mb|gb)?/gi, '').trim();
    }

    return { filters, cleanQuery };
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setSelectedIndex(0);
    
    // Parse smart filters
    const { filters: smartFilters } = parseSmartFilters(value);
    if (smartFilters.type) {
      setFilters(prev => ({ ...prev, type: smartFilters.type }));
    }
  };

  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
  };

  if (!isOpen) return null;

  const results = searchResults?.results || [];
  const showRecentSearches = !query && recentSearches?.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[10vh]">
      <div className="w-full max-w-2xl mx-4 bg-white dark:bg-surface-800 rounded-xl shadow-2xl border border-surface-200 dark:border-surface-700 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 p-4 border-b border-surface-200 dark:border-surface-700">
          <Search className="w-5 h-5 text-surface-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search files, folders, content..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            className="flex-1 bg-transparent text-surface-900 dark:text-surface-100 placeholder-surface-500 focus:outline-none"
          />
          {isLoading && <Spinner size="sm" />}
          <button
            onClick={onClose}
            className="p-1 hover:bg-surface-100 dark:hover:bg-surface-700 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 px-4 py-2 bg-surface-50 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-700">
          <Filter className="w-4 h-4 text-surface-500" />
          <select
            value={filters.type}
            onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
            className="text-sm bg-transparent border-0 focus:outline-none text-surface-700 dark:text-surface-300"
          >
            <option value="all">All types</option>
            <option value="pdf">PDFs</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="audio">Audio</option>
            <option value="document">Documents</option>
            <option value="folder">Folders</option>
          </select>
          
          <select
            value={filters.dateRange}
            onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value }))}
            className="text-sm bg-transparent border-0 focus:outline-none text-surface-700 dark:text-surface-300"
          >
            <option value="any">Any date</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="year">This year</option>
          </select>

          <select
            value={filters.sizeRange}
            onChange={(e) => setFilters(prev => ({ ...prev, sizeRange: e.target.value }))}
            className="text-sm bg-transparent border-0 focus:outline-none text-surface-700 dark:text-surface-300"
          >
            <option value="any">Any size</option>
            <option value="small">&lt; 1 MB</option>
            <option value="medium">1-10 MB</option>
            <option value="large">10-100 MB</option>
            <option value="huge">&gt; 100 MB</option>
          </select>
        </div>

        {/* Results */}
        <div ref={resultsRef} className="max-h-96 overflow-y-auto">
          {showRecentSearches ? (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-surface-500" />
                <span className="text-sm font-medium text-surface-600 dark:text-surface-400">
                  Recent searches
                </span>
              </div>
              {recentSearches.map((search: string, index: number) => (
                <button
                  key={index}
                  onClick={() => setQuery(search)}
                  className="block w-full text-left px-3 py-2 text-sm text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 rounded transition-colors"
                >
                  {search}
                </button>
              ))}
            </div>
          ) : results.length > 0 ? (
            <div>
              {/* Results header */}
              <div className="px-4 py-2 bg-surface-50 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-700">
                <span className="text-sm text-surface-600 dark:text-surface-400">
                  {searchResults?.total} results · {searchResults?.duration}ms
                </span>
              </div>

              {/* Results list */}
              {results.map((result, index) => {
                const isSelected = index === selectedIndex;
                const fileTypeInfo = result.type === 'file' 
                  ? getFileTypeInfo(result.mime_type || '', result.name)
                  : null;

                return (
                  <button
                    key={result.id}
                    onClick={() => {
                      if (result.type === 'file') {
                        onFileSelect(result.id);
                      } else {
                        window.location.href = `/files/${result.id}`;
                      }
                      onClose();
                    }}
                    className={`w-full flex items-start gap-3 p-4 text-left transition-colors ${
                      isSelected 
                        ? 'bg-brand-50 dark:bg-brand-900/20' 
                        : 'hover:bg-surface-50 dark:hover:bg-surface-800'
                    }`}
                  >
                    <div className="flex-shrink-0 mt-1">
                      {result.type === 'folder' ? (
                        <Folder className="w-5 h-5 text-brand-500" />
                      ) : fileTypeInfo ? (
                        <fileTypeInfo.icon className={`w-5 h-5 ${fileTypeInfo.color}`} />
                      ) : (
                        <FileText className="w-5 h-5 text-surface-500" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-surface-900 dark:text-surface-100 truncate">
                          {result.name}
                        </span>
                        {result.type === 'file' && result.size && (
                          <span className="text-xs text-surface-500">
                            {formatFileSize(result.size)}
                          </span>
                        )}
                      </div>
                      
                      <div className="text-sm text-surface-600 dark:text-surface-400 mb-1">
                        {result.path}
                      </div>

                      {result.snippet && (
                        <div className="text-sm text-surface-500 italic">
                          ...{result.snippet}...
                        </div>
                      )}

                      <div className="text-xs text-surface-500 mt-1">
                        {formatRelativeTime(result.updated_at)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : query && !isLoading ? (
            <div className="p-8 text-center">
              <Search className="w-12 h-12 text-surface-400 mx-auto mb-3" />
              <p className="text-surface-600 dark:text-surface-400">
                No results found for "{query}"
              </p>
              <p className="text-sm text-surface-500 mt-1">
                    Try different keywords or check your filters
              </p>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-surface-50 dark:bg-surface-900 border-t border-surface-200 dark:border-surface-700">
          <div className="flex items-center justify-between text-xs text-surface-500">
            <span>↑↓ to navigate • Enter to open • Esc to close</span>
            <span>Search tip: try "type:pdf" or "size:&gt;10mb"</span>
          </div>
        </div>
      </div>
    </div>
  );
}