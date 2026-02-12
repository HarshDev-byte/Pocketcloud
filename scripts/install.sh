#!/bin/bash

# 🚀 PocketCloud Installation Script
# Installs dependencies and sets up PocketCloud

set -e

echo "🚀 Installing PocketCloud..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version $NODE_VERSION is too old. Please install Node.js 18+."
    exit 1
fi

echo "✅ Node.js $(node -v) found"

# Install dependencies
echo "📦 Installing dependencies..."
cd backend
npm install

echo ""
echo "✅ Installation complete!"
echo ""
echo "🚀 Start PocketCloud with:"
echo "   ./scripts/start-server.sh"
echo ""
echo "🌐 Then visit: http://localhost:3000"