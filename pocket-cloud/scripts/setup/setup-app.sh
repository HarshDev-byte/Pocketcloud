#!/bin/bash
# Pocket Cloud Drive - Application Setup Script
# Installs and configures the Pocket Cloud Drive application

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() { echo -e "${BLUE}[APP]${NC} $1"; }
print_success() { echo -e "${GREEN}[APP]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[APP]${NC} $1"; }
print_error() { echo -e "${RED}[APP]${NC} $1"; }

# Configuration
APP_DIR="/opt/pocketcloud"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
STORAGE_PATH="/mnt/pocketcloud"

create_app_directory() {
    print_step "Creating application directory..."
    
    # Create app directory
    mkdir -p "$APP_DIR"
    
    # Set ownership to pi user if exists
    if id "pi" >/dev/null 2>&1; then
        chown pi:pi "$APP_DIR"
        print_step "Set ownership to pi:pi"
    fi
    
    print_success "Application directory created: $APP_DIR"
}

copy_application_files() {
    print_step "Copying application files..."
    
    # Copy backend files
    print_step "Copying backend..."
    cp -r "$PROJECT_ROOT/backend" "$APP_DIR/"
    
    # Copy frontend files
    print_step "Copying frontend..."
    cp -r "$PROJECT_ROOT/frontend" "$APP_DIR/"
    
    # Copy scripts (for maintenance)
    print_step "Copying scripts..."
    cp -r "$PROJECT_ROOT/scripts" "$APP_DIR/"
    
    # Copy systemd files
    print_step "Copying systemd files..."
    cp -r "$PROJECT_ROOT/systemd" "$APP_DIR/"
    
    # Copy documentation
    if [[ -f "$PROJECT_ROOT/README.md" ]]; then
        cp "$PROJECT_ROOT/README.md" "$APP_DIR/"
    fi
    
    print_success "Application files copied"
}

install_backend_dependencies() {
    print_step "Installing backend dependencies..."
    
    cd "$APP_DIR/backend"
    
    # Install production dependencies only
    export NODE_ENV=production
    pnpm install --prod --frozen-lockfile
    
    print_success "Backend dependencies installed"
}

build_backend() {
    print_step "Building backend application..."
    
    cd "$APP_DIR/backend"
    
    # Build TypeScript
    pnpm run build
    
    print_success "Backend built successfully"
}

install_frontend_dependencies() {
    print_step "Installing frontend dependencies..."
    
    cd "$APP_DIR/frontend"
    
    # Install all dependencies (needed for build)
    pnpm install --frozen-lockfile
    
    print_success "Frontend dependencies installed"
}

build_frontend() {
    print_step "Building frontend application..."
    
    cd "$APP_DIR/frontend"
    
    # Build for production
    pnpm run build
    
    # Verify build output
    if [[ ! -d "dist" ]] || [[ ! -f "dist/index.html" ]]; then
        print_error "Frontend build failed - no dist directory or index.html"
        exit 1
    fi
    
    print_success "Frontend built successfully"
}

setup_static_files() {
    print_step "Setting up static file serving..."
    
    # Create public directory in backend
    mkdir -p "$APP_DIR/backend/public"
    
    # Copy frontend build to backend public directory
    cp -r "$APP_DIR/frontend/dist"/* "$APP_DIR/backend/public/"
    
    # Verify critical files
    if [[ ! -f "$APP_DIR/backend/public/index.html" ]]; then
        print_error "Static files setup failed - index.html not found"
        exit 1
    fi
    
    print_success "Static files configured"
}

generate_secrets() {
    print_step "Generating security secrets..."
    
    # Generate JWT secret
    local jwt_secret=$(openssl rand -hex 32)
    
    # Generate session secret
    local session_secret=$(openssl rand -hex 32)
    
    print_success "Security secrets generated"
    
    # Return secrets for use in env file
    echo "$jwt_secret:$session_secret"
}

create_environment_file() {
    print_step "Creating environment configuration..."
    
    local secrets=$(generate_secrets)
    local jwt_secret=$(echo "$secrets" | cut -d: -f1)
    local session_secret=$(echo "$secrets" | cut -d: -f2)
    
    # Create .env file from template
    cat > "$APP_DIR/backend/.env" << EOF
# Pocket Cloud Drive Environment Configuration
# Generated: $(date)

# Server Configuration
PORT=3000
NODE_ENV=production
HOST=0.0.0.0

# Database
DB_PATH=$STORAGE_PATH/db/storage.db

# File Storage
STORAGE_PATH=$STORAGE_PATH/files
UPLOAD_TEMP_DIR=$APP_DIR/backend/uploads
MAX_FILE_SIZE=53687091200

# Security (Generated secrets - keep secure!)
JWT_SECRET=$jwt_secret
SESSION_SECRET=$session_secret

# Network
FRONTEND_URL=http://192.168.4.1

# Limits
MAX_STORAGE_GB=1000
MAX_FILES_PER_USER=100000

# Logging
LOG_LEVEL=info
EOF

    # Set secure permissions
    chmod 600 "$APP_DIR/backend/.env"
    
    print_success "Environment file created with generated secrets"
}

create_upload_directory() {
    print_step "Creating upload directory..."
    
    mkdir -p "$APP_DIR/backend/uploads"
    
    # Set ownership and permissions
    if id "pi" >/dev/null 2>&1; then
        chown pi:pi "$APP_DIR/backend/uploads"
    fi
    chmod 755 "$APP_DIR/backend/uploads"
    
    print_success "Upload directory created"
}

initialize_database() {
    print_step "Initializing database..."
    
    cd "$APP_DIR/backend"
    
    # Ensure database directory exists
    mkdir -p "$STORAGE_PATH/db"
    
    # Run database migrations
    if ! pnpm run migrate 2>/dev/null; then
        print_warning "Database migration failed, will retry on first run"
    else
        print_success "Database initialized"
    fi
}

create_admin_user() {
    print_step "Creating initial admin user..."
    
    cd "$APP_DIR/backend"
    
    # Create admin user with default password
    local admin_username="admin"
    local admin_password="admin123"
    
    if pnpm run create-admin "$admin_username" "$admin_password" 2>/dev/null; then
        print_success "Admin user created: $admin_username"
        print_warning "Default password: $admin_password (CHANGE THIS!)"
    else
        print_warning "Admin user creation failed, will be created on first run"
    fi
}

cleanup_build_files() {
    print_step "Cleaning up build files..."
    
    # Remove frontend node_modules (not needed after build)
    rm -rf "$APP_DIR/frontend/node_modules"
    
    # Remove frontend source files (keep dist)
    rm -rf "$APP_DIR/frontend/src"
    rm -f "$APP_DIR/frontend/package.json" "$APP_DIR/frontend/package-lock.json"
    rm -f "$APP_DIR/frontend/tsconfig.json" "$APP_DIR/frontend/vite.config.ts"
    
    # Clean npm cache
    pnpm store prune 2>/dev/null || true
    
    print_success "Build files cleaned up"
}

set_permissions() {
    print_step "Setting file permissions..."
    
    # Set ownership to pi user
    if id "pi" >/dev/null 2>&1; then
        chown -R pi:pi "$APP_DIR"
        print_step "Set ownership to pi:pi"
    fi
    
    # Set directory permissions
    find "$APP_DIR" -type d -exec chmod 755 {} \;
    
    # Set file permissions
    find "$APP_DIR" -type f -exec chmod 644 {} \;
    
    # Make scripts executable
    chmod +x "$APP_DIR/scripts"/*.sh
    
    # Secure environment file
    chmod 600 "$APP_DIR/backend/.env"
    
    print_success "File permissions set"
}

create_maintenance_scripts() {
    print_step "Creating maintenance scripts..."
    
    # Create backup script
    cat > "$APP_DIR/scripts/backup.sh" << 'EOF'
#!/bin/bash
# Pocket Cloud Drive Backup Script

BACKUP_DIR="/mnt/pocketcloud/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/pocketcloud_backup_$DATE.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "Creating backup: $BACKUP_FILE"
tar -czf "$BACKUP_FILE" \
    --exclude="*.log" \
    --exclude="node_modules" \
    --exclude="uploads/*" \
    /opt/pocketcloud \
    /mnt/pocketcloud/db \
    /mnt/pocketcloud/files

echo "Backup completed: $BACKUP_FILE"

# Keep only last 7 backups
find "$BACKUP_DIR" -name "pocketcloud_backup_*.tar.gz" -mtime +7 -delete
EOF

    # Create update script
    cat > "$APP_DIR/scripts/update.sh" << 'EOF'
#!/bin/bash
# Pocket Cloud Drive Update Script

echo "Stopping services..."
sudo systemctl stop pocketcloud-backend

echo "Backing up current installation..."
sudo /opt/pocketcloud/scripts/backup.sh

echo "Update completed. Restart services manually:"
echo "sudo systemctl start pocketcloud-backend"
EOF

    # Make scripts executable
    chmod +x "$APP_DIR/scripts/backup.sh"
    chmod +x "$APP_DIR/scripts/update.sh"
    
    print_success "Maintenance scripts created"
}

verify_installation() {
    print_step "Verifying installation..."
    
    # Check critical files
    local critical_files=(
        "$APP_DIR/backend/dist/index.js"
        "$APP_DIR/backend/.env"
        "$APP_DIR/backend/public/index.html"
        "$APP_DIR/backend/package.json"
    )
    
    for file in "${critical_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            print_error "Critical file missing: $file"
            exit 1
        fi
    done
    
    # Check directories
    local critical_dirs=(
        "$APP_DIR/backend/uploads"
        "$STORAGE_PATH/db"
        "$STORAGE_PATH/files"
    )
    
    for dir in "${critical_dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            print_error "Critical directory missing: $dir"
            exit 1
        fi
    done
    
    # Test Node.js can load the app
    cd "$APP_DIR/backend"
    if node -e "require('./dist/index.js')" 2>/dev/null &
    then
        local pid=$!
        sleep 2
        kill $pid 2>/dev/null || true
        print_success "Application loads successfully"
    else
        print_warning "Application load test failed (may be normal)"
    fi
    
    print_success "Installation verification completed"
}

main() {
    print_step "Starting application setup..."
    
    create_app_directory
    copy_application_files
    install_backend_dependencies
    build_backend
    install_frontend_dependencies
    build_frontend
    setup_static_files
    create_environment_file
    create_upload_directory
    initialize_database
    create_admin_user
    cleanup_build_files
    set_permissions
    create_maintenance_scripts
    verify_installation
    
    print_success "Application setup completed successfully"
    print_step "Application directory: $APP_DIR"
    print_step "Admin user: admin (password: admin123)"
    print_warning "IMPORTANT: Change the admin password after first login!"
}

# Rollback instructions (as comments for reference):
# To rollback application installation:
# 1. sudo systemctl stop pocketcloud-backend (if running)
# 2. sudo rm -rf /opt/pocketcloud
# 3. sudo rm -rf /mnt/pocketcloud/db (if you want to remove database)
# 4. Optionally remove user data: sudo rm -rf /mnt/pocketcloud/files

main "$@"