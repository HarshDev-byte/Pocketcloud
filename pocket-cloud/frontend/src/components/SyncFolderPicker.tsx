import React, { useState, useEffect } from 'react';
import { 
  Folder, FolderOpen, Check, X, HardDrive, 
  ChevronRight, ChevronDown, Info 
} from 'lucide-react';
import { apiClient } from '../api/client';

interface FolderNode {
  id: string;
  name: string;
  path: string;
  size: number;
  fileCount: number;
  children: FolderNode[];
  isExpanded: boolean;
  isSelected: boolean;
  isExcluded: boolean;
  sizeEstimate: string;
}

interface SyncFolderPickerProps {
  userId: string;
  currentSelection: string[];
  onSelectionChange: (selectedPaths: string[]) => void;
  onClose: () => void;
}

export const SyncFolderPicker: React.FC<SyncFolderPickerProps> = ({
  userId,
  currentSelection,
  onSelectionChange,
  onClose
}) => {
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set(currentSelection));
  const [totalSize, setTotalSize] = useState(0);
  const [selectedSize, setSelectedSize] = useState(0);

  useEffect(() => {
    loadFolderTree();
  }, [userId]);

  useEffect(() => {
    calculateSelectedSize();
  }, [selectedPaths, folderTree]);

  const loadFolderTree = async () => {
    try {
      setLoading(true);
      
      // Get folder structure with size estimates
      const response = await apiClient.get('/api/files/tree?includeSize=true');
      const folders = response.data.folders || [];
      
      // Build tree structure
      const tree = buildFolderTree(folders);
      setFolderTree(tree);
      
      // Calculate total size
      const total = folders.reduce((sum: number, folder: any) => sum + (folder.size || 0), 0);
      setTotalSize(total);
      
    } catch (error) {
      console.error('Failed to load folder tree:', error);
    } finally {
      setLoading(false);
    }
  };

  const buildFolderTree = (folders: any[]): FolderNode[] => {
    const nodeMap = new Map<string, FolderNode>();
    const rootNodes: FolderNode[] = [];

    // Create nodes
    folders.forEach((folder: any) => {
      const node: FolderNode = {
        id: folder.id,
        name: folder.name,
        path: folder.path,
        size: folder.size || 0,
        fileCount: folder.fileCount || 0,
        children: [],
        isExpanded: false,
        isSelected: currentSelection.includes(folder.path),
        isExcluded: false,
        sizeEstimate: formatFileSize(folder.size || 0)
      };
      
      nodeMap.set(folder.path, node);
    });

    // Build hierarchy
    folders.forEach((folder: any) => {
      const node = nodeMap.get(folder.path);
      if (!node) return;

      const parentPath = getParentPath(folder.path);
      if (parentPath && nodeMap.has(parentPath)) {
        const parent = nodeMap.get(parentPath)!;
        parent.children.push(node);
      } else {
        rootNodes.push(node);
      }
    });

    return rootNodes.sort((a, b) => a.name.localeCompare(b.name));
  };

  const getParentPath = (path: string): string | null => {
    const parts = path.split('/').filter(Boolean);
    if (parts.length <= 1) return null;
    return '/' + parts.slice(0, -1).join('/');
  };

  const toggleFolder = (path: string) => {
    const updateNode = (nodes: FolderNode[]): FolderNode[] => {
      return nodes.map(node => {
        if (node.path === path) {
          return { ...node, isExpanded: !node.isExpanded };
        }
        return { ...node, children: updateNode(node.children) };
      });
    };

    setFolderTree(updateNode(folderTree));
  };

  const toggleSelection = (path: string, isSelected: boolean) => {
    const newSelection = new Set(selectedPaths);
    
    if (isSelected) {
      newSelection.add(path);
      // Remove any parent paths that are now redundant
      for (const selectedPath of newSelection) {
        if (selectedPath !== path && path.startsWith(selectedPath + '/')) {
          // This path is already covered by a parent
          return;
        }
      }
      // Remove any child paths that are now redundant
      for (const selectedPath of Array.from(newSelection)) {
        if (selectedPath !== path && selectedPath.startsWith(path + '/')) {
          newSelection.delete(selectedPath);
        }
      }
    } else {
      newSelection.delete(path);
    }
    
    setSelectedPaths(newSelection);
  };

  const calculateSelectedSize = () => {
    let size = 0;
    
    const calculateNodeSize = (nodes: FolderNode[]): void => {
      nodes.forEach(node => {
        if (selectedPaths.has(node.path)) {
          size += node.size;
        } else {
          // Check if any children are selected
          calculateNodeSize(node.children);
        }
      });
    };
    
    calculateNodeSize(folderTree);
    setSelectedSize(size);
  };

  const handleSave = () => {
    onSelectionChange(Array.from(selectedPaths));
    onClose();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const isPathSelected = (path: string): boolean => {
    // Check if this path or any parent path is selected
    for (const selectedPath of selectedPaths) {
      if (path === selectedPath || path.startsWith(selectedPath + '/')) {
        return true;
      }
    }
    return false;
  };

  const renderFolderNode = (node: FolderNode, depth: number = 0): React.ReactNode => {
    const isSelected = isPathSelected(node.path);
    const hasSelectedChildren = node.children.some(child => isPathSelected(child.path));
    
    return (
      <div key={node.path} className="select-none">
        <div 
          className={`flex items-center py-2 px-3 hover:bg-gray-50 cursor-pointer ${
            depth > 0 ? 'ml-' + (depth * 4) : ''
          }`}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
        >
          {/* Expand/Collapse */}
          {node.children.length > 0 && (
            <button
              onClick={() => toggleFolder(node.path)}
              className="mr-2 p-1 hover:bg-gray-200 rounded"
            >
              {node.isExpanded ? (
                <ChevronDown size={16} className="text-gray-500" />
              ) : (
                <ChevronRight size={16} className="text-gray-500" />
              )}
            </button>
          )}
          
          {/* Checkbox */}
          <button
            onClick={() => toggleSelection(node.path, !selectedPaths.has(node.path))}
            className={`mr-3 w-5 h-5 rounded border-2 flex items-center justify-center ${
              isSelected
                ? 'bg-blue-600 border-blue-600'
                : hasSelectedChildren
                ? 'bg-blue-100 border-blue-300'
                : 'border-gray-300 hover:border-blue-400'
            }`}
          >
            {isSelected && <Check size={12} className="text-white" />}
            {hasSelectedChildren && !isSelected && (
              <div className="w-2 h-2 bg-blue-400 rounded-sm" />
            )}
          </button>
          
          {/* Folder Icon */}
          {node.isExpanded ? (
            <FolderOpen size={16} className="text-blue-500 mr-2" />
          ) : (
            <Folder size={16} className="text-blue-500 mr-2" />
          )}
          
          {/* Folder Name and Info */}
          <div className="flex-1 flex items-center justify-between">
            <span className="font-medium text-gray-900">{node.name}</span>
            <div className="flex items-center text-sm text-gray-500 ml-4">
              <span className="mr-3">{node.fileCount} files</span>
              <span className="font-mono">{node.sizeEstimate}</span>
            </div>
          </div>
        </div>
        
        {/* Children */}
        {node.isExpanded && node.children.map(child => 
          renderFolderNode(child, depth + 1)
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading folder structure...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-blue-50 border-b border-blue-200 p-6">
          <div className="flex items-center">
            <HardDrive className="text-blue-600 mr-3" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Select Folders to Sync
              </h2>
              <p className="text-gray-600 mt-1">
                Choose which folders should be synchronized to this device.
              </p>
            </div>
          </div>
        </div>

        {/* Info Panel */}
        <div className="bg-yellow-50 border-b border-yellow-200 p-4">
          <div className="flex items-start">
            <Info className="text-yellow-600 mr-2 mt-0.5" size={16} />
            <div className="text-sm text-yellow-800">
              <p className="font-medium mb-1">Selective Sync</p>
              <p>
                Unselected folders will appear as placeholders and won't take up local storage. 
                You can sync them later by right-clicking the placeholder.
              </p>
            </div>
          </div>
        </div>

        {/* Folder Tree */}
        <div className="overflow-y-auto max-h-96 border-b border-gray-200">
          {folderTree.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Folder size={48} className="mx-auto mb-4 text-gray-300" />
              <p>No folders found</p>
            </div>
          ) : (
            <div className="py-2">
              {folderTree.map(node => renderFolderNode(node))}
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="bg-gray-50 p-4 border-b border-gray-200">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Total Size:</span>
              <span className="ml-2 font-mono">{formatFileSize(totalSize)}</span>
            </div>
            <div>
              <span className="text-gray-600">Selected Size:</span>
              <span className="ml-2 font-mono">{formatFileSize(selectedSize)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            {selectedPaths.size} folder{selectedPaths.size !== 1 ? 's' : ''} selected
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Save Selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};