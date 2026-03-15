import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { debounce } from 'lodash';

interface SearchResult {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: number;
  updatedAt: number;
  folderId: string | null;
  folderPath: string;
  breadcrumb: string[];
  highlight: string;
  score: number;
  tags?: string[];
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  took: number;
  suggestions?: string[];
}

interface SearchBarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  
  // Advanced search filters
  const [filters, setFilters] = useState({
    type: '',
    dateFrom: '',
    dateTo: '',
    sizeMin: '',
    sizeMax: '',
    folderId: '',
    sortBy: 'relevance'
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('pocketcloud-recent-searches');
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch (e) {
        // Invalid JSON, ignore
      }
    }
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K (Mac) or Ctrl+K (Win/Linux) to open search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (!isOpen) {
          // Open search (handled by parent component)
        }
      }

      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }

      // Arrow navigation in results
      if (isOpen && results.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, -1));
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
          e.preventDefault();
          handleResultClick(results[selectedIndex]);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, onClose]);

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce(async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setSuggestions([]);
        return;
      }

      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: searchQuery,
          limit: '20',
          ...filters
        });

        const response = await fetch(`/api/search?${params}`, {
          credentials: 'include'
        });

        if (response.ok) {
          const data: SearchResponse = await response.json();
          setResults(data.results);
          setSuggestions(data.suggestions || []);
        } else {
          setResults([]);
          setSuggestions([]);
        }
      } catch (error) {
        console.error('Search failed:', error);
        setResults([]);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 200),
    [filters]
  );

  // Trigger search when query changes
  useEffect(() => {
    debouncedSearch(query);
  }, [query, debouncedSearch]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setSelectedIndex(-1);
  };

  const handleResultClick = (result: SearchResult) => {
    // Add to recent searches
    const newRecent = [query, ...recentSearches.filter(s => s !== query)].slice(0, 10);
    setRecentSearches(newRecent);
    localStorage.setItem('pocketcloud-recent-searches', JSON.stringify(newRecent));

    // Navigate to file
    navigate(`/files?fileId=${result.id}`);
    onClose();
  };

  const handleRecentSearchClick = (searchQuery: string) => {
    setQuery(searchQuery);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    
    if (date.toDateString() === now.toDateString()) {
      return `Today ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (date.toDateString() === new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString()) {
      return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
    if (mimeType.includes('presentation')) return '📽️';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return '🗜️';
    if (mimeType.startsWith('text/')) return '📄';
    return '📁';
  };

  const groupResultsByType = (results: SearchResult[]) => {
    const groups: { [key: string]: SearchResult[] } = {};
    
    results.forEach(result => {
      let category = 'Other';
      if (result.mimeType.startsWith('image/')) category = 'Images';
      else if (result.mimeType.startsWith('video/')) category = 'Videos';
      else if (result.mimeType.startsWith('audio/')) category = 'Audio';
      else if (result.mimeType.includes('pdf') || result.mimeType.includes('document') || result.mimeType.startsWith('text/')) category = 'Documents';
      
      if (!groups[category]) groups[category] = [];
      groups[category].push(result);
    });

    return groups;
  };

  if (!isOpen) return null;

  const groupedResults = groupResultsByType(results);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      
      {/* Search Modal */}
      <div className="absolute top-16 left-1/2 transform -translate-x-1/2 w-full max-w-2xl mx-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700">
          {/* Search Input */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder="Search files... (try 'type:pdf', 'size:>10mb', 'date:today')"
                className="block w-full pl-10 pr-3 py-3 border-0 text-lg placeholder-gray-500 focus:ring-0 focus:outline-none bg-transparent dark:text-white"
              />
              {loading && (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                </div>
              )}
            </div>

            {/* Filter Chips */}
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={() => setFilters(prev => ({ ...prev, type: prev.type === 'image/*' ? '' : 'image/*' }))}
                className={`px-3 py-1 rounded-full text-sm ${
                  filters.type === 'image/*' 
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' 
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                📷 Images
              </button>
              <button
                onClick={() => setFilters(prev => ({ ...prev, type: prev.type === 'video/*' ? '' : 'video/*' }))}
                className={`px-3 py-1 rounded-full text-sm ${
                  filters.type === 'video/*' 
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' 
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                🎬 Videos
              </button>
              <button
                onClick={() => setFilters(prev => ({ ...prev, type: prev.type === 'application/pdf' ? '' : 'application/pdf' }))}
                className={`px-3 py-1 rounded-full text-sm ${
                  filters.type === 'application/pdf' 
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' 
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                📄 Docs
              </button>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
              >
                ⚙️ Advanced
              </button>
            </div>

            {/* Advanced Search */}
            {showAdvanced && (
              <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Date From
                    </label>
                    <input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Date To
                    </label>
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Sort By
                  </label>
                  <select
                    value={filters.sortBy}
                    onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="relevance">Relevance</option>
                    <option value="date">Date Modified</option>
                    <option value="name">Name</option>
                    <option value="size">Size</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Results */}
          <div ref={resultsRef} className="max-h-96 overflow-y-auto">
            {query.trim() === '' ? (
              /* Recent Searches and Suggestions */
              <div className="p-4">
                {recentSearches.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Recent Searches</h3>
                    <div className="space-y-1">
                      {recentSearches.slice(0, 5).map((search, index) => (
                        <button
                          key={index}
                          onClick={() => handleRecentSearchClick(search)}
                          className="w-full text-left px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                        >
                          🕒 {search}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  <p className="mb-2">Search tips:</p>
                  <ul className="space-y-1 text-xs">
                    <li>• <code>type:pdf</code> - Find PDF files</li>
                    <li>• <code>size:&gt;10mb</code> - Files larger than 10MB</li>
                    <li>• <code>date:today</code> - Files from today</li>
                    <li>• <code>in:Documents</code> - Search in specific folder</li>
                  </ul>
                </div>
              </div>
            ) : results.length === 0 && !loading ? (
              /* No Results */
              <div className="p-8 text-center">
                <div className="text-gray-400 mb-2">
                  <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.47-.881-6.08-2.33" />
                  </svg>
                </div>
                <p className="text-gray-500 dark:text-gray-400">No files found</p>
                {suggestions.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-400 mb-2">Did you mean:</p>
                    <div className="space-y-1">
                      {suggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="block mx-auto px-3 py-1 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Search Results */
              <div className="p-2">
                {Object.entries(groupedResults).map(([category, categoryResults]) => (
                  <div key={category} className="mb-4">
                    <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide px-3 py-2">
                      {category} ({categoryResults.length})
                    </h3>
                    <div className="space-y-1">
                      {categoryResults.map((result, index) => {
                        const globalIndex = results.indexOf(result);
                        return (
                          <button
                            key={result.id}
                            onClick={() => handleResultClick(result)}
                            className={`w-full text-left px-3 py-3 rounded-lg transition-colors ${
                              selectedIndex === globalIndex
                                ? 'bg-blue-100 dark:bg-blue-900'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                          >
                            <div className="flex items-start space-x-3">
                              <div className="text-2xl">{getFileIcon(result.mimeType)}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <p 
                                    className="text-sm font-medium text-gray-900 dark:text-white truncate"
                                    dangerouslySetInnerHTML={{ __html: result.highlight || result.name }}
                                  />
                                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                                    {formatFileSize(result.size)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between mt-1">
                                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {result.breadcrumb.length > 0 ? result.breadcrumb.join(' / ') : 'Root'}
                                  </p>
                                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                                    {formatDate(result.updatedAt)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {results.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
              Found {results.length} results • Use ↑↓ to navigate, Enter to open
            </div>
          )}
        </div>
      </div>
    </div>
  );
};