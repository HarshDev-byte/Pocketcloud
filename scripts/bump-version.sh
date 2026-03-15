#!/bin/bash
set -euo pipefail

# PocketCloud Version Bump Script
# Usage: ./scripts/bump-version.sh <major|minor|patch>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1" >&2
    exit 1
}

# Check if git is clean
check_git_status() {
    log "Checking git status..."
    
    if ! git diff-index --quiet HEAD --; then
        error "Git working directory is not clean. Commit or stash changes first."
    fi
    
    if [[ $(git rev-parse --abbrev-ref HEAD) != "main" ]]; then
        warn "Not on main branch. Current branch: $(git rev-parse --abbrev-ref HEAD)"
        echo -n "Continue anyway? [y/N] "
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            exit 0
        fi
    fi
    
    success "Git status clean"
}

# Get current version from package.json
get_current_version() {
    if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
        error "package.json not found in project root"
    fi
    
    local version=$(node -p "require('$PROJECT_ROOT/package.json').version")
    echo "$version"
}

# Calculate new version
calculate_new_version() {
    local current_version="$1"
    local bump_type="$2"
    
    # Parse current version (semantic versioning: major.minor.patch)
    local major=$(echo "$current_version" | cut -d. -f1)
    local minor=$(echo "$current_version" | cut -d. -f2)
    local patch=$(echo "$current_version" | cut -d. -f3)
    
    case "$bump_type" in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch)
            patch=$((patch + 1))
            ;;
        *)
            error "Invalid bump type: $bump_type. Use major, minor, or patch."
            ;;
    esac
    
    echo "$major.$minor.$patch"
}

# Update version in package.json files
update_package_versions() {
    local new_version="$1"
    
    log "Updating package.json versions to $new_version..."
    
    # Main package.json
    if [[ -f "$PROJECT_ROOT/package.json" ]]; then
        node -e "
            const fs = require('fs');
            const pkg = JSON.parse(fs.readFileSync('$PROJECT_ROOT/package.json', 'utf8'));
            pkg.version = '$new_version';
            fs.writeFileSync('$PROJECT_ROOT/package.json', JSON.stringify(pkg, null, 2) + '\n');
        "
        success "Updated main package.json"
    fi
    
    # Backend package.json
    if [[ -f "$PROJECT_ROOT/pocket-cloud/backend/package.json" ]]; then
        node -e "
            const fs = require('fs');
            const pkg = JSON.parse(fs.readFileSync('$PROJECT_ROOT/pocket-cloud/backend/package.json', 'utf8'));
            pkg.version = '$new_version';
            fs.writeFileSync('$PROJECT_ROOT/pocket-cloud/backend/package.json', JSON.stringify(pkg, null, 2) + '\n');
        "
        success "Updated backend package.json"
    fi
    
    # Frontend package.json
    if [[ -f "$PROJECT_ROOT/pocket-cloud/frontend/package.json" ]]; then
        node -e "
            const fs = require('fs');
            const pkg = JSON.parse(fs.readFileSync('$PROJECT_ROOT/pocket-cloud/frontend/package.json', 'utf8'));
            pkg.version = '$new_version';
            fs.writeFileSync('$PROJECT_ROOT/pocket-cloud/frontend/package.json', JSON.stringify(pkg, null, 2) + '\n');
        "
        success "Updated frontend package.json"
    fi
    
    # SDK package.json
    if [[ -f "$PROJECT_ROOT/sdk/package.json" ]]; then
        node -e "
            const fs = require('fs');
            const pkg = JSON.parse(fs.readFileSync('$PROJECT_ROOT/sdk/package.json', 'utf8'));
            pkg.version = '$new_version';
            fs.writeFileSync('$PROJECT_ROOT/sdk/package.json', JSON.stringify(pkg, null, 2) + '\n');
        "
        success "Updated SDK package.json"
    fi
    
    # CLI package.json
    if [[ -f "$PROJECT_ROOT/pcd-cli/package.json" ]]; then
        node -e "
            const fs = require('fs');
            const pkg = JSON.parse(fs.readFileSync('$PROJECT_ROOT/pcd-cli/package.json', 'utf8'));
            pkg.version = '$new_version';
            fs.writeFileSync('$PROJECT_ROOT/pcd-cli/package.json', JSON.stringify(pkg, null, 2) + '\n');
        "
        success "Updated CLI package.json"
    fi
    
    # Desktop clients
    for client_dir in pocketcloud-mac pocketcloud-win; do
        if [[ -f "$PROJECT_ROOT/$client_dir/package.json" ]]; then
            node -e "
                const fs = require('fs');
                const pkg = JSON.parse(fs.readFileSync('$PROJECT_ROOT/$client_dir/package.json', 'utf8'));
                pkg.version = '$new_version';
                fs.writeFileSync('$PROJECT_ROOT/$client_dir/package.json', JSON.stringify(pkg, null, 2) + '\n');
            "
            success "Updated $client_dir package.json"
        fi
    done
}

# Update CHANGELOG.md
update_changelog() {
    local new_version="$1"
    local current_date=$(date +%Y-%m-%d)
    
    log "Updating CHANGELOG.md..."
    
    if [[ ! -f "$PROJECT_ROOT/CHANGELOG.md" ]]; then
        # Create new changelog
        cat > "$PROJECT_ROOT/CHANGELOG.md" << EOF
# Changelog

All notable changes to PocketCloud Drive will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [$new_version] - $current_date

### Added
- Initial release of PocketCloud Drive

EOF
        success "Created new CHANGELOG.md"
    else
        # Prompt for release notes
        echo
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "📝 Release Notes for v$new_version"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo
        echo "Please provide release notes for this version."
        echo "Categories: Added, Changed, Deprecated, Removed, Fixed, Security"
        echo "Press Ctrl+D when finished, or Ctrl+C to cancel."
        echo
        
        # Read multi-line input
        local release_notes=""
        while IFS= read -r line; do
            release_notes+="$line"$'\n'
        done
        
        if [[ -z "$release_notes" ]]; then
            warn "No release notes provided, using placeholder"
            release_notes="### Added
- New features and improvements

### Fixed
- Bug fixes and stability improvements"
        fi
        
        # Insert new version into changelog
        local temp_file=$(mktemp)
        {
            head -n 6 "$PROJECT_ROOT/CHANGELOG.md"
            echo "## [$new_version] - $current_date"
            echo
            echo "$release_notes"
            echo
            tail -n +7 "$PROJECT_ROOT/CHANGELOG.md"
        } > "$temp_file"
        
        mv "$temp_file" "$PROJECT_ROOT/CHANGELOG.md"
        success "Updated CHANGELOG.md"
    fi
}

# Create git tag and commit
create_git_tag() {
    local new_version="$1"
    local tag_name="v$new_version"
    
    log "Creating git commit and tag..."
    
    # Stage all changes
    git add .
    
    # Commit version bump
    git commit -m "chore: bump version to $new_version

- Updated all package.json files
- Updated CHANGELOG.md with release notes
- Ready for release $tag_name"
    
    # Create annotated tag
    git tag -a "$tag_name" -m "PocketCloud Drive $tag_name

Release highlights:
- See CHANGELOG.md for detailed changes
- Download from GitHub releases page"
    
    success "Created commit and tag $tag_name"
}

# Push to remote
push_to_remote() {
    local new_version="$1"
    local tag_name="v$new_version"
    
    echo
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🚀 Ready to Release v$new_version"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo
    echo "The following will be pushed to the remote repository:"
    echo "• Commit with version bump"
    echo "• Tag: $tag_name"
    echo
    echo "This will trigger GitHub Actions to:"
    echo "• Build Pi OS image"
    echo "• Build desktop clients"
    echo "• Build CLI tools"
    echo "• Publish SDK to npm"
    echo "• Create GitHub release"
    echo "• Update documentation"
    echo
    echo -n "Push to remote and trigger release? [Y/n] "
    read -r response
    
    if [[ "$response" =~ ^[Nn]$ ]]; then
        warn "Release cancelled. To push later, run:"
        echo "  git push origin main"
        echo "  git push origin $tag_name"
        exit 0
    fi
    
    log "Pushing to remote..."
    
    # Push commit and tag
    git push origin main
    git push origin "$tag_name"
    
    success "Pushed to remote repository"
    
    echo
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🎉 Release v$new_version Started!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo
    echo "GitHub Actions is now building the release."
    echo "Monitor progress at: https://github.com/pocketcloud/pocketcloud/actions"
    echo
    echo "Release will be available at:"
    echo "https://github.com/pocketcloud/pocketcloud/releases/tag/$tag_name"
    echo
    echo "Estimated completion time: 15-20 minutes"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Show usage
show_usage() {
    echo "PocketCloud Version Bump Script"
    echo
    echo "Usage: $0 <major|minor|patch>"
    echo
    echo "Bump types:"
    echo "  major  - Increment major version (1.0.0 → 2.0.0)"
    echo "  minor  - Increment minor version (1.0.0 → 1.1.0)"
    echo "  patch  - Increment patch version (1.0.0 → 1.0.1)"
    echo
    echo "Examples:"
    echo "  $0 patch   # Bug fixes and small improvements"
    echo "  $0 minor   # New features, backward compatible"
    echo "  $0 major   # Breaking changes"
    echo
    echo "This script will:"
    echo "• Update all package.json files"
    echo "• Update CHANGELOG.md (with prompts)"
    echo "• Create git commit and tag"
    echo "• Push to remote (triggers release build)"
}

# Main function
main() {
    local bump_type="${1:-}"
    
    if [[ -z "$bump_type" ]]; then
        show_usage
        exit 1
    fi
    
    if [[ "$bump_type" == "--help" || "$bump_type" == "-h" ]]; then
        show_usage
        exit 0
    fi
    
    if [[ ! "$bump_type" =~ ^(major|minor|patch)$ ]]; then
        error "Invalid bump type: $bump_type"
    fi
    
    cd "$PROJECT_ROOT"
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🏷️  PocketCloud Version Bump"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    check_git_status
    
    local current_version=$(get_current_version)
    local new_version=$(calculate_new_version "$current_version" "$bump_type")
    
    echo "Current version: $current_version"
    echo "New version: $new_version"
    echo "Bump type: $bump_type"
    echo
    
    update_package_versions "$new_version"
    update_changelog "$new_version"
    create_git_tag "$new_version"
    push_to_remote "$new_version"
}

# Run main function
main "$@"