@echo off
echo ========================================================================
echo              Starting PocketCloud in Development Mode (Fixed)
echo ========================================================================
echo This will use local storage instead of USB drive
echo Web interface will be available at: http://localhost:3000
echo.

REM Navigate to the correct directory
cd /d "C:\PocketCloud"

REM Check if we're in the right place
if not exist "backend\package.json" (
    echo ERROR: PocketCloud not found in C:\PocketCloud
    echo Please make sure PocketCloud is installed in C:\PocketCloud
    pause
    exit /b 1
)

REM Set development environment variables
set NODE_ENV=development
set POCKETCLOUD_DEV_MODE=true
set PORT=3000

echo Storage location: ./backend/dev-storage
echo.

REM Navigate to backend directory
cd backend

REM Create dev-storage directory
if not exist "dev-storage" mkdir "dev-storage"
if not exist "dev-storage\uploads" mkdir "dev-storage\uploads"
if not exist "dev-storage\backups" mkdir "dev-storage\backups"

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Start the server using the original server.js
echo Starting server in development mode...
node server.js

pause