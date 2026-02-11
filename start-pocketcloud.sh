#!/bin/bash

# 🚀 PocketCloud One-Command Startup
# Run the entire PocketCloud system with a single command

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
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

log_header() {
    echo -e "${BOLD}${CYAN}$1${NC}"
}

# Banner
echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    🚀 PocketCloud Launcher                   ║"
echo "║              One Command to Rule Them All                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if we're in the right directory
if [[ ! -f "package.json" ]] || [[ ! -d "backend" ]]; then
    log_error "Please run this script from the PocketCloud root directory"
    exit 1
fi

# Function to check if PocketCloud is already running
check_running() {
    if pgrep -f "node.*server.js" > /dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to install dependencies
install_dependencies() {
    log_header "📦 Installing Dependencies..."
    
    # Install root dependencies
    log_info "Installing root dependencies..."
    npm install --silent
    
    # Install backend dependencies
    log_info "Installing backend dependencies..."
    cd backend
    npm install --silent
    cd ..
    
    # Install frontend dependencies if needed
    if [[ -d "frontend" ]] && [[ -f "frontend/package.json" ]]; then
        log_info "Installing frontend dependencies..."
        cd frontend
        npm install --silent
        cd ..
    fi
    
    log_success "All dependencies installed!"
}

# Function to check system requirements
check_requirements() {
    log_header "🔍 Checking System Requirements..."
    
    # Check Node.js version
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node --version | cut -d'v' -f2)
        log_success "Node.js version: $NODE_VERSION"
    else
        log_error "Node.js is not installed!"
        exit 1
    fi
    
    # Check if USB storage is mounted (if setup was completed)
    if [[ -d "/mnt/pocketcloud" ]]; then
        log_success "USB storage detected at /mnt/pocketcloud"
    else
        log_warning "USB storage not detected - first time setup may be needed"
    fi
    
    # Check if data directory exists
    if [[ -d "data" ]]; then
        log_success "Data directory exists"
    else
        log_warning "Data directory not found - will be created during startup"
    fi
}

# Function to run setup if needed
run_setup_if_needed() {
    # Check if this is first run
    if [[ ! -f "data/pocketcloud.db" ]] && [[ ! -f "/mnt/pocketcloud/pocketcloud-data/pocketcloud.db" ]]; then
        log_header "🛠️  First Time Setup Required"
        echo
        log_info "It looks like this is your first time running PocketCloud."
        log_info "Would you like to run the setup now? (y/n)"
        
        read -p "Run setup? [y/N]: " -n 1 -r
        echo
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log_info "Running PocketCloud setup..."
            bash setup.sh
            log_success "Setup completed!"
        else
            log_warning "Skipping setup - you can run 'bash setup.sh' later"
        fi
    fi
}

# Function to start the backend
start_backend() {
    log_header "🖥️  Starting PocketCloud Backend..."
    
    cd backend
    
    # Check if already running
    if check_running; then
        log_warning "PocketCloud backend is already running!"
        log_info "To restart, first stop it with: pkill -f 'node.*server.js'"
        cd ..
        return 1
    fi
    
    # Start the backend server
    log_info "Starting backend server on port 3000..."
    
    # Start in background and capture PID
    nohup node server.js > ../logs/pocketcloud.log 2>&1 &
    BACKEND_PID=$!
    
    # Create logs directory if it doesn't exist
    mkdir -p ../logs
    
    # Wait a moment for server to start
    sleep 3
    
    # Check if it's running
    if kill -0 $BACKEND_PID 2>/dev/null; then
        log_success "Backend started successfully! PID: $BACKEND_PID"
        echo $BACKEND_PID > ../logs/pocketcloud.pid
        cd ..
        return 0
    else
        log_error "Failed to start backend server"
        cd ..
        return 1
    fi
}

# Function to show status and access info
show_access_info() {
    log_header "🌐 PocketCloud Access Information"
    echo
    
    # Get local IP
    LOCAL_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "localhost")
    
    echo -e "${GREEN}✅ PocketCloud is running!${NC}"
    echo
    echo -e "${BOLD}Access URLs:${NC}"
    echo -e "  🏠 Local:    ${CYAN}http://localhost:3000${NC}"
    echo -e "  🌐 Network:  ${CYAN}http://$LOCAL_IP:3000${NC}"
    echo
    echo -e "${BOLD}Management Commands:${NC}"
    echo -e "  📊 Status:   ${YELLOW}bash tools/system-status.sh${NC}"
    echo -e "  🛑 Stop:     ${YELLOW}pkill -f 'node.*server.js'${NC}"
    echo -e "  📋 Logs:     ${YELLOW}tail -f logs/pocketcloud.log${NC}"
    echo -e "  💾 Backup:   ${YELLOW}sudo bash tools/backup-pocketcloud.sh${NC}"
    echo
    echo -e "${BOLD}Quick Actions:${NC}"
    echo -e "  🔧 Health Check: ${YELLOW}npm run health${NC}"
    echo -e "  📈 System Status: ${YELLOW}npm run status${NC}"
    echo
}

# Function to show logs in real-time
show_logs() {
    if [[ -f "logs/pocketcloud.log" ]]; then
        log_info "Showing real-time logs (Ctrl+C to exit)..."
        echo
        tail -f logs/pocketcloud.log
    else
        log_warning "No log file found yet"
    fi
}

# Main execution
main() {
    # Parse command line arguments
    case "${1:-}" in
        "--logs"|"-l")
            show_logs
            exit 0
            ;;
        "--stop"|"-s")
            log_info "Stopping PocketCloud..."
            pkill -f "node.*server.js" && log_success "PocketCloud stopped" || log_warning "PocketCloud was not running"
            exit 0
            ;;
        "--status")
            if check_running; then
                log_success "PocketCloud is running"
                show_access_info
            else
                log_warning "PocketCloud is not running"
            fi
            exit 0
            ;;
        "--help"|"-h")
            echo "PocketCloud Launcher Usage:"
            echo "  ./start-pocketcloud.sh          Start PocketCloud"
            echo "  ./start-pocketcloud.sh --logs   Show real-time logs"
            echo "  ./start-pocketcloud.sh --stop   Stop PocketCloud"
            echo "  ./start-pocketcloud.sh --status Check if running"
            echo "  ./start-pocketcloud.sh --help   Show this help"
            exit 0
            ;;
    esac
    
    # Check if already running
    if check_running; then
        log_success "PocketCloud is already running!"
        show_access_info
        exit 0
    fi
    
    # Run the startup sequence
    check_requirements
    echo
    
    install_dependencies
    echo
    
    run_setup_if_needed
    echo
    
    if start_backend; then
        echo
        show_access_info
        
        # Ask if user wants to see logs
        echo -e "${YELLOW}Would you like to see real-time logs? (y/n)${NC}"
        read -p "Show logs? [y/N]: " -n 1 -r
        echo
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            show_logs
        else
            log_info "PocketCloud is running in the background"
            log_info "Use './start-pocketcloud.sh --logs' to see logs anytime"
        fi
    else
        log_error "Failed to start PocketCloud"
        exit 1
    fi
}

# Create logs directory
mkdir -p logs

# Run main function
main "$@"