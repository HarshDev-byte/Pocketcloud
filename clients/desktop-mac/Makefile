# PocketCloud macOS App - Development Makefile

.PHONY: help install dev build dist clean test lint

# Default target
help:
	@echo "PocketCloud macOS App - Available Commands:"
	@echo ""
	@echo "Development:"
	@echo "  make install     - Install dependencies"
	@echo "  make dev         - Start development mode with hot reload"
	@echo "  make build       - Build the app for production"
	@echo ""
	@echo "Distribution:"
	@echo "  make dist        - Create DMG and ZIP distributables"
	@echo "  make dist-mac    - Create macOS distributables only"
	@echo "  make sign        - Code sign the built app (requires certificates)"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean       - Clean build artifacts"
	@echo "  make test        - Run tests"
	@echo "  make lint        - Run linter"
	@echo ""
	@echo "Assets:"
	@echo "  make icons       - Generate app icons from source"
	@echo "  make assets      - Prepare all assets for build"

# Install dependencies
install:
	@echo "Installing dependencies..."
	npm install
	@echo "✅ Dependencies installed"

# Development mode with hot reload
dev:
	@echo "Starting PocketCloud development mode..."
	@echo "This will:"
	@echo "  1. Compile TypeScript in watch mode"
	@echo "  2. Start Electron with hot reload"
	@echo "  3. Open developer tools"
	npm run dev

# Build for production
build:
	@echo "Building PocketCloud for production..."
	npm run clean
	npm run build
	@echo "✅ Build complete"

# Create distributables
dist: build
	@echo "Creating PocketCloud distributables..."
	npm run dist
	@echo "✅ Distributables created in build/ directory"

# macOS-specific distribution
dist-mac: build
	@echo "Creating macOS distributables..."
	npm run dist:mac
	@echo "✅ macOS distributables created"

# Code signing (requires Apple Developer certificates)
sign:
	@echo "Code signing PocketCloud..."
	@if [ ! -f "build/mac/PocketCloud Drive.app" ]; then \
		echo "❌ App not found. Run 'make build' first."; \
		exit 1; \
	fi
	@echo "Signing with ad-hoc signature (for local testing)..."
	codesign --force --deep --sign - "build/mac/PocketCloud Drive.app"
	@echo "✅ App signed with ad-hoc signature"
	@echo ""
	@echo "For distribution, you need a valid Apple Developer certificate:"
	@echo "  codesign --force --deep --sign 'Developer ID Application: Your Name' 'build/mac/PocketCloud Drive.app'"

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	npm run clean
	rm -rf build/
	@echo "✅ Clean complete"

# Run tests
test:
	@echo "Running tests..."
	npm test
	@echo "✅ Tests complete"

# Run linter
lint:
	@echo "Running linter..."
	npm run lint
	@echo "✅ Linting complete"

# Generate app icons from source
icons:
	@echo "Generating app icons..."
	@if [ ! -f "assets/app-icon-source.svg" ]; then \
		echo "❌ Source icon not found: assets/app-icon-source.svg"; \
		echo "Create a 512x512 SVG icon first."; \
		exit 1; \
	fi
	@echo "Converting SVG to PNG sizes..."
	mkdir -p assets/app-icon.iconset
	# Generate all required icon sizes
	inkscape --export-png=assets/app-icon.iconset/icon_16x16.png --export-width=16 --export-height=16 assets/app-icon-source.svg
	inkscape --export-png=assets/app-icon.iconset/icon_16x16@2x.png --export-width=32 --export-height=32 assets/app-icon-source.svg
	inkscape --export-png=assets/app-icon.iconset/icon_32x32.png --export-width=32 --export-height=32 assets/app-icon-source.svg
	inkscape --export-png=assets/app-icon.iconset/icon_32x32@2x.png --export-width=64 --export-height=64 assets/app-icon-source.svg
	inkscape --export-png=assets/app-icon.iconset/icon_128x128.png --export-width=128 --export-height=128 assets/app-icon-source.svg
	inkscape --export-png=assets/app-icon.iconset/icon_128x128@2x.png --export-width=256 --export-height=256 assets/app-icon-source.svg
	inkscape --export-png=assets/app-icon.iconset/icon_256x256.png --export-width=256 --export-height=256 assets/app-icon-source.svg
	inkscape --export-png=assets/app-icon.iconset/icon_256x256@2x.png --export-width=512 --export-height=512 assets/app-icon-source.svg
	inkscape --export-png=assets/app-icon.iconset/icon_512x512.png --export-width=512 --export-height=512 assets/app-icon-source.svg
	inkscape --export-png=assets/app-icon.iconset/icon_512x512@2x.png --export-width=1024 --export-height=1024 assets/app-icon-source.svg
	@echo "Creating ICNS file..."
	iconutil -c icns assets/app-icon.iconset
	@echo "✅ App icons generated"

# Prepare all assets
assets: icons
	@echo "Preparing assets..."
	@# Copy notification icon
	cp assets/app-icon.iconset/icon_512x512.png assets/app-icon.png
	@# Generate tray icons (placeholder - replace with actual designs)
	@echo "⚠️  Tray icons need to be created manually:"
	@echo "   - assets/tray-icon.png (16x16, monochrome template)"
	@echo "   - assets/tray-icon-active.png (16x16, with status dot)"
	@echo "   - assets/tray-icon-upload.png (16x16, with upload indicator)"
	@echo "✅ Assets prepared"

# Development helpers
dev-clean: clean install
	@echo "Clean development setup complete"

# Check system requirements
check-deps:
	@echo "Checking system dependencies..."
	@command -v node >/dev/null 2>&1 || { echo "❌ Node.js not found. Install from https://nodejs.org/"; exit 1; }
	@command -v npm >/dev/null 2>&1 || { echo "❌ npm not found. Install Node.js first."; exit 1; }
	@echo "✅ Node.js $(shell node --version)"
	@echo "✅ npm $(shell npm --version)"
	@if command -v inkscape >/dev/null 2>&1; then \
		echo "✅ Inkscape found (for icon generation)"; \
	else \
		echo "⚠️  Inkscape not found (optional, for icon generation)"; \
	fi

# Quick start for new developers
setup: check-deps install
	@echo ""
	@echo "🎉 PocketCloud macOS setup complete!"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Create app icons: make icons"
	@echo "  2. Start development: make dev"
	@echo "  3. Build for distribution: make dist"
	@echo ""
	@echo "For help: make help"

# Release preparation
release: clean test lint build dist sign
	@echo "🚀 Release build complete!"
	@echo ""
	@echo "Distributables created:"
	@ls -la build/*.dmg build/*.zip 2>/dev/null || echo "No distributables found"
	@echo ""
	@echo "Upload to GitHub Releases or distribute manually."