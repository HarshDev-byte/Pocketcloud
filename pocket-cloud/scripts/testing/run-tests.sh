#!/bin/bash

# Pocket Cloud Drive Test Runner
# Runs complete test suite with proper setup and cleanup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../backend" && pwd)"
FRONTEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../frontend" && pwd)"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Test options
RUN_BACKEND_TESTS=true
RUN_FRONTEND_TESTS=true
RUN_E2E_TESTS=false
GENERATE_COVERAGE=false
VERBOSE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --backend-only)
      RUN_FRONTEND_TESTS=false
      RUN_E2E_TESTS=false
      shift
      ;;
    --frontend-only)
      RUN_BACKEND_TESTS=false
      RUN_E2E_TESTS=false
      shift
      ;;
    --e2e)
      RUN_E2E_TESTS=true
      shift
      ;;
    --coverage)
      GENERATE_COVERAGE=true
      shift
      ;;
    --verbose|-v)
      VERBOSE=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [options]"
      echo "Options:"
      echo "  --backend-only    Run only backend tests"
      echo "  --frontend-only   Run only frontend tests"
      echo "  --e2e            Include E2E tests (requires running servers)"
      echo "  --coverage       Generate coverage reports"
      echo "  --verbose, -v    Verbose output"
      echo "  --help, -h       Show this help"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Logging functions
log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check if dependencies are installed
check_dependencies() {
    log "Checking dependencies..."
    
    if [ "$RUN_BACKEND_TESTS" = true ]; then
        if [ ! -d "$BACKEND_DIR/node_modules" ]; then
            error "Backend dependencies not installed. Run: cd backend && npm install"
            exit 1
        fi
    fi
    
    if [ "$RUN_FRONTEND_TESTS" = true ]; then
        if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
            error "Frontend dependencies not installed. Run: cd frontend && npm install"
            exit 1
        fi
    fi
    
    success "Dependencies check passed"
}

# Setup test environment
setup_test_env() {
    log "Setting up test environment..."
    
    # Create test directories
    mkdir -p "$ROOT_DIR/test-uploads"
    mkdir -p "$ROOT_DIR/test-files"
    mkdir -p "$ROOT_DIR/test-trash"
    
    # Set test environment variables
    export NODE_ENV=test
    export DB_PATH="$ROOT_DIR/test.db"
    export UPLOAD_TEMP_DIR="$ROOT_DIR/test-uploads"
    export STORAGE_PATH="$ROOT_DIR/test-files"
    
    success "Test environment ready"
}

# Cleanup test environment
cleanup_test_env() {
    log "Cleaning up test environment..."
    
    # Remove test directories
    rm -rf "$ROOT_DIR/test-uploads" 2>/dev/null || true
    rm -rf "$ROOT_DIR/test-files" 2>/dev/null || true
    rm -rf "$ROOT_DIR/test-trash" 2>/dev/null || true
    rm -f "$ROOT_DIR/test.db" 2>/dev/null || true
    
    success "Test environment cleaned"
}

# Run backend tests
run_backend_tests() {
    log "Running backend tests..."
    
    cd "$BACKEND_DIR"
    
    if [ "$GENERATE_COVERAGE" = true ]; then
        if [ "$VERBOSE" = true ]; then
            npm run test:coverage
        else
            npm run test:coverage > /dev/null 2>&1
        fi
        success "Backend tests with coverage completed"
    else
        if [ "$VERBOSE" = true ]; then
            npm test
        else
            npm test > /dev/null 2>&1
        fi
        success "Backend tests completed"
    fi
}

# Run frontend tests
run_frontend_tests() {
    log "Running frontend tests..."
    
    cd "$FRONTEND_DIR"
    
    if [ "$GENERATE_COVERAGE" = true ]; then
        if [ "$VERBOSE" = true ]; then
            npm run test:coverage
        else
            npm run test:coverage > /dev/null 2>&1
        fi
        success "Frontend tests with coverage completed"
    else
        if [ "$VERBOSE" = true ]; then
            npm test
        else
            npm test > /dev/null 2>&1
        fi
        success "Frontend tests completed"
    fi
}

# Run E2E tests
run_e2e_tests() {
    log "Running E2E tests..."
    warning "E2E tests require running backend and frontend servers"
    
    cd "$FRONTEND_DIR"
    
    # Check if servers are running
    if ! curl -f -s http://localhost:3001/api/health > /dev/null 2>&1; then
        error "Backend server not running on localhost:3001"
        return 1
    fi
    
    if ! curl -f -s http://localhost:5173 > /dev/null 2>&1; then
        error "Frontend server not running on localhost:5173"
        return 1
    fi
    
    if [ "$VERBOSE" = true ]; then
        npm run test:e2e
    else
        npm run test:e2e > /dev/null 2>&1
    fi
    
    success "E2E tests completed"
}

# Run health check
run_health_check() {
    log "Running health check..."
    
    cd "$ROOT_DIR"
    
    if [ -x "./scripts/health-check.sh" ]; then
        if [ "$VERBOSE" = true ]; then
            ./scripts/health-check.sh --verbose
        else
            ./scripts/health-check.sh --quiet
        fi
        success "Health check passed"
    else
        warning "Health check script not found or not executable"
    fi
}

# Generate test report
generate_report() {
    log "Generating test report..."
    
    local report_file="$ROOT_DIR/test-report.txt"
    
    {
        echo "Pocket Cloud Drive Test Report"
        echo "Generated: $(date)"
        echo "================================"
        echo ""
        
        if [ "$RUN_BACKEND_TESTS" = true ]; then
            echo "Backend Tests: PASSED"
        fi
        
        if [ "$RUN_FRONTEND_TESTS" = true ]; then
            echo "Frontend Tests: PASSED"
        fi
        
        if [ "$RUN_E2E_TESTS" = true ]; then
            echo "E2E Tests: PASSED"
        fi
        
        echo ""
        echo "Coverage Reports:"
        
        if [ "$GENERATE_COVERAGE" = true ]; then
            if [ -f "$BACKEND_DIR/coverage/coverage-summary.json" ]; then
                echo "- Backend: $BACKEND_DIR/coverage/index.html"
            fi
            
            if [ -f "$FRONTEND_DIR/coverage/coverage-summary.json" ]; then
                echo "- Frontend: $FRONTEND_DIR/coverage/index.html"
            fi
        fi
        
    } > "$report_file"
    
    success "Test report generated: $report_file"
}

# Main execution
main() {
    log "Starting Pocket Cloud Drive test suite..."
    
    # Trap to ensure cleanup on exit
    trap cleanup_test_env EXIT
    
    # Setup
    check_dependencies
    setup_test_env
    
    # Run tests
    local test_failed=false
    
    if [ "$RUN_BACKEND_TESTS" = true ]; then
        if ! run_backend_tests; then
            test_failed=true
        fi
    fi
    
    if [ "$RUN_FRONTEND_TESTS" = true ]; then
        if ! run_frontend_tests; then
            test_failed=true
        fi
    fi
    
    if [ "$RUN_E2E_TESTS" = true ]; then
        if ! run_e2e_tests; then
            test_failed=true
        fi
    fi
    
    # Health check (optional)
    run_health_check || true
    
    # Generate report
    if [ "$test_failed" = false ]; then
        generate_report
        success "All tests passed!"
        exit 0
    else
        error "Some tests failed!"
        exit 1
    fi
}

# Run main function
main "$@"