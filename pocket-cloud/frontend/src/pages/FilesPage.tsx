import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Upload, 
  Search, 
  Grid3X3, 
  List, 
  SortAsc, 
  Filter,
  FolderPlus,
  MoreHorizontal,
  Menu,
  X,
  Files,
  Share2,
  Trash2,
  Settings,
  HardDrive
} from 'lucide-react';
import { ViewMode, SortConfig } from '../types/files';
import FileBrowser from '../components/FileBrowser';
import Breadcrumb from '../components/Breadcrumb';
import UploadDropZone from '../components/UploadDropZone';
import StorageMeter from '../components/StorageMeter';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

const FilesPage: React.FC = () => {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: 'name',
    direction: 'asc',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Fetch folder data for breadcrumbs
  const { data: folderData } = useQuery({
    queryKey: ['folder', folderId],
    queryFn: async () => {
      if (folderId) {
        const response = await apiClient.get(`/folders/${folderId}`);
        return response.data;
      } else {
        const response = await apiClient.get('/folders');
        return response.data;
      }
    },
    staleTime: 30000,
  });

  const handleSortChange = (field: string) => {
    setSortConfig(prev => ({
      field: field as any,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleCreateFolder = () => {
    const name = prompt('Enter folder name:');
    if (name && name.trim()) {
      // TODO: Implement folder creation
      console.log('Create folder:', name, 'in', folderId);
    }
  };

  const handleUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length > 0) {
        // TODO: Trigger upload
        console.log('Upload files:', files);
      }
    };
    input.click();
  };

  // Build breadcrumb items
  const breadcrumbItems = React.useMemo(() => {
    const items = [{ id: null, name: 'My Files', path: '/' }];
    
    if (folderData?.path) {
      folderData.path.forEach((item: any) => {
        items.push({
          id: item.id,
          name: item.name,
          path: `/files/${item.id}`
        });
      });
    }
    
    return items;
  }, [folderData]);

  // Sidebar navigation items
  const sidebarItems = [
    { id: 'files', label: 'My Files', icon: Files, path: '/files', active: true },
    { id: 'shared', label: 'Shared', icon: Share2, path: '/shared', active: false },
    { id: 'trash', label: 'Trash', icon: Trash2, path: '/trash', active: false },
    { id: 'settings', label: 'Settings', icon: Settings, path: '/settings', active: false },
  ];

  // Close mobile sidebar when route changes
  useEffect(() => {
    setShowMobileSidebar(false);
  }, [folderId]);

  // Selection toolbar actions
  const selectionActions = selectedItems.size > 0 && (
    <div className="flex items-center space-x-3 bg-pcd-blue-50 dark:bg-pcd-blue-900/20 px-4 py-2 rounded-lg">
      <button
        onClick={() => setSelectedItems(new Set())}
        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
      >
        <X className="w-4 h-4" />
      </button>
      <span className="text-sm font-medium text-pcd-blue-700 dark:text-pcd-blue-300">
        {selectedItems.size} selected
      </span>
      <div className="flex items-center space-x-2">
        <button className="p-2 text-pcd-blue-600 hover:bg-pcd-blue-100 dark:hover:bg-pcd-blue-800 rounded">
          <Upload className="w-4 h-4" />
        </button>
        <button className="p-2 text-pcd-blue-600 hover:bg-pcd-blue-100 dark:hover:bg-pcd-blue-800 rounded">
          <MoreHorizontal className="w-4 h-4" />
        </button>
        <button className="p-2 text-pcd-blue-600 hover:bg-pcd-blue-100 dark:hover:bg-pcd-blue-800 rounded">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex bg-gray-50 dark:bg-gray-900">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:flex-col md:w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">PocketCloud</h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={`
                w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors
                ${item.active 
                  ? 'bg-pcd-blue-100 text-pcd-blue-700 dark:bg-pcd-blue-900 dark:text-pcd-blue-300' 
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                }
              `}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Storage Meter */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <StorageMeter />
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setShowMobileSidebar(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-white dark:bg-gray-800 shadow-xl">
            {/* Mobile Sidebar Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">PocketCloud</h1>
              <button
                onClick={() => setShowMobileSidebar(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Navigation */}
            <nav className="p-4 space-y-2">
              {sidebarItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    navigate(item.path);
                    setShowMobileSidebar(false);
                  }}
                  className={`
                    w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors
                    ${item.active 
                      ? 'bg-pcd-blue-100 text-pcd-blue-700 dark:bg-pcd-blue-900 dark:text-pcd-blue-300' 
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    }
                  `}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </button>
              ))}
            </nav>

            {/* Mobile Storage Meter */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <StorageMeter />
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <div className="md:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowMobileSidebar(true)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">PocketCloud</h1>
            </div>
          </div>
        </div>

        {/* Desktop/Mobile Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4">
          {/* Breadcrumb */}
          <div className="mb-4">
            <Breadcrumb items={breadcrumbItems} />
          </div>

          {/* Toolbar */}
          {selectedItems.size > 0 ? (
            selectionActions
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {/* Upload button */}
                <button 
                  onClick={handleUpload}
                  className="
                    inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium 
                    rounded-md text-white bg-pcd-blue-600 hover:bg-pcd-blue-700 focus:outline-none 
                    focus:ring-2 focus:ring-offset-2 focus:ring-pcd-blue-500 min-h-touch
                    dark:focus:ring-offset-gray-800
                  "
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload
                </button>

                {/* New folder button */}
                <button 
                  onClick={handleCreateFolder}
                  className="
                    inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 
                    text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 
                    hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 
                    focus:ring-offset-2 focus:ring-pcd-blue-500 min-h-touch
                    dark:focus:ring-offset-gray-800
                  "
                >
                  <FolderPlus className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">New Folder</span>
                </button>
              </div>

              <div className="flex items-center space-x-3">
                {/* Search - Hidden on mobile, shown on larger screens */}
                <div className="hidden sm:block relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search files..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="
                      block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 
                      rounded-md leading-5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white 
                      placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-1 
                      focus:ring-pcd-blue-500 focus:border-pcd-blue-500 sm:text-sm min-h-touch
                    "
                  />
                </div>

                {/* View options */}
                <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-md">
                  <button 
                    onClick={() => setViewMode('grid')}
                    className={`
                      p-2 rounded-l-md min-w-touch min-h-touch transition-colors
                      ${viewMode === 'grid' 
                        ? 'bg-pcd-blue-100 text-pcd-blue-600 dark:bg-pcd-blue-900 dark:text-pcd-blue-400' 
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                      }
                    `}
                  >
                    <Grid3X3 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setViewMode('list')}
                    className={`
                      p-2 rounded-r-md min-w-touch min-h-touch transition-colors
                      ${viewMode === 'list' 
                        ? 'bg-pcd-blue-100 text-pcd-blue-600 dark:bg-pcd-blue-900 dark:text-pcd-blue-400' 
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                      }
                    `}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>

                {/* Sort and more options */}
                <button className="
                  p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 
                  border border-gray-300 dark:border-gray-600 rounded-md min-w-touch min-h-touch
                ">
                  <SortAsc className="w-4 h-4" />
                </button>

                <button className="
                  p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 
                  border border-gray-300 dark:border-gray-600 rounded-md min-w-touch min-h-touch
                ">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 relative">
          <UploadDropZone folderId={folderId} />
          <FileBrowser
            folderId={folderId}
            viewMode={viewMode}
            sortConfig={sortConfig}
            searchQuery={searchQuery}
            selectedItems={selectedItems}
            onSortChange={handleSortChange}
            onSelectionChange={setSelectedItems}
          />
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="md:hidden bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-around py-2">
            {sidebarItems.slice(0, 3).map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className={`
                  flex flex-col items-center space-y-1 px-3 py-2 rounded-lg transition-colors min-w-touch
                  ${item.active 
                    ? 'text-pcd-blue-600 dark:text-pcd-blue-400' 
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  }
                `}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            ))}
            <button
              onClick={handleUpload}
              className="flex flex-col items-center space-y-1 px-3 py-2 rounded-lg transition-colors min-w-touch text-pcd-blue-600 dark:text-pcd-blue-400"
            >
              <Upload className="w-5 h-5" />
              <span className="text-xs font-medium">Upload</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilesPage;