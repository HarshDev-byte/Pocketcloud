# PocketCloud Project Structure

## 📁 Root Directory

```
pocketcloud/
├── .gitignore              # Git ignore patterns
├── README.md               # Main project documentation
├── STRUCTURE.md           # This file - project structure guide
├── backend/               # Node.js backend application
├── frontend/              # React frontend application
└── docs/                  # Documentation and deployment guides
```

## 🖥️ Backend Structure

```
backend/
├── package.json           # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── vitest.config.ts      # Test configuration
├── .env.example          # Environment variables template
└── src/
    ├── index.ts          # Main application entry point
    ├── websocket.ts      # WebSocket server setup
    ├── db/               # Database layer
    │   ├── client.ts     # Database connection and setup
    │   ├── types.ts      # TypeScript database types
    │   └── migrations/   # Database schema migrations (22 files)
    ├── routes/           # API endpoint definitions (25 route files)
    │   ├── auth.routes.ts
    │   ├── files.routes.ts
    │   ├── upload.routes.ts
    │   └── ...
    ├── services/         # Business logic layer (31 service files)
    │   ├── auth.service.ts
    │   ├── file.service.ts
    │   ├── upload.service.ts
    │   └── ...
    ├── middleware/       # Express middleware
    │   ├── auth.middleware.ts
    │   ├── security.middleware.ts
    │   ├── ratelimit.middleware.ts
    │   └── ...
    ├── utils/           # Utility functions
    │   ├── logger.ts
    │   ├── errors.ts
    │   ├── cache.ts
    │   └── ...
    ├── jobs/            # Background jobs
    │   └── cleanup.job.ts
    └── tests/           # Test files
        └── unit/        # Unit tests (42 tests)
```

## 🎨 Frontend Structure

```
frontend/
├── package.json          # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── vite.config.ts       # Vite build configuration
├── tailwind.config.ts   # Tailwind CSS configuration
├── postcss.config.js    # PostCSS configuration
├── index.html           # HTML entry point
├── .env.example         # Environment variables template
└── src/
    ├── App.tsx          # Main React application
    ├── router.tsx       # React Router configuration
    ├── main.tsx         # Application entry point
    ├── pages/           # Page components (10 pages)
    │   ├── LoginPage.tsx
    │   ├── SetupWizardPage.tsx
    │   ├── FilesPage.tsx
    │   ├── PhotosPage.tsx
    │   └── ...
    ├── components/      # Reusable React components
    │   ├── ui/          # Base UI components (18 components)
    │   │   ├── Button.tsx
    │   │   ├── Modal.tsx
    │   │   ├── Input.tsx
    │   │   └── ...
    │   ├── layout/      # Layout components (3 components)
    │   │   ├── Header.tsx
    │   │   ├── Sidebar.tsx
    │   │   └── MainContent.tsx
    │   ├── files/       # File management components (8 components)
    │   │   ├── FileGrid.tsx
    │   │   ├── FileList.tsx
    │   │   ├── FileCard.tsx
    │   │   └── ...
    │   ├── upload/      # Upload system components (2 components)
    │   │   ├── DropZone.tsx
    │   │   └── UploadPanel.tsx
    │   ├── viewer/      # File viewer components (7 components)
    │   │   ├── ImageViewer.tsx
    │   │   ├── VideoPlayer.tsx
    │   │   ├── PDFViewer.tsx
    │   │   └── ...
    │   ├── search/      # Search components (1 component)
    │   │   └── SearchModal.tsx
    │   └── share/       # Sharing components (1 component)
    │       └── ShareDialog.tsx
    ├── hooks/           # Custom React hooks (3 hooks)
    │   ├── useFileBrowser.ts
    │   ├── useUpload.ts
    │   └── useRealtimeSync.ts
    ├── store/           # State management (3 Zustand stores)
    │   ├── auth.store.ts
    │   ├── files.store.ts
    │   └── ui.store.ts
    ├── api/             # API client functions (3 API modules)
    │   ├── auth.api.ts
    │   ├── files.api.ts
    │   └── upload.api.ts
    ├── lib/             # Utility libraries
    │   ├── api.ts       # Axios configuration
    │   ├── fileTypes.ts # File type utilities
    │   └── utils.ts     # General utilities
    └── styles/          # CSS styles
        └── globals.css  # Global Tailwind styles
```

## 📚 Documentation Structure

```
docs/
├── README.md            # Documentation index
├── deployment/          # Deployment and setup guides
│   ├── README.md        # Quick deployment guide
│   ├── setup-network.sh # Network configuration script
│   └── setup-storage.sh # Storage setup script
├── user-guide/          # End-user documentation
│   └── README.md        # User guide and tutorials
├── features/            # Feature-specific documentation
│   ├── AUTO_PHOTO_BACKUP.md
│   ├── FILE_PIPELINE_RULES.md
│   ├── FOLDER_SYNC_PROTOCOL.md
│   ├── HEALTH_MONITOR.md
│   ├── NETWORK_MODE_SWITCHER.md
│   ├── STORAGE_ANALYTICS.md
│   ├── WEBHOOKS.md
│   └── ZERO_CONFIG_DISCOVERY.md
└── setup/               # Advanced setup and configuration
    ├── PERFORMANCE_HARDENING.md
    ├── PRODUCTION_HARDENING_SUMMARY.md
    └── PRODUCTION_HARDENING_VERIFICATION.md
```

## 🎯 Key Architecture Decisions

### **Frontend Architecture**
- **Component-based**: Modular React components with clear separation of concerns
- **State Management**: Zustand for lightweight, performant state management
- **Styling**: Tailwind CSS for utility-first, responsive design
- **Build Tool**: Vite for fast development and optimized production builds
- **Bundle Size**: 187KB gzipped, optimized for Raspberry Pi performance

### **Backend Architecture**
- **Layered Architecture**: Routes → Services → Database for clean separation
- **Database**: SQLite with WAL mode for concurrent access
- **Real-time**: WebSocket integration for live updates
- **Security**: Comprehensive middleware for authentication, rate limiting, and validation
- **Performance**: Optimized for Raspberry Pi 4B hardware constraints

### **File Organization Principles**
1. **Feature-based grouping**: Related components grouped together
2. **Clear naming conventions**: Descriptive file and folder names
3. **Separation of concerns**: Business logic separated from presentation
4. **Scalable structure**: Easy to add new features and components
5. **Production-ready**: Clean, maintainable codebase for deployment

## 🚀 Development Workflow

1. **Backend Development**: `cd backend && npm run dev`
2. **Frontend Development**: `cd frontend && npm run dev`
3. **Testing**: `cd backend && npm test`
4. **Building**: `npm run build` in both directories
5. **Deployment**: Follow `docs/deployment/README.md`

This structure supports a production-ready personal cloud storage solution optimized for Raspberry Pi deployment.