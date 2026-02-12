@echo off
echo ========================================================================
echo                    Testing PocketCloud Setup
echo ========================================================================

REM Navigate to the correct directory
cd /d "C:\PocketCloud"

echo Current directory: %CD%
echo.

echo Checking file structure...
if exist "backend\package.json" (
    echo ✓ backend\package.json found
) else (
    echo ✗ backend\package.json NOT found
)

if exist "backend\server.js" (
    echo ✓ backend\server.js found
) else (
    echo ✗ backend\server.js NOT found
)

if exist "backend\src\config\config.js" (
    echo ✓ backend\src\config\config.js found
) else (
    echo ✗ backend\src\config\config.js NOT found
)

if exist "backend\src\config\database.js" (
    echo ✓ backend\src\config\database.js found
) else (
    echo ✗ backend\src\config\database.js NOT found
)

if exist "backend\node_modules" (
    echo ✓ backend\node_modules found
) else (
    echo ✗ backend\node_modules NOT found - need to run npm install
)

echo.
echo Testing Node.js and npm...
node -v
npm -v

echo.
echo Testing basic server startup (without starting full server)...
cd backend
node -e "console.log('Node.js working'); console.log('Current dir:', process.cwd()); try { require('./src/config/config'); console.log('✓ Config loaded'); } catch(e) { console.log('✗ Config error:', e.message); }"

echo.
echo Test complete!
pause