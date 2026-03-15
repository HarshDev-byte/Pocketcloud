#!/bin/bash
# Pocket Cloud Drive Cleanup Script
# Runs daily maintenance tasks

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() { echo -e "${BLUE}[CLEANUP]${NC} $1"; }
print_success() { echo -e "${GREEN}[CLEANUP]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[CLEANUP]${NC} $1"; }
print_error() { echo -e "${RED}[CLEANUP]${NC} $1"; }

# Configuration
BACKEND_DIR="/opt/pocketcloud/backend"
STORAGE_DIR="/mnt/pocketcloud"
UPLOAD_TEMP_DIR="$BACKEND_DIR/uploads"
TRASH_RETENTION_DAYS=30
UPLOAD_STALE_HOURS=24
LOG_RETENTION_DAYS=7

cleanup_expired_trash() {
    print_step "Cleaning up expired trash items (older than $TRASH_RETENTION_DAYS days)..."
    
    local count=0
    local cutoff_date=$(date -d "$TRASH_RETENTION_DAYS days ago" +%s)000  # Convert to milliseconds
    
    # Use Node.js to call the cleanup API internally
    cd "$BACKEND_DIR"
    
    # Create a temporary cleanup script
    cat > /tmp/cleanup_trash.js << EOF
const { db } = require('./dist/db/client.js');

async function cleanupExpiredTrash() {
    try {
        const cutoffDate = $cutoff_date;
        
        // Get expired files
        const expiredFiles = db.prepare(\`
            SELECT id, storage_path, size FROM files 
            WHERE is_deleted = 1 AND deleted_at < ?
        \`).all(cutoffDate);
        
        // Get expired folders
        const expiredFolders = db.prepare(\`
            SELECT id FROM folders 
            WHERE is_deleted = 1 AND deleted_at < ?
        \`).all(cutoffDate);
        
        let totalSize = 0;
        let fileCount = 0;
        
        // Delete files from disk and database
        for (const file of expiredFiles) {
            try {
                const fs = require('fs');
                if (fs.existsSync(file.storage_path)) {
                    fs.unlinkSync(file.storage_path);
                }
                totalSize += file.size;
                fileCount++;
            } catch (error) {
                console.error(\`Failed to delete file \${file.storage_path}:\`, error.message);
            }
        }
        
        // Remove from database
        if (expiredFiles.length > 0) {
            const fileIds = expiredFiles.map(f => f.id);
            const placeholders = fileIds.map(() => '?').join(',');
            db.prepare(\`DELETE FROM files WHERE id IN (\${placeholders})\`).run(...fileIds);
        }
        
        if (expiredFolders.length > 0) {
            const folderIds = expiredFolders.map(f => f.id);
            const placeholders = folderIds.map(() => '?').join(',');
            db.prepare(\`DELETE FROM folders WHERE id IN (\${placeholders})\`).run(...folderIds);
        }
        
        // Update storage stats
        if (totalSize > 0) {
            db.prepare(\`
                UPDATE storage_stats 
                SET used_bytes = used_bytes - ?, 
                    file_count = file_count - ?,
                    updated_at = ?
                WHERE id = 1
            \`).run(totalSize, fileCount, Date.now());
        }
        
        console.log(\`Cleaned up \${fileCount} expired files (\${Math.round(totalSize/1024/1024)}MB) and \${expiredFolders.length} folders\`);
        
    } catch (error) {
        console.error('Cleanup error:', error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

cleanupExpiredTrash();
EOF

    if node /tmp/cleanup_trash.js 2>/dev/null; then
        print_success "Expired trash cleanup completed"
    else
        print_warning "Expired trash cleanup failed or had no items to clean"
    fi
    
    rm -f /tmp/cleanup_trash.js
}

cleanup_stalled_uploads() {
    print_step "Cleaning up stalled uploads (older than $UPLOAD_STALE_HOURS hours)..."
    
    local count=0
    
    if [[ -d "$UPLOAD_TEMP_DIR" ]]; then
        # Find and remove stalled upload directories
        while IFS= read -r -d '' upload_dir; do
            if [[ -d "$upload_dir" ]]; then
                rm -rf "$upload_dir"
                ((count++))
            fi
        done < <(find "$UPLOAD_TEMP_DIR" -maxdepth 1 -type d -mtime +0 -print0 2>/dev/null)
        
        print_success "Cleaned up $count stalled upload directories"
    else
        print_warning "Upload temp directory not found: $UPLOAD_TEMP_DIR"
    fi
}

cleanup_old_logs() {
    print_step "Cleaning up old log files (older than $LOG_RETENTION_DAYS days)..."
    
    local count=0
    
    # Clean application logs
    if [[ -d "$STORAGE_DIR/logs" ]]; then
        count=$(find "$STORAGE_DIR/logs" -name "*.log" -mtime +$LOG_RETENTION_DAYS -delete -print | wc -l)
        print_success "Cleaned up $count old log files"
    fi
    
    # Clean journal logs (let systemd handle this, just report)
    local journal_size=$(journalctl --disk-usage 2>/dev/null | grep -o '[0-9.]*[KMGT]B' || echo "unknown")
    print_step "Current journal size: $journal_size"
}

update_storage_stats() {
    print_step "Updating storage statistics..."
    
    cd "$BACKEND_DIR"
    
    # Create a temporary stats update script
    cat > /tmp/update_stats.js << EOF
const { db } = require('./dist/db/client.js');
const fs = require('fs');
const path = require('path');

async function updateStorageStats() {
    try {
        // Calculate actual storage usage
        const filesDir = '$STORAGE_DIR/files';
        let totalSize = 0;
        let fileCount = 0;
        
        if (fs.existsSync(filesDir)) {
            function calculateDirSize(dir) {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    const filePath = path.join(dir, file);
                    const stats = fs.statSync(filePath);
                    if (stats.isDirectory()) {
                        calculateDirSize(filePath);
                    } else {
                        totalSize += stats.size;
                        fileCount++;
                    }
                }
            }
            
            calculateDirSize(filesDir);
        }
        
        // Get database file count for comparison
        const dbFileCount = db.prepare('SELECT COUNT(*) as count FROM files WHERE is_deleted = 0').get().count;
        
        // Update storage stats
        db.prepare(\`
            UPDATE storage_stats 
            SET used_bytes = ?, 
                file_count = ?,
                updated_at = ?
            WHERE id = 1
        \`).run(totalSize, dbFileCount, Date.now());
        
        console.log(\`Updated storage stats: \${Math.round(totalSize/1024/1024)}MB, \${dbFileCount} files\`);
        
        // Report discrepancy if any
        if (fileCount !== dbFileCount) {
            console.warn(\`File count mismatch: disk=\${fileCount}, db=\${dbFileCount}\`);
        }
        
    } catch (error) {
        console.error('Stats update error:', error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

updateStorageStats();
EOF

    if node /tmp/update_stats.js 2>/dev/null; then
        print_success "Storage statistics updated"
    else
        print_warning "Storage statistics update failed"
    fi
    
    rm -f /tmp/update_stats.js
}

optimize_database() {
    print_step "Optimizing database..."
    
    cd "$BACKEND_DIR"
    
    # Create database optimization script
    cat > /tmp/optimize_db.js << EOF
const { db } = require('./dist/db/client.js');

try {
    // Run VACUUM to reclaim space
    db.exec('VACUUM');
    
    // Analyze tables for query optimization
    db.exec('ANALYZE');
    
    // Checkpoint WAL file
    db.pragma('wal_checkpoint(TRUNCATE)');
    
    console.log('Database optimization completed');
} catch (error) {
    console.error('Database optimization error:', error);
    process.exit(1);
} finally {
    process.exit(0);
}
EOF

    if node /tmp/optimize_db.js 2>/dev/null; then
        print_success "Database optimization completed"
    else
        print_warning "Database optimization failed"
    fi
    
    rm -f /tmp/optimize_db.js
}

check_disk_space() {
    print_step "Checking disk space..."
    
    if [[ -d "$STORAGE_DIR" ]]; then
        local usage=$(df "$STORAGE_DIR" | awk 'NR==2 {print $5}' | sed 's/%//')
        local available=$(df -h "$STORAGE_DIR" | awk 'NR==2 {print $4}')
        
        print_step "Storage usage: ${usage}% (${available} available)"
        
        if [[ $usage -gt 90 ]]; then
            print_warning "Storage usage is high: ${usage}%"
        elif [[ $usage -gt 95 ]]; then
            print_error "Storage usage is critical: ${usage}%"
        fi
    else
        print_warning "Storage directory not mounted: $STORAGE_DIR"
    fi
}

generate_cleanup_report() {
    print_step "Generating cleanup report..."
    
    local report_file="$STORAGE_DIR/logs/cleanup-$(date +%Y%m%d).log"
    
    {
        echo "Pocket Cloud Drive Cleanup Report"
        echo "Generated: $(date)"
        echo "================================"
        echo
        echo "Storage Usage:"
        df -h "$STORAGE_DIR" 2>/dev/null || echo "Storage not available"
        echo
        echo "Database Size:"
        ls -lh "$STORAGE_DIR/db/"*.db 2>/dev/null || echo "Database not found"
        echo
        echo "Upload Temp Directory:"
        du -sh "$UPLOAD_TEMP_DIR" 2>/dev/null || echo "Upload temp not found"
        echo
        echo "Log Files:"
        ls -lh "$STORAGE_DIR/logs/"*.log 2>/dev/null | tail -5 || echo "No log files"
        echo
    } > "$report_file"
    
    print_success "Cleanup report saved: $report_file"
}

main() {
    print_step "Starting daily cleanup tasks..."
    
    local start_time=$(date +%s)
    
    # Run cleanup tasks
    cleanup_expired_trash
    cleanup_stalled_uploads
    cleanup_old_logs
    update_storage_stats
    optimize_database
    check_disk_space
    generate_cleanup_report
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    print_success "Cleanup completed in ${duration} seconds"
}

# Handle errors gracefully
trap 'print_error "Cleanup script failed at line $LINENO"' ERR

main "$@"