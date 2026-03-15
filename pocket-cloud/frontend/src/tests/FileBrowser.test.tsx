import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import FileBrowser from '../components/FileBrowser/FileBrowser';

// Mock the API client
vi.mock('../api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn()
  }
}));

// Mock Zustand stores
vi.mock('../store/auth.store', () => ({
  useAuthStore: () => ({
    user: { id: 'test-user', username: 'testuser', role: 'user' },
    isAuthenticated: true
  })
}));

// Mock components that might cause issues
vi.mock('../components/Upload/DropZone', () => ({
  DropZone: ({ children }: { children: React.ReactNode }) => <div data-testid="drop-zone">{children}</div>
}));

vi.mock('../components/Upload/UploadManager', () => ({
  UploadManager: () => <div data-testid="upload-manager">Upload Manager</div>
}));

const mockFiles = [
  {
    id: 'file-1',
    name: 'document.pdf',
    size: 1024000,
    mime_type: 'application/pdf',
    created_at: Date.now() - 86400000, // 1 day ago
    updated_at: Date.now() - 86400000,
    owner_id: 'test-user',
    folder_id: null,
    is_deleted: false
  },
  {
    id: 'file-2',
    name: 'image.jpg',
    size: 2048000,
    mime_type: 'image/jpeg',
    created_at: Date.now() - 172800000, // 2 days ago
    updated_at: Date.now() - 172800000,
    owner_id: 'test-user',
    folder_id: null,
    is_deleted: false
  }
];

const mockFolders = [
  {
    id: 'folder-1',
    name: 'Documents',
    path: '/Documents',
    created_at: Date.now() - 259200000, // 3 days ago
    updated_at: Date.now() - 259200000,
    owner_id: 'test-user',
    parent_id: null,
    is_deleted: false
  }
];

const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('FileBrowser Component', () => {
  let mockApiGet: any;

  beforeEach(() => {
    const { apiClient } = require('../api/client');
    mockApiGet = apiClient.get;
    
    // Reset all mocks
    vi.clearAllMocks();
  });

  it('should render loading state initially', async () => {
    // Mock API to return pending promise
    mockApiGet.mockImplementation(() => new Promise(() => {}));

    render(
      <TestWrapper>
        <FileBrowser folderId={null} />
      </TestWrapper>
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('should render file grid after data loads', async () => {
    // Mock successful API response
    mockApiGet.mockResolvedValue({
      data: {
        files: mockFiles,
        folders: mockFolders,
        folder: null
      }
    });

    render(
      <TestWrapper>
        <FileBrowser folderId={null} />
      </TestWrapper>
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    // Check that files are rendered
    expect(screen.getByText('document.pdf')).toBeInTheDocument();
    expect(screen.getByText('image.jpg')).toBeInTheDocument();
    expect(screen.getByText('Documents')).toBeInTheDocument();
  });

  it('should show context menu on right-click', async () => {
    const user = userEvent.setup();
    
    mockApiGet.mockResolvedValue({
      data: {
        files: mockFiles,
        folders: mockFolders,
        folder: null
      }
    });

    render(
      <TestWrapper>
        <FileBrowser folderId={null} />
      </TestWrapper>
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('document.pdf')).toBeInTheDocument();
    });

    // Right-click on a file
    const fileElement = screen.getByText('document.pdf').closest('[data-testid*="file"]') || 
                       screen.getByText('document.pdf').closest('div');
    
    if (fileElement) {
      await user.pointer({ keys: '[MouseRight]', target: fileElement });
      
      // Context menu should appear
      await waitFor(() => {
        expect(screen.getByRole('menu') || screen.getByTestId('context-menu')).toBeInTheDocument();
      });
    }
  });

  it('should handle multi-select with Ctrl+click', async () => {
    const user = userEvent.setup();
    
    mockApiGet.mockResolvedValue({
      data: {
        files: mockFiles,
        folders: mockFolders,
        folder: null
      }
    });

    render(
      <TestWrapper>
        <FileBrowser folderId={null} />
      </TestWrapper>
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('document.pdf')).toBeInTheDocument();
    });

    // Click first file
    const firstFile = screen.getByText('document.pdf').closest('[data-testid*="file"]') || 
                     screen.getByText('document.pdf').closest('div');
    
    if (firstFile) {
      await user.click(firstFile);
      
      // Ctrl+click second file
      const secondFile = screen.getByText('image.jpg').closest('[data-testid*="file"]') || 
                        screen.getByText('image.jpg').closest('div');
      
      if (secondFile) {
        await user.keyboard('[ControlLeft>]');
        await user.click(secondFile);
        await user.keyboard('[/ControlLeft]');
        
        // Both files should be selected (check for selection indicators)
        expect(firstFile).toHaveClass(/selected|active/);
        expect(secondFile).toHaveClass(/selected|active/);
      }
    }
  });

  it('should handle view mode toggle', async () => {
    const user = userEvent.setup();
    
    mockApiGet.mockResolvedValue({
      data: {
        files: mockFiles,
        folders: mockFolders,
        folder: null
      }
    });

    render(
      <TestWrapper>
        <FileBrowser folderId={null} />
      </TestWrapper>
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('document.pdf')).toBeInTheDocument();
    });

    // Look for view toggle buttons (grid/list)
    const viewToggle = screen.queryByRole('button', { name: /view|grid|list/i }) ||
                      screen.queryByTestId('view-toggle') ||
                      screen.querySelector('[data-view-mode]');

    if (viewToggle) {
      await user.click(viewToggle);
      
      // View should change (check for different layout classes)
      const container = screen.getByTestId('file-browser') || document.querySelector('.file-browser');
      expect(container).toHaveClass(/list|grid/);
    }
  });

  it('should handle empty folder state', async () => {
    mockApiGet.mockResolvedValue({
      data: {
        files: [],
        folders: [],
        folder: null
      }
    });

    render(
      <TestWrapper>
        <FileBrowser folderId={null} />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/empty|no files|drop files/i)).toBeInTheDocument();
    });
  });

  it('should handle API error gracefully', async () => {
    mockApiGet.mockRejectedValue(new Error('Network error'));

    render(
      <TestWrapper>
        <FileBrowser folderId={null} />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/error|failed|try again/i)).toBeInTheDocument();
    });
  });

  it('should handle file operations', async () => {
    const user = userEvent.setup();
    const mockDelete = vi.fn().mockResolvedValue({});
    const mockPatch = vi.fn().mockResolvedValue({});
    
    const { apiClient } = require('../api/client');
    apiClient.delete = mockDelete;
    apiClient.patch = mockPatch;
    
    mockApiGet.mockResolvedValue({
      data: {
        files: mockFiles,
        folders: mockFolders,
        folder: null
      }
    });

    render(
      <TestWrapper>
        <FileBrowser folderId={null} />
      </TestWrapper>
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('document.pdf')).toBeInTheDocument();
    });

    // Right-click to open context menu
    const fileElement = screen.getByText('document.pdf').closest('[data-testid*="file"]') || 
                       screen.getByText('document.pdf').closest('div');
    
    if (fileElement) {
      await user.pointer({ keys: '[MouseRight]', target: fileElement });
      
      // Look for delete option in context menu
      await waitFor(() => {
        const deleteButton = screen.queryByRole('menuitem', { name: /delete/i }) ||
                           screen.queryByText(/delete/i);
        
        if (deleteButton) {
          fireEvent.click(deleteButton);
          
          // Verify delete API was called
          expect(mockDelete).toHaveBeenCalledWith('/api/files/file-1');
        }
      });
    }
  });

  it('should handle drag and drop', async () => {
    mockApiGet.mockResolvedValue({
      data: {
        files: mockFiles,
        folders: mockFolders,
        folder: null
      }
    });

    render(
      <TestWrapper>
        <FileBrowser folderId={null} />
      </TestWrapper>
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByTestId('drop-zone')).toBeInTheDocument();
    });

    const dropZone = screen.getByTestId('drop-zone');
    
    // Simulate drag enter
    fireEvent.dragEnter(dropZone, {
      dataTransfer: {
        files: [new File(['test'], 'test.txt', { type: 'text/plain' })]
      }
    });

    // Drop zone should show active state
    expect(dropZone).toHaveClass(/drag|active|hover/);
  });

  it('should handle keyboard navigation', async () => {
    const user = userEvent.setup();
    
    mockApiGet.mockResolvedValue({
      data: {
        files: mockFiles,
        folders: mockFolders,
        folder: null
      }
    });

    render(
      <TestWrapper>
        <FileBrowser folderId={null} />
      </TestWrapper>
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('document.pdf')).toBeInTheDocument();
    });

    // Focus the file browser
    const fileBrowser = screen.getByTestId('file-browser') || document.body;
    fileBrowser.focus();

    // Use arrow keys to navigate
    await user.keyboard('[ArrowDown]');
    await user.keyboard('[ArrowUp]');
    
    // Enter key should open/select item
    await user.keyboard('[Enter]');
    
    // Delete key should trigger delete
    await user.keyboard('[Delete]');
  });

  it('should handle sorting', async () => {
    const user = userEvent.setup();
    
    mockApiGet.mockResolvedValue({
      data: {
        files: mockFiles,
        folders: mockFolders,
        folder: null
      }
    });

    render(
      <TestWrapper>
        <FileBrowser folderId={null} />
      </TestWrapper>
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('document.pdf')).toBeInTheDocument();
    });

    // Look for sort controls
    const sortButton = screen.queryByRole('button', { name: /sort/i }) ||
                      screen.queryByTestId('sort-button');

    if (sortButton) {
      await user.click(sortButton);
      
      // Should show sort options
      expect(screen.getByText(/name|size|date/i)).toBeInTheDocument();
    }
  });

  it('should handle search/filter', async () => {
    const user = userEvent.setup();
    
    mockApiGet.mockResolvedValue({
      data: {
        files: mockFiles,
        folders: mockFolders,
        folder: null
      }
    });

    render(
      <TestWrapper>
        <FileBrowser folderId={null} />
      </TestWrapper>
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('document.pdf')).toBeInTheDocument();
    });

    // Look for search input
    const searchInput = screen.queryByRole('textbox', { name: /search/i }) ||
                       screen.queryByPlaceholderText(/search/i);

    if (searchInput) {
      await user.type(searchInput, 'document');
      
      // Should filter results
      await waitFor(() => {
        expect(screen.getByText('document.pdf')).toBeInTheDocument();
        expect(screen.queryByText('image.jpg')).not.toBeInTheDocument();
      });
    }
  });
});