# PocketCloud Windows Installer Custom Script
# Handles WebDAV registry configuration and Windows integration

!include "MUI2.nsh"
!include "FileFunc.nsh"

# Registry keys for WebDAV HTTP support
!define WEBDAV_REG_KEY "HKLM\SYSTEM\CurrentControlSet\Services\WebClient\Parameters"
!define AUTOSTART_REG_KEY "HKCU\Software\Microsoft\Windows\CurrentVersion\Run"

# Custom page for WebDAV configuration
Var WebDAVConfigDialog
Var WebDAVConfigCheckbox
Var WebDAVConfigLabel

# Function to enable HTTP WebDAV support
Function EnableWebDAVHTTP
  # Check if running as administrator
  UserInfo::GetAccountType
  Pop $0
  ${If} $0 != "Admin"
    MessageBox MB_ICONEXCLAMATION "Administrator privileges required for WebDAV configuration. Some features may not work properly."
    Return
  ${EndIf}

  # Set BasicAuthLevel to 2 (allow HTTP basic auth)
  WriteRegDWORD HKLM "SYSTEM\CurrentControlSet\Services\WebClient\Parameters" "BasicAuthLevel" 2
  
  # Restart WebClient service
  ExecWait 'net stop webclient'
  Sleep 2000
  ExecWait 'net start webclient'
  
  DetailPrint "WebDAV HTTP support enabled"
FunctionEnd

# Function to add Windows shell integration
Function AddShellIntegration
  # Add context menu for files
  WriteRegStr HKCU "Software\Classes\*\shell\PocketCloudUpload" "" "Upload to PocketCloud"
  WriteRegStr HKCU "Software\Classes\*\shell\PocketCloudUpload\command" "" '"$INSTDIR\PocketCloud Drive.exe" --upload-file "%1"'
  
  # Add context menu for folders
  WriteRegStr HKCU "Software\Classes\Directory\shell\PocketCloudUpload" "" "Upload to PocketCloud"
  WriteRegStr HKCU "Software\Classes\Directory\shell\PocketCloudUpload\command" "" '"$INSTDIR\PocketCloud Drive.exe" --upload-folder "%1"'
  
  # Add context menu for directory background
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\PocketCloudUpload" "" "Upload to PocketCloud"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\PocketCloudUpload\command" "" '"$INSTDIR\PocketCloud Drive.exe" --upload-here "%V"'
  
  DetailPrint "Windows shell integration added"
FunctionEnd

# Function to configure auto-start
Function ConfigureAutoStart
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "PocketCloud Drive" '"$INSTDIR\PocketCloud Drive.exe" --minimized'
  DetailPrint "Auto-start configured"
FunctionEnd

# Function to add Windows Defender exclusion
Function AddDefenderExclusion
  # Add sync folder to Windows Defender exclusions
  ExecWait 'powershell.exe -Command "Add-MpPreference -ExclusionPath \"$PROFILE\PocketCloud\""'
  DetailPrint "Windows Defender exclusion added for sync folder"
FunctionEnd

# Custom page for WebDAV configuration
Function WebDAVConfigPage
  !insertmacro MUI_HEADER_TEXT "WebDAV Configuration" "Configure network drive support"
  
  nsDialogs::Create 1018
  Pop $WebDAVConfigDialog
  
  ${If} $WebDAVConfigDialog == error
    Abort
  ${EndIf}
  
  ${NSD_CreateLabel} 0 0 100% 40u "PocketCloud can mount as a network drive in Windows Explorer. This requires enabling HTTP WebDAV support, which needs administrator privileges."
  Pop $WebDAVConfigLabel
  
  ${NSD_CreateCheckBox} 0 50u 100% 12u "Enable WebDAV network drive support (requires admin)"
  Pop $WebDAVConfigCheckbox
  ${NSD_Check} $WebDAVConfigCheckbox
  
  nsDialogs::Show
FunctionEnd

Function WebDAVConfigPageLeave
  ${NSD_GetState} $WebDAVConfigCheckbox $0
  ${If} $0 == 1
    Call EnableWebDAVHTTP
  ${EndIf}
FunctionEnd

# Install section
Section "Main Application" SecMain
  SetOutPath "$INSTDIR"
  
  # Install application files
  File /r "dist\*.*"
  File /r "assets\*.*"
  
  # Create uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  
  # Add to Add/Remove Programs
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PocketCloud" "DisplayName" "PocketCloud Drive"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PocketCloud" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PocketCloud" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PocketCloud" "Publisher" "PocketCloud Team"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PocketCloud" "DisplayVersion" "1.0.0"
  
  # Configure Windows integration
  Call AddShellIntegration
  Call ConfigureAutoStart
  Call AddDefenderExclusion
  
  # Create Start Menu shortcut
  CreateDirectory "$SMPROGRAMS\PocketCloud"
  CreateShortcut "$SMPROGRAMS\PocketCloud\PocketCloud Drive.lnk" "$INSTDIR\PocketCloud Drive.exe"
  CreateShortcut "$SMPROGRAMS\PocketCloud\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  
  # Create Desktop shortcut (optional)
  CreateShortcut "$DESKTOP\PocketCloud Drive.lnk" "$INSTDIR\PocketCloud Drive.exe"
  
  # Create sync folder
  CreateDirectory "$PROFILE\PocketCloud"
  
SectionEnd

# Uninstall section
Section "Uninstall"
  # Remove application files
  RMDir /r "$INSTDIR"
  
  # Remove registry entries
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\PocketCloud"
  DeleteRegKey HKCU "Software\Classes\*\shell\PocketCloudUpload"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\PocketCloudUpload"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\PocketCloudUpload"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "PocketCloud Drive"
  
  # Remove shortcuts
  RMDir /r "$SMPROGRAMS\PocketCloud"
  Delete "$DESKTOP\PocketCloud Drive.lnk"
  
  # Ask about sync folder
  MessageBox MB_YESNO "Do you want to remove the PocketCloud sync folder and all its contents?" IDNO skip_folder
  RMDir /r "$PROFILE\PocketCloud"
  skip_folder:
  
SectionEnd

# Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
Page custom WebDAVConfigPage WebDAVConfigPageLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

# Languages
!insertmacro MUI_LANGUAGE "English"