# PocketCloud Project Structure

This document describes the organized file structure of the PocketCloud project.

## Root Directory Structure

```
├── .github/                    # GitHub workflows and templates
├── .kiro/                      # Kiro AI assistant configuration
├── clients/                    # Client applications for different platforms
├── docs/                       # Centralized documentation
├── pocket-cloud/               # Main PocketCloud server application
├── scripts/                    # Global build and deployment scripts
├── sdk/                        # JavaScript/TypeScript SDK
├── shared/                     # Shared libraries and utilities
└── tools/                      # Development and deployment tools
```

## Detailed Structure

### `/clients/` - Client Applications
```
clients/
├── cli/                        # Command-line interface client
├── desktop-linux/              # Linux desktop client (GTK)
├── desktop-mac/                # macOS desktop client (Electron)
└── desktop-windows/            # Windows desktop client (Electron)
```

### `/docs/` - Documentation
```
docs/
├── architecture/               # System architecture documentation
├── deployment/                 # Deployment guides and scripts
└── features/                   # Feature documentation
```

### `/pocket-cloud/` - Main Server Application
```
pocket-cloud/
├── .kiro/                      # Project-specific Kiro configuration
├── backend/                    # Node.js backend server
│   ├── src/
│   │   ├── controllers/        # API controllers
│   │   ├── middleware/         # Express middleware
│   │   ├── routes/             # API routes
│   │   ├── services/           # Business logic services
│   │   ├── utils/              # Utility functions
│   │   ├── db/                 # Database schema and migrations
│   │   ├── config/             # Configuration files
│   │   ├── jobs/               # Background jobs
│   │   └── tests/              # Unit tests
│   └── package.json
├── frontend/                   # React frontend application
│   ├── src/
│   │   ├── components/         # React components
│   │   ├── pages/              # Page components
│   │   ├── hooks/              # Custom React hooks
│   │   ├── services/           # API services
│   │   ├── utils/              # Utility functions
│   │   ├── styles/             # CSS and styling
│   │   └── tests/              # Frontend tests
│   ├── public/                 # Static assets
│   └── package.json
├── config/                     # Configuration files and templates
│   ├── .env.example            # Environment variables template
│   └── boot-config.txt         # Raspberry Pi boot configuration
├── scripts/                    # PocketCloud-specific scripts
│   ├── admin/                  # Administrative scripts
│   ├── deployment/             # Deployment scripts
│   ├── development/            # Development utilities
│   ├── monitoring/             # System monitoring scripts
│   ├── network/                # Network configuration scripts
│   ├── optimization/           # Performance optimization scripts
│   ├── setup/                  # Installation and setup scripts
│   ├── testing/                # Testing scripts
│   └── utilities/              # General utility scripts
├── tests/                      # Integration tests
│   └── integration/            # End-to-end integration tests
├── systemd/                    # SystemD service files
└── Makefile                    # Build automation
```

### `/sdk/` - JavaScript/TypeScript SDK
```
sdk/
├── src/                        # SDK source code
├── examples/                   # Usage examples
└── README.md                   # SDK documentation
```

### `/shared/` - Shared Libraries
```
shared/
└── sync-engine/                # Shared synchronization engine
```

### `/scripts/` - Global Scripts
```
scripts/
├── build-image.sh              # Docker image building
├── bump-version.sh             # Version management
├── demo-setup.sh               # Demo environment setup
├── install-linux.sh            # Linux installation
└── install.sh                  # General installation
```

### `/tools/` - Development Tools
```
tools/
├── deployment/                 # Deployment automation tools
├── development/                # Development environment tools
└── README.md                   # Tools documentation
```

## File Organization Principles

### 1. **Separation of Concerns**
- Client applications are separated by platform
- Documentation is centralized but categorized by type
- Scripts are organized by function (setup, network, testing, etc.)

### 2. **Logical Grouping**
- Related files are grouped together
- Similar functionality is co-located
- Clear boundaries between different aspects of the system

### 3. **Scalability**
- Structure supports adding new clients easily
- Documentation can grow without becoming unwieldy
- Scripts are organized to prevent clutter

### 4. **Discoverability**
- Clear naming conventions
- Logical hierarchy
- README files in key directories

## Key Improvements Made

1. **Consolidated Documentation**: Moved all docs to `/docs/` with clear categorization
2. **Organized Scripts**: Grouped scripts by function in logical subdirectories (admin, monitoring, network, etc.)
3. **Clear Client Structure**: Separated clients by platform type with comprehensive documentation
4. **Eliminated Duplication**: Removed duplicate directories and files
5. **Logical Hierarchy**: Created a clear, navigable structure
6. **Configuration Management**: Centralized configuration files in `/pocket-cloud/config/`
7. **Enhanced Documentation**: Added comprehensive README files for all major directories
8. **Tool Organization**: Structured development and deployment tools for better discoverability

## Navigation Tips

- **Looking for API docs?** → `/docs/features/`
- **Need setup instructions?** → `/docs/deployment/` or `/pocket-cloud/scripts/setup/`
- **Want to build a client?** → `/clients/` and `/sdk/`
- **Working on the server?** → `/pocket-cloud/backend/`
- **Building the web app?** → `/pocket-cloud/frontend/`
- **Running tests?** → `/pocket-cloud/scripts/testing/` or `/pocket-cloud/tests/`
- **Need development tools?** → `/tools/development/`
- **Deploying to production?** → `/tools/deployment/` or `/pocket-cloud/scripts/deployment/`
- **System administration?** → `/pocket-cloud/scripts/admin/` or `/pocket-cloud/scripts/monitoring/`
- **Configuration help?** → `/pocket-cloud/config/`

This structure is designed to be intuitive for both new contributors and experienced developers working on the PocketCloud project.