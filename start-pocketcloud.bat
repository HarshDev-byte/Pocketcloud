@echo off
setlocal enabledelayedexpansion

echo ========================================================================
echo                    Starting PocketCloud (Fixed Version)
echo ========================================================================

REM Check if USB drive parameter is provided
if "%1"=="" (
    echo Usage: start-pocketcloud-fixed.bat [DRIVE_LETTER]
    echo Example: start-pocketcloud-fixed.bat E:
    echo.
    echo Available drives:
    wmic logicaldisk get size,freespace,caption
    pause
    exit /b 1
)

set USB_DRIVE=%1
if not "%USB_DRIVE:~-1%"==":" set USB_DRIVE=%USB_DRIVE%:

REM Check if USB drive exists
if not exist "%USB_DRIVE%\" (
    echo ERROR: Drive %USB_DRIVE% not found
    echo Please check that your USB drive is connected and note the correct drive letter
    echo.
    echo Available drives:
    wmic logicaldisk get size,freespace,caption
    pause
    exit /b 1
)

REM Navigate to the correct directory
cd /d "C:\PocketCloud"

REM Check if we're in the right place
if not exist "backend\package.json" (
    echo ERROR: PocketCloud not found in C:\PocketCloud
    echo Please make sure PocketCloud is installed in C:\PocketCloud
    pause
    exit /b 1
)

REM Create storage directories on USB drive
set STORAGE_PATH=%USB_DRIVE%\PocketCloud
echo Creating storage directories on %USB_DRIVE%...
if not exist "%STORAGE_PATH%" mkdir "%STORAGE_PATH%"
if not exist "%STORAGE_PATH%\uploads" mkdir "%STORAGE_PATH%\uploads"
if not exist "%STORAGE_PATH%\backups" mkdir "%STORAGE_PATH%\backups"

echo Storage setup complete ✓

REM Set environment variables
set STORAGE_PATH=%STORAGE_PATH%
set NODE_ENV=production
set PORT=3000

echo.
echo Starting PocketCloud...
echo Storage location: %STORAGE_PATH%
echo Web interface: http://localhost:3000
echo.

REM Navigate to backend directory
cd backend

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    if !errorlevel! neq 0 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Start the server using the original server.js (not Windows-specific)
echo Starting server...
node server.js

pause