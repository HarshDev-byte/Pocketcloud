# PocketCloud Windows Application Makefile
# Build, test, and package the Windows system tray application

.PHONY: help install dev build clean test package dist icons setup

# Default target
help:
	@echo "PocketCloud Windows Application Build System"
	@echo ""
	@echo "Available targets:"
	@echo "  install     - Install dependencies"
	@echo "  dev         - Start development mode"
	@echo "  build       - Build application"
	@echo "  clean       - Clean build files"
	@echo "  test        - Run tests"
	@echo "  package     - Package for distribution"
	@echo "  dist        - Create installer"
	@echo "  icons       - Generate icon files"
	@echo "  setup       - Initial project setup"

# Install dependencies
install:
	@echo "Installing dependencies..."
	npm install
	@echo "Dependencies installed successfully"

# Development mode
dev:
	@echo "Starting development mode..."
	npm run dev

# Build application
build:
	@echo "Building PocketCloud Windows application..."
	npm run clean
	npm run build
	@echo "Build completed successfully"

# Clean build files
clean:
	@echo "Cleaning build files..."
	npm run clean
	@echo "Clean completed"

# Run tests
test:
	@echo "Running tests..."
	npm test
	@echo "Tests completed"

# Package application (no installer)
package:
	@echo "Packaging application..."
	npm run electron:pack
	@echo "Packaging completed"

# Create installer
dist: build
	@echo "Creating Windows installer..."
	npm run electron:dist
	@echo "Installer created successfully"
	@echo ""
	@echo "Output files:"
	@ls -la build/*.exe 2>/dev/null || echo "No installer files found"

# Generate icons
icons:
	@echo "Generating Windows icons..."
	cd assets && ./create-icons.sh
	@echo "Icons generated (convert SVGs to ICO format manually)"

# Initial project setup
setup: install icons
	@echo "Setting up PocketCloud Windows project..."
	@echo "Project setup completed"
	@echo ""
	@echo "Next steps:"
	@echo "1. Convert SVG icons to ICO format"
	@echo "2. Run 'make dev' to start development"
	@echo "3. Run 'make dist' to create installer"

# Development helpers
lint:
	@echo "Running linter..."
	npm run lint

format:
	@echo "Formatting code..."
	npx prettier --write "src/**/*.ts" "renderer/**/*.tsx"

# Build for specific architectures
build-x64:
	@echo "Building for x64..."
	npm run electron:dist -- --x64

build-arm64:
	@echo "Building for ARM64..."
	npm run electron:dist -- --arm64

build-all: build-x64 build-arm64
	@echo "Built for all architectures"

# Release preparation
release: clean build dist
	@echo "Release build completed"
	@echo "Files ready for distribution:"
	@ls -la build/

# Quick development cycle
quick: clean build package
	@echo "Quick build completed"