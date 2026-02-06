#!/bin/bash

# PocketCloud Backup Script
# Creates a complete backup of PocketCloud data and configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Default backup location
BACKUP_BASE="/mnt/pocketcloud/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="$BACKUP_BASE/pocketcloud_backup_$TIMESTAMP"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--destination)
            BACKUP_BASE="$2"
            BACKUP_DIR="$BACKUP_BASE/pocketcloud_backup_$TIMESTAMP"
            shift 2
            ;;
        -h|--help)
            echo "PocketCloud Backup Script"
            echo
            echo "Usage: $0 [OPTIONS]"
            echo
            echo "Options:"
            echo "  -d, --destination DIR    Backup destination directory (default: /mnt/pocketcloud/backups)"
            echo "  -h, --help              Show this help message"
            echo
            echo "Examples:"
            echo "  $0                                    # Backup to default location"
            echo "  $0 -d /media/usb-backup             # Backup to external drive"
            echo "  $0 -d /home/pi/backups               # Backup to home directory"
            echo
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Use -h or --help for usage information"
            exit 1
            ;;
    esac
done

# Check if running as root (needed for some operations)
check_permissions() {
    if [[ $EUID -eq 0 ]]; then
        log_info "Running as root - full backup possible"
        FULL_BACKUP=true
    else
        log_warning "Not running as root - some files may be skipped"
        log_info "For complete backup, run with: sudo $0"
        FULL_BACKUP=false
    fi
}

# Check if PocketCloud is installed
check_installation() {
    log_info "Checking PocketCloud installation..."
    
    if [[ ! -d "/opt/pocketcloud" ]]; then
        log_error "PocketCloud not found at /opt/pocketcloud"
        log_error "Make sure PocketCloud is installed"
        exit 1
    fi
    
    if [[ ! -d "/mnt/pocketcloud" ]]; then
        log_error "PocketCloud USB storage not found at /mnt/pocketcloud"
        log_error "Make sure USB storage is mounted"
        exit 1
    fi
    
    log_success "PocketCloud installation found"
}

# Create backup directory
create_backup_dir() {
    log_info "Creating backup directory: $BACKUP_DIR"
    
    mkdir -p "$BACKUP_DIR"
    
    if [[ ! -d "$BACKUP_DIR" ]]; then
        log_error "Failed to create backup directory: $BACKUP_DIR"
        exit 1
    fi
    
    log_success "Backup directory created"
}

# Backup application files
backup_application() {
    log_info "Backing up application files..."
    
    local app_backup="$BACKUP_DIR/application"
    mkdir -p "$app_backup"
    
    # Copy application files (excluding node_modules and logs)
    if [[ "$FULL_BACKUP" == true ]]; then
        cp -r /opt/pocketcloud/* "$app_backup/" 2>/dev/null || {
            log_warning "Some application files could not be copied (permission issues)"
        }
    else
        # Copy what we can without root
        for item in package.json server.js config routes views public middleware services utils; do
            if [[ -e "/opt/pocketcloud/$item" ]]; then
                cp -r "/opt/pocketcloud/$item" "$app_backup/" 2>/dev/null || {
                    log_warning "Could not copy $item (permission denied)"
                }
            fi
        done
    fi
    
    # Remove node_modules from backup (too large, can be reinstalled)
    rm -rf "$app_backup/node_modules" 2>/dev/null || true
    
    # Create a package list for easy restoration
    if [[ -f "/opt/pocketcloud/package.json" ]]; then
        echo "# PocketCloud dependencies" > "$app_backup/RESTORE_PACKAGES.txt"
        echo "# Run: npm install --production" >> "$app_backup/RESTORE_PACKAGES.txt"
        echo >> "$app_backup/RESTORE_PACKAGES.txt"
        cat "/opt/pocketcloud/package.json" >> "$app_backup/RESTORE_PACKAGES.txt"
    fi
    
    log_success "Application files backed up"
}

# Backup data and storage
backup_data() {
    log_info "Backing up user data and files..."
    
    # Backup database and configuration data
    if [[ -d "/mnt/pocketcloud/pocketcloud-data" ]]; then
        log_info "Backing up database and configuration..."
        cp -r "/mnt/pocketcloud/pocketcloud-data" "$BACKUP_DIR/data"
        log_success "Database and configuration backed up"
    else
        log_warning "Data directory not found: /mnt/pocketcloud/pocketcloud-data"
    fi
    
    # Backup user files
    if [[ -d "/mnt/pocketcloud/pocketcloud-storage" ]]; then
        log_info "Backing up user files..."
        cp -r "/mnt/pocketcloud/pocketcloud-storage" "$BACKUP_DIR/storage"
        log_success "User files backed up"
    else
        log_warning "Storage directory not found: /mnt/pocketcloud/pocketcloud-storage"
    fi
}

# Backup system configuration
backup_system_config() {
    log_info "Backing up system configuration..."
    
    local config_backup="$BACKUP_DIR/system"
    mkdir -p "$config_backup"
    
    # Backup systemd service file
    if [[ -f "/etc/systemd/system/pocketcloud.service" ]]; then
        cp "/etc/systemd/system/pocketcloud.service" "$config_backup/"
        log_success "Systemd service file backed up"
    fi
    
    # Backup fstab entry (USB mount configuration)
    if grep -q "/mnt/pocketcloud" /etc/fstab 2>/dev/null; then
        grep "/mnt/pocketcloud" /etc/fstab > "$config_backup/fstab_pocketcloud.txt"
        log_success "USB mount configuration backed up"
    fi
    
    # Backup firewall rules (if UFW is used)
    if command -v ufw &> /dev/null && [[ "$FULL_BACKUP" == true ]]; then
        ufw status > "$config_backup/ufw_status.txt" 2>/dev/null || true
        if [[ -d "/etc/ufw" ]]; then
            cp -r /etc/ufw "$config_backup/" 2>/dev/null || true
        fi
        log_success "Firewall configuration backed up"
    fi
}

# Create backup manifest
create_manifest() {
    log_info "Creating backup manifest..."
    
    local manifest="$BACKUP_DIR/BACKUP_MANIFEST.txt"
    
    cat > "$manifest" << EOF
PocketCloud Backup Manifest
===========================

Backup created: $(date)
Backup location: $BACKUP_DIR
Backup type: $(if [[ "$FULL_BACKUP" == true ]]; then echo "Full (root)"; else echo "Partial (user)"; fi)

Contents:
---------
EOF
    
    # List backup contents
    find "$BACKUP_DIR" -type f | sort | while read -r file; do
        local rel_path=${file#$BACKUP_DIR/}
        local size=$(du -h "$file" | cut -f1)
        echo "  $rel_path ($size)" >> "$manifest"
    done
    
    # Add restoration instructions
    cat >> "$manifest" << EOF

Restoration Instructions:
------------------------
1. Install PocketCloud on target system
2. Stop PocketCloud service: sudo systemctl stop pocketcloud
3. Restore data: sudo cp -r data/* /mnt/pocketcloud/pocketcloud-data/
4. Restore storage: sudo cp -r storage/* /mnt/pocketcloud/pocketcloud-storage/
5. Restore application: sudo cp -r application/* /opt/pocketcloud/
6. Install dependencies: cd /opt/pocketcloud && sudo -u pocketcloud npm install --production
7. Restore system config: sudo cp system/pocketcloud.service /etc/systemd/system/
8. Reload systemd: sudo systemctl daemon-reload
9. Start service: sudo systemctl start pocketcloud

For USB mount configuration, check system/fstab_pocketcloud.txt

Total backup size: $(du -sh "$BACKUP_DIR" | cut -f1)
EOF
    
    log_success "Backup manifest created"
}

# Compress backup (optional)
compress_backup() {
    log_info "Do you want to compress the backup? (y/N): "
    read -r compress_choice
    
    if [[ "$compress_choice" =~ ^[Yy]$ ]]; then
        log_info "Compressing backup..."
        
        local archive_name="pocketcloud_backup_$TIMESTAMP.tar.gz"
        local archive_path="$BACKUP_BASE/$archive_name"
        
        cd "$BACKUP_BASE"
        tar -czf "$archive_name" "pocketcloud_backup_$TIMESTAMP"
        
        if [[ -f "$archive_path" ]]; then
            log_success "Backup compressed: $archive_path"
            log_info "Compressed size: $(du -sh "$archive_path" | cut -f1)"
            
            log_info "Remove uncompressed backup? (y/N): "
            read -r remove_choice
            
            if [[ "$remove_choice" =~ ^[Yy]$ ]]; then
                rm -rf "$BACKUP_DIR"
                log_success "Uncompressed backup removed"
            fi
        else
            log_error "Failed to create compressed backup"
        fi
    fi
}

# Show backup summary
show_summary() {
    echo
    echo "=============================================="
    log_success "Backup Complete!"
    echo "=============================================="
    echo
    
    if [[ -d "$BACKUP_DIR" ]]; then
        echo "📁 Backup location: $BACKUP_DIR"
        echo "📊 Backup size: $(du -sh "$BACKUP_DIR" | cut -f1)"
        echo
        echo "📋 Backup contents:"
        ls -la "$BACKUP_DIR" | tail -n +2 | while read -r line; do
            echo "   $line"
        done
    fi
    
    # Check for compressed backup
    local archive_name="pocketcloud_backup_$TIMESTAMP.tar.gz"
    local archive_path="$BACKUP_BASE/$archive_name"
    if [[ -f "$archive_path" ]]; then
        echo
        echo "📦 Compressed backup: $archive_path"
        echo "📊 Compressed size: $(du -sh "$archive_path" | cut -f1)"
    fi
    
    echo
    echo "🔧 To restore this backup:"
    echo "   1. Install PocketCloud on target system"
    echo "   2. Stop service: sudo systemctl stop pocketcloud"
    echo "   3. Follow instructions in BACKUP_MANIFEST.txt"
    echo
    echo "💡 Tips:"
    echo "   • Test your backup by restoring to a test system"
    echo "   • Store backups on separate storage device"
    echo "   • Create regular backups (weekly recommended)"
    echo "   • Keep multiple backup versions"
    echo
}

# Main function
main() {
    echo "=============================================="
    echo "💾 PocketCloud Backup Script"
    echo "=============================================="
    echo
    
    check_permissions
    check_installation
    create_backup_dir
    backup_application
    backup_data
    backup_system_config
    create_manifest
    compress_backup
    show_summary
}

# Run main function
main "$@"