# PocketCloud Project Structure

This document describes the organized file structure of PocketCloud, designed for clarity and maintainability.

## Root Directory

```
pocketcloud/
├── setup.sh                    # Main setup launcher (interactive)
├── server.js                   # Main application server
├── package.json                # Node.js dependencies and scripts
├── README.md                   # Main project documentation
└── .env.example                # Environment configuration template
```

**Key Files:**
- **`setup.sh`** - Interactive setup script that guides users through complete installation
- **`server.js`** - Main Node.js application entry point
- **`README.md`** - Primary documentation with quick start instructions

## Directory Structure

### `/setup/` - Installation Scripts
```
setup/
├── README.md                   # Setup scripts documentation
├── check-requirements.sh       # System requirements checker
├── setup-usb-storage.sh       # USB drive setup automation
└── install.sh                 # Complete PocketCloud installation
```

**Purpose:** Contains all scripts needed to install PocketCloud on Raspberry Pi OS.

### `/tools/` - Management Utilities
```
tools/
├── README.md                   # Tools documentation
├── system-status.sh            # Health check and status monitoring
└── backup-pocketcloud.sh       # Complete backup solution
```

**Purpose:** Post-installation management and maintenance tools.

### `/docs/` - Documentation
```
docs/
├── QUICKSTART.txt              # Step-by-step setup guide
└── RASPBERRY_PI_SETUP.md       # Comprehensive Pi setup documentation
```

**Purpose:** User-facing documentation and setup guides.

### `/config/` - Configuration Files
```
config/
├── config.js                   # Application configuration
├── database.js                 # SQLite database setup
├── storage.js                  # File storage configuration
└── pocketcloud.service         # systemd service definition
```

**Purpose:** Application configuration and system service files.

### `/routes/` - Web Routes
```
routes/
├── index.js                    # Landing page routes
├── auth.js                     # Authentication routes
└── files.js                    # File management routes
```

**Purpose:** Express.js route handlers for web interface.

### `/views/` - Web Templates
```
views/
├── layout.ejs                  # Base template
├── landing.ejs                 # Home page
├── login.ejs                   # Login page
├── register.ejs                # Registration page
├── dashboard.ejs               # Main dashboard
├── files.ejs                   # File browser
├── setup.ejs                   # First-time setup
├── security.ejs                # Security settings
├── support.ejs                 # Support page
└── error.ejs                   # Error page
```

**Purpose:** EJS templates for the web interface.

### `/middleware/` - Express Middleware
```
middleware/
├── auth.js                     # Authentication middleware
├── rateLimiter.js              # Rate limiting
├── readiness.js                # Health check endpoints
└── setup.js                    # Setup flow middleware
```

**Purpose:** Express.js middleware for security, authentication, and request handling.

### `/services/` - Business Logic
```
services/
├── cryptoService.js            # File encryption/decryption
├── cryptoErrors.js             # Encryption error handling
├── storageService.js           # File storage operations
├── backupService.js            # Backup operations
├── restoreService.js           # Restore operations
├── healthService.js            # System health monitoring
├── identityService.js          # User identity management
├── usbMountService.js          # USB storage management
├── failureDetection.js         # System failure detection
├── failureDrills.js            # Failure recovery testing
├── setupVerification.js        # Setup validation
└── productBoundaries.js        # Product scope enforcement
```

**Purpose:** Core business logic and service layer.

### `/utils/` - Utility Functions
```
utils/
└── security.js                # Security utilities and helpers
```

**Purpose:** Shared utility functions and helpers.

### `/scripts/` - Maintenance Scripts
```
scripts/
├── health-check.sh             # System health verification
├── migrate-encryption.js       # Encryption migration
├── setup-usb-storage.sh        # USB storage setup
├── startup-cleanup.js          # Startup cleanup tasks
├── status.js                   # Status reporting
├── test-encryption.js          # Encryption testing
├── test-failure-scenarios.js   # Failure scenario testing
├── test-streaming.js           # Streaming functionality tests
└── validate-boundaries.js      # Product boundary validation
```

**Purpose:** Maintenance, testing, and administrative scripts.

### `/public/` - Static Assets
```
public/
└── css/
    ├── style.css               # Main stylesheet
    ├── dashboard.css           # Dashboard-specific styles
    ├── security.css            # Security page styles
    └── support.css             # Support page styles
```

**Purpose:** Static web assets (CSS, images, client-side JavaScript).

### Runtime Directories (Created During Installation)

### `/data/` - Application Data
```
data/
├── pocketcloud.db              # SQLite database
└── .pocketcloud-identity       # System identity file
```

**Purpose:** Application database and configuration data.
**Location:** Symlinked to `/mnt/pocketcloud/pocketcloud-data/` on USB storage.

### `/storage/` - User Files
```
storage/
├── user_1/                     # User-specific encrypted storage
└── user_2/                     # Additional users
```

**Purpose:** Encrypted user file storage.
**Location:** Symlinked to `/mnt/pocketcloud/pocketcloud-storage/` on USB storage.

## Installation Flow

1. **`setup.sh`** - Interactive launcher
2. **`setup/check-requirements.sh`** - Verify system compatibility
3. **`setup/setup-usb-storage.sh`** - Configure USB storage
4. **`setup/install.sh`** - Install and configure PocketCloud
5. **`tools/system-status.sh`** - Verify installation

## Management Flow

- **Monitor**: `tools/system-status.sh`
- **Backup**: `tools/backup-pocketcloud.sh`
- **Logs**: `sudo journalctl -u pocketcloud -f`
- **Control**: `sudo systemctl {start|stop|restart} pocketcloud`

## Key Design Principles

### 1. **Separation of Concerns**
- **Setup scripts** in `/setup/` for installation
- **Management tools** in `/tools/` for maintenance
- **Documentation** in `/docs/` for users
- **Configuration** in `/config/` for system settings

### 2. **User Experience**
- **Single entry point**: `setup.sh` for complete installation
- **Clear documentation**: Step-by-step guides in `/docs/`
- **Helpful tools**: Status checking and backup utilities

### 3. **Maintainability**
- **Logical grouping**: Related files in appropriate directories
- **Clear naming**: Descriptive file and directory names
- **Documentation**: README files in each major directory

### 4. **Production Ready**
- **Clean root**: Only essential files in root directory
- **Proper permissions**: Scripts and configuration files properly organized
- **System integration**: Service files and system configuration properly placed

## File Permissions

After installation, the file structure maintains proper permissions:

- **Application files**: Owned by `pocketcloud` user
- **Setup scripts**: Executable by root
- **Management tools**: Executable by user and root
- **Configuration**: Protected system files
- **Data/Storage**: Proper user isolation and encryption

This structure provides a clean, maintainable, and user-friendly organization for the PocketCloud project.