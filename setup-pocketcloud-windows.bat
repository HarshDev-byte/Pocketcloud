@echo off
setlocal enabledelayedexpansion

REM ============================================================================
REM PocketCloud Windows One-Command Setup Script
REM This script will automatically set up PocketCloud on Windows 10/11
REM ============================================================================

echo.
echo ========================================================================
echo                    PocketCloud Windows Setup
echo ========================================================================
echo.
echo This script will automatically:
echo  - Check system requirements
echo  - Install Node.js (if needed)
echo  - Install Git (if needed)
echo  - Download PocketCloud
echo  - Install dependencies
echo  - Set up USB storage
echo  - Start PocketCloud
echo.
echo Requirements:
echo  - Windows 10/11 (64-bit)
echo  - Administrator privileges
echo  - Internet connection
echo  - USB drive connected
echo.
pause

REM Check if running as administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERROR: This script must be run as Administrator
    echo.
    echo Please:
    echo 1. Right-click on this file
    echo 2. Select "Run as administrator"
    echo 3. Click "Yes" when prompted
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================================================
echo Step 1: Checking System Requirements
echo ========================================================================

REM Check Windows version
for /f "tokens=4-5 delims=. " %%i in ('ver') do set VERSION=%%i.%%j
echo Windows version: %VERSION%

REM Check if 64-bit
if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
    echo Architecture: 64-bit ✓
) else (
    echo ERROR: 32-bit Windows is not supported
    echo Please use 64-bit Windows 10 or 11
    pause
    exit /b 1
)

echo.
echo ========================================================================
echo Step 2: Checking Node.js Installation
echo ========================================================================

REM Check if Node.js is installed
node -v >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
    echo Node.js found: !NODE_VERSION! ✓
    
    REM Check if version is 18 or higher
    for /f "tokens=1 delims=v" %%a in ("!NODE_VERSION!") do (
        for /f "tokens=1 delims=." %%b in ("%%a") do set MAJOR_VERSION=%%b
    )
    
    if !MAJOR_VERSION! geq 18 (
        echo Node.js version is compatible ✓
        set NODE_OK=1
    ) else (
        echo WARNING: Node.js version is too old (need 18+)
        set NODE_OK=0
    )
) else (
    echo Node.js not found
    set NODE_OK=0
)

if !NODE_OK! equ 0 (
    echo.
    echo Installing Node.js 20 LTS...
    echo.
    echo Downloading Node.js installer...
    
    REM Create temp directory
    if not exist "%TEMP%\pocketcloud-setup" mkdir "%TEMP%\pocketcloud-setup"
    
    REM Download Node.js installer
    powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi' -OutFile '%TEMP%\pocketcloud-setup\nodejs.msi'}"
    
    if exist "%TEMP%\pocketcloud-setup\nodejs.msi" (
        echo Installing Node.js...
        msiexec /i "%TEMP%\pocketcloud-setup\nodejs.msi" /quiet /norestart
        
        REM Wait for installation to complete
        timeout /t 30 /nobreak >nul
        
        REM Refresh PATH
        call :RefreshPath
        
        REM Verify installation
        node -v >nul 2>&1
        if !errorlevel! equ 0 (
            for /f "tokens=*" %%i in ('node -v') do echo Node.js installed successfully: %%i ✓
        ) else (
            echo ERROR: Node.js installation failed
            echo Please install Node.js manually from https://nodejs.org/
            pause
            exit /b 1
        )
    ) else (
        echo ERROR: Failed to download Node.js installer
        echo Please check your internet connection and try again
        pause
        exit /b 1
    )
)

echo.
echo ========================================================================
echo Step 3: Checking Git Installation
echo ========================================================================

REM Check if Git is installed
git --version >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('git --version') do echo Git found: %%i ✓
    set GIT_OK=1
) else (
    echo Git not found
    set GIT_OK=0
)

if !GIT_OK! equ 0 (
    echo.
    echo Installing Git for Windows...
    echo.
    echo Downloading Git installer...
    
    REM Download Git installer
    powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/git-for-windows/git/releases/download/v2.43.0.windows.1/Git-2.43.0-64-bit.exe' -OutFile '%TEMP%\pocketcloud-setup\git.exe'}"
    
    if exist "%TEMP%\pocketcloud-setup\git.exe" (
        echo Installing Git...
        "%TEMP%\pocketcloud-setup\git.exe" /VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS /COMPONENTS="icons,ext\reg\shellhere,assoc,assoc_sh"
        
        REM Wait for installation to complete
        timeout /t 45 /nobreak >nul
        
        REM Refresh PATH
        call :RefreshPath
        
        REM Verify installation
        git --version >nul 2>&1
        if !errorlevel! equ 0 (
            for /f "tokens=*" %%i in ('git --version') do echo Git installed successfully: %%i ✓
        ) else (
            echo ERROR: Git installation failed
            echo Please install Git manually from https://git-scm.com/download/win
            pause
            exit /b 1
        )
    ) else (
        echo ERROR: Failed to download Git installer
        echo Please check your internet connection and try again
        pause
        exit /b 1
    )
)

echo.
echo ========================================================================
echo Step 4: Setting Up PocketCloud Directory
echo ========================================================================

REM Create PocketCloud directory
set POCKETCLOUD_DIR=C:\PocketCloud
if not exist "%POCKETCLOUD_DIR%" (
    echo Creating directory: %POCKETCLOUD_DIR%
    mkdir "%POCKETCLOUD_DIR%"
    echo Directory created ✓
) else (
    echo Directory already exists: %POCKETCLOUD_DIR% ✓
)

REM Navigate to PocketCloud directory
cd /d "%POCKETCLOUD_DIR%"

echo.
echo ========================================================================
echo Step 5: Downloading PocketCloud
echo ========================================================================

REM Check if PocketCloud is already downloaded
if exist "package.json" (
    echo PocketCloud already downloaded ✓
    echo Updating to latest version...
    git pull origin master
) else (
    echo Downloading PocketCloud from GitHub...
    git clone https://github.com/HarshDev-byte/Pocketcloud.git .
    
    if !errorlevel! equ 0 (
        echo PocketCloud downloaded successfully ✓
    ) else (
        echo ERROR: Failed to download PocketCloud
        echo Please check your internet connection and try again
        pause
        exit /b 1
    )
)

echo.
echo ========================================================================
echo Step 6: Installing Dependencies
echo ========================================================================

echo Installing PocketCloud dependencies...
cd backend
npm install

if %errorlevel% equ 0 (
    echo Dependencies installed successfully ✓
) else (
    echo ERROR: Failed to install dependencies
    echo Please check your internet connection and try again
    pause
    exit /b 1
)

cd ..

echo.
echo ========================================================================
echo Step 7: USB Drive Setup
echo ========================================================================

echo.
echo Available drives:
wmic logicaldisk get size,freespace,caption,volumename

echo.
echo Please connect your USB drive if not already connected.
echo The USB drive will be used to store your encrypted files.
echo.
set /p USB_DRIVE="Enter your USB drive letter (e.g., E, F, G): "

REM Add colon if not provided
if not "%USB_DRIVE:~-1%"==":" set USB_DRIVE=%USB_DRIVE%:

REM Check if drive exists
if not exist "%USB_DRIVE%\" (
    echo ERROR: Drive %USB_DRIVE% not found
    echo Please check that your USB drive is connected
    echo.
    echo Available drives:
    wmic logicaldisk get size,freespace,caption,volumename
    pause
    exit /b 1
)

echo.
echo WARNING: This will format your USB drive and erase all data on it!
echo Drive: %USB_DRIVE%
echo.
set /p CONFIRM="Are you sure you want to format %USB_DRIVE%? (y/N): "

if /i not "%CONFIRM%"=="y" (
    echo Setup cancelled by user
    pause
    exit /b 1
)

echo.
echo Formatting USB drive %USB_DRIVE% with NTFS...
format %USB_DRIVE% /FS:NTFS /Q /V:POCKETCLOUD /Y

if %errorlevel% equ 0 (
    echo USB drive formatted successfully ✓
) else (
    echo ERROR: Failed to format USB drive
    echo Please format the drive manually:
    echo 1. Right-click on %USB_DRIVE% in File Explorer
    echo 2. Select "Format"
    echo 3. Choose NTFS file system
    echo 4. Set label to "POCKETCLOUD"
    echo 5. Click "Start"
    pause
    exit /b 1
)

REM Create PocketCloud directory on USB drive
set STORAGE_PATH=%USB_DRIVE%\PocketCloud
if not exist "%STORAGE_PATH%" mkdir "%STORAGE_PATH%"
if not exist "%STORAGE_PATH%\uploads" mkdir "%STORAGE_PATH%\uploads"
if not exist "%STORAGE_PATH%\backups" mkdir "%STORAGE_PATH%\backups"

echo Storage directories created ✓

echo.
echo ========================================================================
echo Step 8: Creating Desktop Shortcuts
echo ========================================================================

REM Create desktop shortcut for starting PocketCloud
set DESKTOP=%USERPROFILE%\Desktop
set SHORTCUT_PATH=%DESKTOP%\Start PocketCloud.bat

echo @echo off > "%SHORTCUT_PATH%"
echo cd /d "C:\PocketCloud" >> "%SHORTCUT_PATH%"
echo start-pocketcloud-windows.bat %USB_DRIVE% >> "%SHORTCUT_PATH%"

echo Desktop shortcut created: Start PocketCloud.bat ✓

REM Create desktop shortcut for opening PocketCloud in browser
set BROWSER_SHORTCUT=%DESKTOP%\Open PocketCloud.url

echo [InternetShortcut] > "%BROWSER_SHORTCUT%"
echo URL=http://localhost:3000 >> "%BROWSER_SHORTCUT%"

echo Browser shortcut created: Open PocketCloud.url ✓

echo.
echo ========================================================================
echo Step 9: Windows Firewall Configuration
echo ========================================================================

echo Configuring Windows Firewall to allow PocketCloud...

REM Add firewall rule for Node.js
netsh advfirewall firewall add rule name="PocketCloud Node.js" dir=in action=allow program="%ProgramFiles%\nodejs\node.exe" enable=yes

REM Add firewall rule for port 3000
netsh advfirewall firewall add rule name="PocketCloud Port 3000" dir=in action=allow protocol=TCP localport=3000

echo Windows Firewall configured ✓

echo.
echo ========================================================================
echo Step 10: Starting PocketCloud
echo ========================================================================

echo Starting PocketCloud for the first time...
echo.
echo Storage location: %STORAGE_PATH%
echo Web interface: http://localhost:3000
echo.

REM Set environment variables
set STORAGE_PATH=%STORAGE_PATH%
set NODE_ENV=production
set PORT=3000

REM Start PocketCloud
echo PocketCloud is starting...
echo.
echo ========================================================================
echo                        SETUP COMPLETE!
echo ========================================================================
echo.
echo ✓ Node.js installed and configured
echo ✓ Git installed and configured  
echo ✓ PocketCloud downloaded and installed
echo ✓ Dependencies installed
echo ✓ USB drive formatted and configured
echo ✓ Desktop shortcuts created
echo ✓ Windows Firewall configured
echo ✓ PocketCloud ready to start
echo.
echo NEXT STEPS:
echo.
echo 1. PocketCloud will start automatically in a few seconds
echo 2. Open your web browser to: http://localhost:3000
echo 3. Create your account (choose a strong password!)
echo 4. Start uploading your files
echo.
echo DAILY USAGE:
echo - Double-click "Start PocketCloud.bat" on your desktop
echo - Or run: start-pocketcloud-windows.bat %USB_DRIVE%
echo.
echo ACCESS FROM OTHER DEVICES:
echo - Connect devices to same Wi-Fi network
echo - Find your IP: ipconfig
echo - Open browser to: http://[YOUR_IP]:3000
echo.
echo IMPORTANT REMINDERS:
echo - Keep your USB drive connected when using PocketCloud
echo - Remember your password (no recovery option!)
echo - Make regular backups of your USB drive
echo - Your files are encrypted and stored on: %USB_DRIVE%
echo.
echo ========================================================================

REM Clean up temp files
if exist "%TEMP%\pocketcloud-setup" rmdir /s /q "%TEMP%\pocketcloud-setup"

echo.
echo Starting PocketCloud in 5 seconds...
timeout /t 5 /nobreak >nul

REM Start PocketCloud
cd backend
start "PocketCloud Server" node server-windows.js

REM Wait a moment for server to start
timeout /t 3 /nobreak >nul

REM Open browser
start http://localhost:3000

echo.
echo PocketCloud is now running!
echo.
echo - Server window: Check the "PocketCloud Server" window for status
echo - Web interface: Should open automatically in your browser
echo - To stop: Close the "PocketCloud Server" window or press Ctrl+C
echo.
echo Enjoy your personal cloud storage!
echo.
pause

goto :eof

REM Function to refresh PATH environment variable
:RefreshPath
for /f "usebackq tokens=2,*" %%A in (`reg query HKCU\Environment /v PATH`) do set PATH=%%B
for /f "usebackq tokens=2,*" %%A in (`reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH`) do set PATH=!PATH!;%%B
goto :eof