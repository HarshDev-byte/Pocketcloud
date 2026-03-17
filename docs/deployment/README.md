# PocketCloud Deployment Guide

## Quick Start

1. **Network Setup**
   ```bash
   sudo ./setup-network.sh
   ```

2. **Storage Setup**
   ```bash
   sudo ./setup-storage.sh
   ```

3. **Install Dependencies**
   ```bash
   # Backend
   cd backend && npm install && npm run build
   
   # Frontend  
   cd frontend && npm install && npm run build
   ```

4. **Start Services**
   ```bash
   # Start backend
   cd backend && npm start
   
   # Frontend is served by backend
   ```

## Environment Configuration

Copy and configure environment files:
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

## Production Deployment

See individual setup scripts for detailed Raspberry Pi deployment instructions.