# 📁 PocketCloud Project Structure

## Overview
PocketCloud is now organized as a modern monorepo with clear separation of concerns and professional structure.

## Root Directory Structure

```
pocketcloud/
├── README.md                   # Main project documentation
├── package.json               # Workspace manager
├── .env.example               # Environment template
├── .gitignore                 # Git ignore rules
├── setup.sh                   # Main setup script
│
├── backend/                   # Backend Node.js application
├── frontend/                  # React frontend application  
├── setup/                     # Installation scripts
├── tools/                     # System management tools
├── docs/                      # Documentation
├── system/                    # System configuration
├── config/                    # Application configuration
├── data/                      # Runtime data (symlinked to USB)
├── storage/                   # File storage (symlinked to USB)
└── backups/                   # Backup files
```

## Backend Structure (`backend/`)

```
backend/
├── package.json              # Backend dependencies
├── server.js                 # Application entry point
├── README.md                 # Backend documentation
│
├── src/                      # Source code
│   ├── config/              # Configuration files
│   │   ├── config.js        # Main configuration
│   │   ├── database.js      # Database setup
│   │   ├── storage.js       # Storage configuration
│   │   └── roles.js         # User roles
│   │
│   ├── middleware/          # Express middleware
│   │   ├── auth.js          # Authentication
│   │   ├── rateLimiter.js   # Rate limiting
│   │   ├── rbac.js          # Role-based access control
│   │   ├── readiness.js     # Health checks
│   │   ├── sessionDebug.js  # Session debugging
│   │   ├── setup.js         # Setup flow
│   │   ├── storageError.js  # Storage error handling
│   │   └── validation.js    # Input validation
│   │
│   ├── routes/              # API routes
│   │   ├── auth.js          # Authentication routes
│   │   ├── files.js         # File management
│   │   └── index.js         # Main routes
│   │
│   ├── services/            # Business logic (organized by domain)
│   │   ├── core/           # Core services (13 files)
│   │   │   ├── storageService.js
│   │   │   ├── cryptoService.js
│   │   │   ├── userService.js
│   │   │   ├── backupService.js
│   │   │   └── ...
│   │   │
│   │   ├── media/          # Media services (5 files)
│   │   │   ├── videoStreamingService.js
│   │   │   ├── photoGalleryService.js
│   │   │   ├── musicPlayerService.js
│   │   │   └── ...
│   │   │
│   │   ├── security/       # Security services (4 files)
│   │   │   ├── twoFactorService.js
│   │   │   ├── sessionService.js
│   │   │   └── ...
│   │   │
│   │   ├── monitoring/     # Monitoring services (7 files)
│   │   │   ├── healthCheckService.js
│   │   │   ├── performanceMonitorService.js
│   │   │   └── ...
│   │   │
│   │   └── automation/     # Automation services (7 files)
│   │       ├── schedulerService.js
│   │       ├── automationService.js
│   │       └── ...
│   │
│   └── utils/              # Utility functions
│       └── security.js     # Security utilities
│
├── scripts/                # Backend scripts (organized by purpose)
│   ├── maintenance/        # Maintenance scripts (6 files)
│   │   ├── startup-cleanup.js
│   │   ├── migrate-encryption.js
│   │   ├── check-file-integrity.js
│   │   ├── scan-corruption.js
│   │   ├── validate-boundaries.js
│   │   └── status.js
│   │
│   └── testing/           # Testing scripts (3 files)
│       ├── test-encryption.js
│       ├── test-failure-scenarios.js
│       └── test-streaming.js
│
├── tests/                 # Test suites
│   ├── e2e/              # End-to-end tests
│   ├── integration/      # Integration tests
│   ├── unit/             # Unit tests
│   └── setup.js          # Test setup
│
├── tools/                # Backend management tools
│   ├── README.md         # Tools documentation
│   ├── backup-pocketcloud.sh
│   └── system-status.sh
│
├── public/               # Static web assets
│   └── css/             # Stylesheets
│
└── views/               # EJS templates
    ├── layout.ejs       # Base template
    ├── dashboard.ejs    # Main dashboard
    ├── login.ejs        # Login page
    └── ...
```

## Frontend Structure (`frontend/`)

```
frontend/
├── package.json          # Frontend dependencies
├── index.html           # HTML entry point
├── README.md            # Frontend documentation
│
├── src/                 # React source code
│   ├── components/      # React components
│   ├── pages/          # Page components
│   ├── hooks/          # Custom hooks
│   ├── utils/          # Utilities
│   ├── assets/         # Static assets
│   └── App.tsx         # Main app component
│
└── node_modules/       # Dependencies
```

## Setup & Tools Structure

### Setup Scripts (`setup/`)
```
setup/
├── setup-pocketcloud.sh    # Main setup script
├── setup-usb-drive.sh      # USB drive setup
├── monitor-usb-drive.sh    # USB monitoring
└── refresh-github.sh       # GitHub refresh
```

### Management Tools (`tools/`)
```
tools/
└── check-pocketcloud.sh    # Health check script
```

### System Configuration (`system/`)
```
system/
└── systemd/
    └── pocketcloud.service # systemd service file
```

## Documentation Structure (`docs/`)

```
docs/
├── COMPLETE_SETUP_GUIDE_2026.md
├── CROSS_DEVICE_ACCESS.md
├── PRE_SETUP_CHECKLIST.md
├── QUICKSTART.txt
├── RASPBERRY_PI_SETUP.md
├── TROUBLESHOOTING_2026.md
├── VISUAL_SETUP_GUIDE.md
│
└── archive/             # Archived documentation
    ├── PHASED_IMPLEMENTATION.md
    ├── POCKETCLOUD_SETUP.md
    ├── STRUCTURE_IMPROVEMENTS.md
    └── ...
```

## Key Features of New Structure

### 1. **Monorepo with Workspaces**
- Root `package.json` manages workspaces
- Separate `package.json` for backend and frontend
- Unified dependency management

### 2. **Clear Separation of Concerns**
- **Backend**: All server-side code in `backend/`
- **Frontend**: All client-side code in `frontend/`
- **Setup**: Installation scripts in `setup/`
- **Tools**: Management utilities in `tools/`
- **Docs**: All documentation in `docs/`

### 3. **Domain-Driven Service Organization**
- **Core**: Essential business logic
- **Media**: Media processing services
- **Security**: Authentication and security
- **Monitoring**: Health and performance monitoring
- **Automation**: Background tasks and automation

### 4. **Professional Standards**
- Follows industry best practices
- Scalable architecture
- Easy navigation and maintenance
- Clear dependency management

## Usage

### Development
```bash
# Install all dependencies
npm run install:all

# Start backend only
npm run start:backend

# Start frontend only  
npm run start:frontend

# Run tests
npm test

# Check system health
npm run health
```

### Production
```bash
# Setup system
npm run setup

# Start application
npm start

# Check status
npm run status
```

## Migration from Old Structure

The old flat structure has been reorganized:
- ✅ Duplicate directories moved to `_backup_root_duplicates/`
- ✅ Services organized by domain in `backend/src/services/`
- ✅ Scripts organized by purpose in `backend/scripts/`
- ✅ Setup scripts moved to `setup/`
- ✅ Documentation archived and organized
- ✅ Workspace structure implemented

## Benefits

1. **No More Confusion**: Clear separation eliminates duplicate directories
2. **Professional Structure**: Follows industry standards for Node.js projects
3. **Easy Navigation**: Logical organization makes finding files intuitive
4. **Scalable**: Can easily add new services, components, or tools
5. **Maintainable**: Clear patterns for where new code should go
6. **Team-Ready**: Structure supports multiple developers working together

This structure provides a solid foundation for PocketCloud's continued development and maintenance.