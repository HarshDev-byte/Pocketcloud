@echo off
setlocal enabledelayedexpansion

REM ============================================================================
REM PocketCloud Windows Quick Setup Script
REM Assumes Node.js and Git are already installed
REM ============================================================================

echo.
echo ========================================================================
echo                PocketCloud Windows Quick Setup
echo ========================================================================
echo.
echo This script will:
echo  - Download PocketCloud (if not already downloaded)
echo  - Install dependencies
echo  - Set up USB storage
echo  - Start PocketCloud
echo.
echo Prerequisites (must be installed first):
echo  - Node.js 18+ (from https://nodejs.org/)
echo  - Git for Windows (from https://git-scm.com/download/win)
echo  - USB drive connected
echo.
pause

REM Check if running as administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo WARNING: Not running as administrator
    echo Some features may not work properly
    echo.
    echo For best results:
    echo 1. Right-click on this file
    echo 2. Select "Run as administrator"
    echo.
    pause
)

echo.
echo ========================================================================
echo Checking Prerequisites
echo ========================================================================

REM Check Node.js
node -v >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('node -v') do echo Node.js: %%i ✓
) else (
    echo ERROR: Node.js not found
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check Git
git --version >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('git --version') do echo Git: %%i ✓
) else (
    echo ERROR: Git not found
    echo Please install Git from https://git-scm.com/download/win
    pause
    exit /b 1
)

echo.
echo ========================================================================
echo Setting Up PocketCloud
echo ========================================================================

REM Create and navigate to PocketCloud directory
set POCKETCLOUD_DIR=C:\PocketCloud
if not exist "%POCKETCLOUD_DIR%" mkdir "%POCKETCLOUD_DIR%"
cd /d "%POCKETCLOUD_DIR%"

REM Download or update PocketCloud
if exist "package.json" (
    echo Updating PocketCloud...
    git pull origin master
) else (
    echo Downloading PocketCloud...
    git clone https://github.com/HarshDev-byte/Pocketcloud.git .
)

if %errorlevel% neq 0 (
    echo ERROR: Failed to download PocketCloud
    pause
    exit /b 1
)

echo PocketCloud ready ✓

echo.
echo ========================================================================
echo Installing Dependencies
echo ========================================================================

cd backend
echo Installing Node.js packages...
npm install

if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo Dependencies installed ✓
cd ..

echo.
echo ========================================================================
echo USB Drive Setup
echo ========================================================================

echo.
echo Available drives:
wmic logicaldisk get size,freespace,caption,volumename

echo.
set /p USB_DRIVE="Enter your USB drive letter (e.g., E, F, G): "

REM Add colon if not provided
if not "%USB_DRIVE:~-1%"==":" set USB_DRIVE=%USB_DRIVE%:

REM Check if drive exists
if not exist "%USB_DRIVE%\" (
    echo ERROR: Drive %USB_DRIVE% not found
    echo Please connect your USB drive and try again
    pause
    exit /b 1
)

REM Create PocketCloud directories on USB drive
set STORAGE_PATH=%USB_DRIVE%\PocketCloud
echo Creating storage directories on %USB_DRIVE%...

if not exist "%STORAGE_PATH%" mkdir "%STORAGE_PATH%"
if not exist "%STORAGE_PATH%\uploads" mkdir "%STORAGE_PATH%\uploads"
if not exist "%STORAGE_PATH%\backups" mkdir "%STORAGE_PATH%\backups"

echo Storage setup complete ✓

echo.
echo ========================================================================
echo Creating Shortcuts
echo ========================================================================

REM Create start script
echo @echo off > start-pocketcloud.bat
echo cd /d "%POCKETCLOUD_DIR%" >> start-pocketcloud.bat
echo start-pocketcloud-windows.bat %USB_DRIVE% >> start-pocketcloud.bat

REM Create desktop shortcut
set DESKTOP=%USERPROFILE%\Desktop
copy start-pocketcloud.bat "%DESKTOP%\Start PocketCloud.bat" >nul

echo Desktop shortcut created ✓

echo.
echo ========================================================================
echo                        SETUP COMPLETE!
echo ========================================================================
echo.
echo ✓ PocketCloud downloaded and configured
echo ✓ Dependencies installed
echo ✓ USB storage configured: %STORAGE_PATH%
echo ✓ Desktop shortcut created
echo.
echo TO START POCKETCLOUD:
echo   Double-click "Start PocketCloud.bat" on your desktop
echo   OR run: start-pocketcloud-windows.bat %USB_DRIVE%
echo.
echo TO ACCESS POCKETCLOUD:
echo   Open browser to: http://localhost:3000
echo.
echo FIRST TIME SETUP:
echo   1. Start PocketCloud using the shortcut
echo   2. Open http://localhost:3000 in your browser
echo   3. Create your account
echo   4. Start uploading files!
echo.
echo ========================================================================

set /p START_NOW="Start PocketCloud now? (y/N): "
if /i "%START_NOW%"=="y" (
    echo.
    echo Starting PocketCloud...
    start-pocketcloud-windows.bat %USB_DRIVE%
) else (
    echo.
    echo Setup complete! Use the desktop shortcut to start PocketCloud.
)

pause