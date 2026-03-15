#!/bin/bash

# Comprehensive test script for PocketCloud macOS app
# Tests build, functionality, and distribution readiness

set -e

echo "🧪 PocketCloud macOS App - Comprehensive Test Suite"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
pass() {
    echo -e "${GREEN}✅ $1${NC}"
    ((TESTS_PASSED++))
}

fail() {
    echo -e "${RED}❌ $1${NC}"
    ((TESTS_FAILED++))
}

warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Test 1: Environment Check
echo -e "\n${BLUE}Test 1: Environment Check${NC}"
echo "------------------------"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    pass "Node.js installed: $NODE_VERSION"
else
    fail "Node.js not found"
fi

if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    pass "npm installed: $NPM_VERSION"
else
    fail "npm not found"
fi

if [[ "$OSTYPE" == "darwin"* ]]; then
    MACOS_VERSION=$(sw_vers -productVersion)
    pass "macOS detected: $MACOS_VERSION"
else
    fail "Not running on macOS"
fi

# Test 2: Dependencies
echo -e "\n${BLUE}Test 2: Dependencies${NC}"
echo "-------------------"

if [ -f "package.json" ]; then
    pass "package.json exists"
else
    fail "package.json not found"
fi

if [ -d "node_modules" ]; then
    pass "node_modules directory exists"
else
    warn "node_modules not found, running npm install..."
    npm install
    if [ $? -eq 0 ]; then
        pass "Dependencies installed successfully"
    else
        fail "Failed to install dependencies"
    fi
fi

# Test 3: TypeScript Compilation
echo -e "\n${BLUE}Test 3: TypeScript Compilation${NC}"
echo "------------------------------"

info "Cleaning previous build..."
npm run clean > /dev/null 2>&1

info "Building main process..."
if npm run build:main > /dev/null 2>&1; then
    pass "Main process compiled successfully"
else
    fail "Main process compilation failed"
fi

info "Building renderer process..."
if npm run build:renderer > /dev/null 2>&1; then
    pass "Renderer process compiled successfully"
else
    fail "Renderer process compilation failed"
fi

# Test 4: Build Artifacts
echo -e "\n${BLUE}Test 4: Build Artifacts${NC}"
echo "----------------------"

if [ -f "dist/src/main.js" ]; then
    pass "Main process output exists"
else
    fail "Main process output missing"
fi

if [ -f "dist/renderer/app.js" ]; then
    pass "Renderer process output exists"
else
    fail "Renderer process output missing"
fi

if [ -f "dist/src/preload.js" ]; then
    pass "Preload script compiled"
else
    fail "Preload script missing"
fi

# Test 5: Assets
echo -e "\n${BLUE}Test 5: Assets${NC}"
echo "-------------"

if [ -f "assets/tray-icon.png" ]; then
    pass "Base tray icon exists"
else
    warn "Base tray icon missing, creating..."
    cd assets && ./create-simple-icons.sh > /dev/null 2>&1 && cd ..
    if [ -f "assets/tray-icon.png" ]; then
        pass "Tray icons created successfully"
    else
        fail "Failed to create tray icons"
    fi
fi

if [ -f "assets/tray-icon-active.png" ]; then
    pass "Active tray icon exists"
else
    fail "Active tray icon missing"
fi

if [ -f "assets/tray-icon-upload.png" ]; then
    pass "Upload tray icon exists"
else
    fail "Upload tray icon missing"
fi

# Test 6: Configuration Files
echo -e "\n${BLUE}Test 6: Configuration Files${NC}"
echo "---------------------------"

if [ -f "tsconfig.json" ]; then
    pass "TypeScript configuration exists"
else
    fail "tsconfig.json missing"
fi

if [ -f "webpack.config.js" ]; then
    pass "Webpack configuration exists"
else
    fail "webpack.config.js missing"
fi

if [ -f "build/entitlements.mac.plist" ]; then
    pass "macOS entitlements file exists"
else
    fail "Entitlements file missing"
fi

# Test 7: Electron App Structure
echo -e "\n${BLUE}Test 7: Electron App Structure${NC}"
echo "------------------------------"

# Check if electron is available
if [ -f "node_modules/.bin/electron" ]; then
    pass "Electron binary available"
else
    fail "Electron binary not found"
fi

# Validate main entry point
MAIN_ENTRY=$(node -p "require('./package.json').main")
if [ -f "$MAIN_ENTRY" ]; then
    pass "Main entry point exists: $MAIN_ENTRY"
else
    fail "Main entry point missing: $MAIN_ENTRY"
fi

# Test 8: Quick App Launch Test
echo -e "\n${BLUE}Test 8: Quick App Launch Test${NC}"
echo "-----------------------------"

info "Testing app launch (5 second timeout)..."
timeout 5s node test-app.js > /tmp/pocketcloud-test.log 2>&1 &
APP_PID=$!

sleep 2

if kill -0 $APP_PID 2>/dev/null; then
    pass "App launched successfully"
    kill $APP_PID 2>/dev/null || true
else
    if grep -q "Starting PocketCloud discovery service" /tmp/pocketcloud-test.log; then
        pass "App initialized correctly"
    else
        fail "App failed to launch properly"
        echo "Last few lines of log:"
        tail -5 /tmp/pocketcloud-test.log
    fi
fi

# Test 9: Package.json Validation
echo -e "\n${BLUE}Test 9: Package.json Validation${NC}"
echo "-------------------------------"

# Check required fields
REQUIRED_FIELDS=("name" "version" "main" "author" "license")
for field in "${REQUIRED_FIELDS[@]}"; do
    if node -p "require('./package.json').$field" > /dev/null 2>&1; then
        VALUE=$(node -p "require('./package.json').$field")
        pass "$field: $VALUE"
    else
        fail "Missing required field: $field"
    fi
done

# Check build configuration
if node -p "require('./package.json').build" > /dev/null 2>&1; then
    pass "Electron-builder configuration present"
else
    fail "Missing electron-builder configuration"
fi

# Test 10: Distribution Readiness
echo -e "\n${BLUE}Test 10: Distribution Readiness${NC}"
echo "-------------------------------"

# Check if we can create a distributable (dry run)
info "Testing distribution build (dry run)..."
if npm run pack > /dev/null 2>&1; then
    pass "Package creation successful"
    
    # Check if build directory was created
    if [ -d "build" ]; then
        pass "Build directory created"
        
        # List contents
        BUILD_FILES=$(ls build/ 2>/dev/null | wc -l)
        if [ "$BUILD_FILES" -gt 0 ]; then
            pass "Build artifacts generated ($BUILD_FILES files)"
        else
            warn "Build directory empty"
        fi
    else
        warn "Build directory not created"
    fi
else
    fail "Package creation failed"
fi

# Test Summary
echo -e "\n${BLUE}Test Summary${NC}"
echo "============"

TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))
PASS_RATE=$((TESTS_PASSED * 100 / TOTAL_TESTS))

echo -e "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo -e "Pass Rate: $PASS_RATE%"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}🎉 All tests passed! PocketCloud macOS app is ready.${NC}"
    echo -e "\n${BLUE}Next Steps:${NC}"
    echo "1. Run 'npm run dev' for development"
    echo "2. Run 'npm run dist:mac' to build DMG"
    echo "3. Test on target macOS versions"
    echo "4. Set up code signing for distribution"
    exit 0
else
    echo -e "\n${RED}❌ Some tests failed. Please fix issues before proceeding.${NC}"
    exit 1
fi