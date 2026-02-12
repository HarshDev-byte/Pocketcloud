@echo off
REM ============================================================================
REM PocketCloud One-Command Installer for Windows
REM Usage: install-pocketcloud.bat [USB_DRIVE_LETTER]
REM Example: install-pocketcloud.bat E
REM ============================================================================

if "%1"=="" (
    echo Usage: install-pocketcloud.bat [USB_DRIVE_LETTER]
    echo Example: install-pocketcloud.bat E
    echo.
    echo Available drives:
    wmic logicaldisk get caption,volumename,size,freespace
    pause
    exit /b 1
)

set USB_DRIVE=%1:
echo Installing PocketCloud to C:\PocketCloud with storage on %USB_DRIVE%...

REM Create directory and download
mkdir C:\PocketCloud 2>nul
cd /d C:\PocketCloud
git clone https://github.com/HarshDev-byte/Pocketcloud.git . || (echo ERROR: Git not found. Install from https://git-scm.com/download/win && pause && exit /b 1)

REM Install dependencies
cd backend
npm install || (echo ERROR: Node.js not found. Install from https://nodejs.org/ && pause && exit /b 1)
cd ..

REM Setup USB storage
mkdir %USB_DRIVE%\PocketCloud 2>nul
mkdir %USB_DRIVE%\PocketCloud\uploads 2>nul
mkdir %USB_DRIVE%\PocketCloud\backups 2>nul

REM Create desktop shortcut
echo @echo off > "%USERPROFILE%\Desktop\Start PocketCloud.bat"
echo cd /d "C:\PocketCloud" >> "%USERPROFILE%\Desktop\Start PocketCloud.bat"
echo start-pocketcloud-windows.bat %USB_DRIVE% >> "%USERPROFILE%\Desktop\Start PocketCloud.bat"

echo.
echo ✓ PocketCloud installed successfully!
echo ✓ Desktop shortcut created
echo ✓ Storage configured on %USB_DRIVE%
echo.
echo To start: Double-click "Start PocketCloud.bat" on your desktop
echo Then open: http://localhost:3000
echo.
pause