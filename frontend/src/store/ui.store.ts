import { create } from 'zustand';

interface UIStore {
  // Sidebar
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;

  // View mode
  viewMode: 'grid' | 'list';
  setViewMode: (v: 'grid' | 'list') => void;

  // Sort
  sortBy: 'name' | 'size' | 'date' | 'type';
  sortDir: 'asc' | 'desc';
  setSort: (by: UIStore['sortBy'], dir: UIStore['sortDir']) => void;

  // Search
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;

  // Upload panel
  uploadPanelOpen: boolean;
  setUploadPanelOpen: (v: boolean) => void;

  // Selection
  selectedIds: Set<string>;
  lastSelectedId: string | null;
  selectItem: (id: string, mode: 'single' | 'multi' | 'range') => void;
  clearSelection: () => void;
  selectAll: (ids: string[]) => void;

  // Modal stack
  activeModal: string | null;
  modalData: unknown;
  openModal: (name: string, data?: unknown) => void;
  closeModal: () => void;
}

export const useUIStore = create<UIStore>((set, get) => ({
  sidebarOpen: true,
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

  viewMode: 'grid',
  setViewMode: (v) => set({ viewMode: v }),

  sortBy: 'name',
  sortDir: 'asc',
  setSort: (sortBy, sortDir) => set({ sortBy, sortDir }),

  searchOpen: false,
  setSearchOpen: (v) => set({ searchOpen: v }),

  uploadPanelOpen: false,
  setUploadPanelOpen: (v) => set({ uploadPanelOpen: v }),

  selectedIds: new Set(),
  lastSelectedId: null,

  selectItem: (id, mode) => {
    const { selectedIds } = get();
    if (mode === 'single') {
      set({ selectedIds: new Set([id]), lastSelectedId: id });
    } else if (mode === 'multi') {
      const next = new Set(selectedIds);
      next.has(id) ? next.delete(id) : next.add(id);
      set({ selectedIds: next, lastSelectedId: id });
    }
    // Range selection would need file list context
  },

  clearSelection: () => set({ selectedIds: new Set(), lastSelectedId: null }),
  selectAll: (ids) => set({ selectedIds: new Set(ids) }),

  activeModal: null,
  modalData: null,
  openModal: (name, data) => set({ activeModal: name, modalData: data }),
  closeModal: () => set({ activeModal: null, modalData: null }),
}));
