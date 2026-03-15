# PocketCloud Server Application

This directory contains the main PocketCloud server application - a Node.js backend with React frontend that runs on Raspberry Pi devices.

## 🏗️ Architecture

```
pocket-cloud/
├── backend/           # Node.js API server
├── frontend/          # React web application  
├── scripts/           # Setup and utility scripts
├── tests/             # Integration tests
├── systemd/           # SystemD service files
└── Makefile           # Build automation
```

## 🚀 Quick Start

### Development Setup

```bash
# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Start development servers
npm run dev:backend    # API server on :3000
npm run dev:frontend   # Web app on :5173
```

### Production Build

```bash
# Build everything
make build

# Or build individually
cd backend && npm run build
cd frontend && npm run build
```

## 🔧 Backend (Node.js + Express)

The backend provides a RESTful API and WebSocket server for real-time features.

### Key Features
- **File Management**: Upload, download, organize files
- **User Authentication**: JWT-based auth with bcrypt
- **Real-time Sync**: WebSocket-based file synchronization
- **Media Processing**: FFmpeg-based video/audio transcoding
- **WebDAV Server**: Mount as network drive
- **Search & Indexing**: Full-text search across files
- **Admin Dashboard**: System monitoring and management

### API Structure
```
backend/src/
├── controllers/       # Request handlers
├── routes/           # API route definitions
├── services/         # Business logic
├── middleware/       # Express middleware
├── db/              # Database schema & migrations
├── utils/           # Helper functions
├── config/          # Configuration files
├── jobs/            # Background jobs
└── tests/           # Unit tests
```

### Key Services
- **File Service**: File operations and metadata
- **Auth Service**: User authentication and authorization
- **Upload Service**: Multi-part file uploads with progress
- **Media Service**: Video/audio processing and streaming
- **Search Service**: Full-text search and indexing
- **Sync Service**: Real-time file synchronization
- **WebDAV Service**: WebDAV protocol implementation

## 🎨 Frontend (React + TypeScript)

Modern React application with TypeScript, providing a responsive web interface.

### Key Features
- **File Browser**: Drag-and-drop file management
- **Media Viewer**: Video/audio/image preview
- **Upload Manager**: Multi-file uploads with progress
- **Admin Panel**: System administration interface
- **Mobile Support**: Responsive design for all devices
- **PWA Features**: Offline support, installable
- **Real-time Updates**: Live file sync across devices

### Component Structure
```
frontend/src/
├── components/       # Reusable UI components
├── pages/           # Page-level components
├── hooks/           # Custom React hooks
├── services/        # API client services
├── utils/           # Helper functions
├── styles/          # CSS and styling
└── tests/           # Component tests
```

### Key Components
- **FileBrowser**: Main file management interface
- **MediaViewer**: Video/audio/image viewer
- **UploadManager**: File upload interface
- **AdminDashboard**: System administration
- **MobileNav**: Mobile-optimized navigation

## 📜 Scripts

Organized scripts for setup, deployment, and maintenance:

```
scripts/
├── setup/           # Installation scripts
├── network/         # Network configuration
├── testing/         # Test automation
├── deployment/      # Deployment utilities
├── optimization/    # Performance tuning
└── development/     # Development tools
```

### Key Scripts
- **setup.sh**: Complete system setup
- **deploy.sh**: Production deployment
- **network-mode.sh**: Switch network modes
- **optimize-pi.sh**: Raspberry Pi optimization

## 🧪 Testing

### Unit Tests
```bash
# Backend tests
cd backend && npm test

# Frontend tests  
cd frontend && npm test
```

### Integration Tests
```bash
# Run integration test suite
cd tests && npm test

# Specific test suites
npm run test:auth
npm run test:upload
npm run test:webdav
```

### Test Coverage
- Backend: Controllers, services, middleware
- Frontend: Components, hooks, utilities
- Integration: End-to-end workflows

## 🔧 Configuration

### Environment Variables
- **Development**: `.env.local`
- **Production**: `.env.example` (template)

### Key Settings
- Database path and configuration
- Storage paths and limits
- Network and security settings
- Media processing options
- Authentication configuration

## 🚀 Deployment

### Raspberry Pi Deployment
```bash
# Automated deployment
./scripts/deployment/deploy.sh

# Manual steps
make install
sudo systemctl enable pocketcloud
sudo systemctl start pocketcloud
```

### Docker Deployment
```bash
# Build image
docker build -t pocketcloud .

# Run container
docker run -d -p 3000:3000 -v /data:/app/data pocketcloud
```

## 📊 Performance

### Optimization Features
- **Caching**: Redis-based caching layer
- **Compression**: Gzip compression for API responses
- **Database**: SQLite with WAL mode and optimizations
- **Media**: Hardware-accelerated transcoding
- **Static Assets**: Nginx serving with caching headers

### Monitoring
- **System Metrics**: CPU, memory, disk usage
- **Application Metrics**: Request rates, response times
- **Error Tracking**: Structured logging with rotation
- **Health Checks**: Automated system health monitoring

## 🔒 Security

### Security Features
- **Authentication**: JWT tokens with refresh mechanism
- **Authorization**: Role-based access control
- **Encryption**: TLS/SSL for all communications
- **Input Validation**: Comprehensive request validation
- **Rate Limiting**: API rate limiting and DDoS protection
- **File Security**: Virus scanning and type validation

### Security Configuration
- **Firewall**: Automated firewall setup
- **SSL/TLS**: Let's Encrypt integration
- **Fail2Ban**: Intrusion detection and prevention
- **Secure Headers**: Security headers middleware

## 🤝 Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for general guidelines.

### Development Workflow
1. Set up development environment
2. Make changes in feature branch
3. Run tests and linting
4. Submit pull request
5. Code review and merge

### Code Standards
- **TypeScript**: Strict type checking
- **ESLint**: Code linting and formatting
- **Prettier**: Code formatting
- **Jest**: Unit testing framework
- **Conventional Commits**: Commit message format

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/pocketcloud/pocketcloud/issues)
- **Discussions**: [GitHub Discussions](https://github.com/pocketcloud/pocketcloud/discussions)
- **Discord**: [Community Chat](https://discord.gg/pocketcloud)
- **Documentation**: [Project Docs](../docs/)

---

**PocketCloud Server - Your personal cloud, your way.** ☁️