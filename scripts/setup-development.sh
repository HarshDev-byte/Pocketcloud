#!/bin/bash

# 🛠️ PocketCloud Development Setup
# Sets up development environment with hot reload

set -e

echo "🛠️ Setting up PocketCloud for development..."
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
cd backend
npm install

# Install development dependencies
echo "📦 Installing development tools..."
npm install --save-dev nodemon

echo ""
echo "✅ Development setup complete!"
echo ""
echo "🚀 Start development server with:"
echo "   npm run dev"
echo ""
echo "🌐 Then visit: http://localhost:3000"
echo ""
echo "📝 Development features:"
echo "   • Hot reload on file changes"
echo "   • Detailed error logging"
echo "   • Development middleware enabled"