# PocketCloud

A personal cloud storage solution designed for Raspberry Pi, providing secure file storage and sharing over a local WiFi network.

## ✨ Features

- **📁 Personal Cloud Storage**: Upload, organize, and access your files from any device
- **📶 WiFi Hotspot Access**: Connect directly to your Pi without internet dependency  
- **📸 Photo Gallery**: Automatic photo organization with date-based sorting
- **🔗 File Sharing**: Create password-protected public links with expiry dates
- **⚡ Real-time Sync**: Live updates across all connected devices
- **📱 Mobile Optimized**: Responsive design that works perfectly on phones and tablets
- **🔍 Advanced Search**: Full-text search with filters and smart suggestions
- **🗑️ Trash Management**: 30-day retention with bulk restore operations
- **👁️ Multi-format Viewer**: View images, videos, PDFs, and code files directly in browser
- **🌙 Dark Mode**: Beautiful dark theme with light mode option

## 🚀 Quick Start

1. **Deploy to Raspberry Pi**
   ```bash
   # See docs/deployment/ for detailed setup instructions
   sudo ./docs/deployment/setup-network.sh
   sudo ./docs/deployment/setup-storage.sh
   ```

2. **Install & Build**
   ```bash
   # Backend
   cd backend && npm install && npm run build
   
   # Frontend
   cd frontend && npm install && npm run build
   ```

3. **Start Services**
   ```bash
   cd backend && npm start
   ```

4. **Access PocketCloud**
   - Connect to `PocketCloud` WiFi network
   - Open browser to `http://192.168.4.1`
   - Complete setup wizard

## 🏗️ Architecture

- **Frontend**: React + TypeScript + Tailwind CSS (187KB gzipped)
- **Backend**: Node.js + Express + SQLite
- **Real-time**: WebSocket connections for live updates
- **Storage**: Local filesystem with SHA-256 deduplication
- **Security**: JWT authentication, rate limiting, input validation
- **Performance**: Optimized for Raspberry Pi 4B hardware

## 🛠️ Development

```bash
# Backend development
cd backend && npm run dev

# Frontend development  
cd frontend && npm run dev

# Run tests
cd backend && npm test
```

## 📚 Documentation

- **[Deployment Guide](docs/deployment/)** - Raspberry Pi setup instructions
- **[User Guide](docs/user-guide/)** - How to use PocketCloud
- **[Feature Documentation](docs/features/)** - Detailed feature descriptions
- **[Setup Documentation](docs/setup/)** - Configuration and hardening

## 🎯 Production Ready

- ✅ **Zero build errors** - Clean TypeScript compilation
- ✅ **42 passing tests** - Comprehensive unit test coverage  
- ✅ **Performance optimized** - Efficient on Raspberry Pi 4B
- ✅ **Security hardened** - Rate limiting, input validation, CORS
- ✅ **Mobile responsive** - Works on all device sizes
- ✅ **Real-time updates** - WebSocket synchronization

## 📄 License

MIT License - see LICENSE file for details.