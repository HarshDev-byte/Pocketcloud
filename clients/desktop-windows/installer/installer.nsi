# PocketCloud Windows NSIS Installer Script
# Creates a Windows installer with WebDAV support and system integration

!define PRODUCT_NAME "PocketCloud Drive"
!define PRODUCT_VERSION "1.0.0"
!define PRODUCT_PUBLISHER "PocketCloud Team"
!define PRODUCT_WEB_SITE "https://pocketcloud.local"
!define PRODUCT_DIR_REGKEY "Software\Microsoft\Windows\CurrentVersion\App Paths\PocketCloud Drive.exe"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
!define PRODUCT_UNINST_ROOT_KEY "HKLM"

# Installer properties
Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "PocketCloud-Setup-${PRODUCT_VERSION}.exe"
InstallDir "$PROGRAMFILES\PocketCloud"
InstallDirRegKey HKLM "${PRODUCT_DIR_REGKEY}" ""
ShowInstDetails show
ShowUnInstDetails show
RequestExecutionLevel admin
SetCompressor lzma

# Version information
VIProductVersion "1.0.0.0"
VIAddVersionKey "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey "ProductVersion" "${PRODUCT_VERSION}"
VIAddVersionKey "CompanyName" "${PRODUCT_PUBLISHER}"
VIAddVersionKey "FileDescription" "${PRODUCT_NAME} Installer"
VIAddVersionKey "FileVersion" "${PRODUCT_VERSION}"
VIAddVersionKey "LegalCopyright" "© 2024 ${PRODUCT_PUBLISHER}"

# Include the custom installer script
!include "installer.nsh"