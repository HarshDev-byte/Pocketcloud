#!/usr/bin/env python3
"""
PocketCloud Drive GTK4 System Tray Application
For Ubuntu 20.04+, Kali Linux 2023+, Debian 11+

Features:
- AppIndicator3 tray icon (GNOME compatible)
- Native GNOME notifications (libnotify)
- WebDAV mounting via davfs2
- File upload dialogs
- Auto-discovery and connection management
"""

import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Adw', '1')
gi.require_version('AppIndicator3', '0.1')
gi.require_version('Notify', '0.7')

from gi.repository import Gtk, Adw, AppIndicator3, GLib, Gio, Notify
import subprocess
import json
import os
import sys
import threading
import time
import requests
from pathlib import Path

class PocketCloudTray:
    def __init__(self):
        self.app = Adw.Application(application_id='com.pocketcloud.tray')
        self.app.connect('activate', self.on_activate)
        
        # Initialize notification system
        Notify.init("PocketCloud Drive")
        
        # Configuration
        self.config_dir = Path.home() / '.config' / 'pocketcloud'
        self.config_file = self.config_dir / 'config.json'
        self.config_dir.mkdir(parents=True, exist_ok=True)
        
        # State
        self.connected = False
        self.mounted = False
        self.mount_point = Path.home() / 'pocketcloud'
        self.device_info = {}
        
        # Load configuration
        self.load_config()
        
        # Create tray indicator
        self.create_indicator()
        
        # Start background tasks
        self.start_background_tasks()

    def load_config(self):
        """Load configuration from JSON file"""
        try:
            if self.config_file.exists():
                with open(self.config_file, 'r') as f:
                    self.config = json.load(f)
            else:
                self.config = {
                    'host': 'pocketcloud.local',
                    'ip': '192.168.4.1',
                    'port': 3000,
                    'username': 'admin',
                    'token': None,
                    'auto_mount': True,
                    'notifications': True
                }
                self.save_config()
        except Exception as e:
            print(f"Error loading config: {e}")
            self.config = {}

    def save_config(self):
        """Save configuration to JSON file"""
        try:
            with open(self.config_file, 'w') as f:
                json.dump(self.config, f, indent=2)
        except Exception as e:
            print(f"Error saving config: {e}")

    def create_indicator(self):
        """Create system tray indicator"""
        self.indicator = AppIndicator3.Indicator.new(
            "pocketcloud-drive",
            "network-server",  # Default icon
            AppIndicator3.IndicatorCategory.APPLICATION_STATUS
        )
        
        self.indicator.set_status(AppIndicator3.IndicatorStatus.ACTIVE)
        self.indicator.set_title("PocketCloud Drive")
        
        # Create menu
        self.create_menu()
        
        # Update icon based on connection status
        self.update_indicator_icon()

    def create_menu(self):
        """Create context menu for tray icon"""
        menu = Gtk.Menu()
        
        # Status item
        self.status_item = Gtk.MenuItem(label="Disconnected")
        self.status_item.set_sensitive(False)
        menu.append(self.status_item)
        
        menu.append(Gtk.SeparatorMenuItem())
        
        # Open in browser
        browser_item = Gtk.MenuItem(label="Open in Browser")
        browser_item.connect("activate", self.on_open_browser)
        menu.append(browser_item)
        
        # Open mount point
        self.mount_item = Gtk.MenuItem(label="Open Files")
        self.mount_item.connect("activate", self.on_open_mount)
        menu.append(self.mount_item)
        
        menu.append(Gtk.SeparatorMenuItem())
        
        # Upload files
        upload_item = Gtk.MenuItem(label="Upload Files...")
        upload_item.connect("activate", self.on_upload_files)
        menu.append(upload_item)
        
        # Upload folder
        upload_folder_item = Gtk.MenuItem(label="Upload Folder...")
        upload_folder_item.connect("activate", self.on_upload_folder)
        menu.append(upload_folder_item)
        
        menu.append(Gtk.SeparatorMenuItem())
        
        # Mount/Unmount
        self.mount_toggle_item = Gtk.MenuItem(label="Mount WebDAV")
        self.mount_toggle_item.connect("activate", self.on_toggle_mount)
        menu.append(self.mount_toggle_item)
        
        # Sync folder
        sync_item = Gtk.MenuItem(label="Sync Folder...")
        sync_item.connect("activate", self.on_sync_folder)
        menu.append(sync_item)
        
        menu.append(Gtk.SeparatorMenuItem())
        
        # Settings
        settings_item = Gtk.MenuItem(label="Settings...")
        settings_item.connect("activate", self.on_show_settings)
        menu.append(settings_item)
        
        # About
        about_item = Gtk.MenuItem(label="About")
        about_item.connect("activate", self.on_show_about)
        menu.append(about_item)
        
        menu.append(Gtk.SeparatorMenuItem())
        
        # Quit
        quit_item = Gtk.MenuItem(label="Quit")
        quit_item.connect("activate", self.on_quit)
        menu.append(quit_item)
        
        menu.show_all()
        self.indicator.set_menu(menu)

    def update_indicator_icon(self):
        """Update tray icon based on connection status"""
        if self.connected:
            if self.mounted:
                icon = "folder-remote"
            else:
                icon = "network-server"
        else:
            icon = "network-offline"
        
        self.indicator.set_icon_full(icon, "PocketCloud Drive")

    def update_status_display(self):
        """Update status item in menu"""
        if self.connected:
            if self.device_info:
                storage = self.device_info.get('storage', {})
                if storage:
                    free_gb = round(storage.get('free', 0) / (1024**3))
                    status = f"Connected • {free_gb}GB free"
                else:
                    status = "Connected"
            else:
                status = "Connected"
        else:
            status = "Disconnected"
        
        self.status_item.set_label(status)
        
        # Update mount toggle item
        if self.mounted:
            self.mount_toggle_item.set_label("Unmount WebDAV")
        else:
            self.mount_toggle_item.set_label("Mount WebDAV")

    def start_background_tasks(self):
        """Start background monitoring tasks"""
        # Check connection every 30 seconds
        GLib.timeout_add_seconds(30, self.check_connection)
        
        # Initial connection check
        GLib.timeout_add_seconds(2, self.check_connection)

    def check_connection(self):
        """Check connection to PocketCloud device"""
        def _check():
            try:
                host = self.config.get('host', 'pocketcloud.local')
                port = self.config.get('port', 3000)
                url = f"http://{host}:{port}/api/health"
                
                response = requests.get(url, timeout=5)
                if response.status_code == 200:
                    data = response.json()
                    
                    GLib.idle_add(self._on_connection_success, data)
                else:
                    GLib.idle_add(self._on_connection_failed)
                    
            except Exception as e:
                GLib.idle_add(self._on_connection_failed)
        
        # Run in background thread
        threading.Thread(target=_check, daemon=True).start()
        return True  # Continue periodic checks

    def _on_connection_success(self, device_info):
        """Handle successful connection"""
        was_connected = self.connected
        self.connected = True
        self.device_info = device_info
        
        if not was_connected:
            self.show_notification(
                "PocketCloud Connected",
                "Successfully connected to your PocketCloud device"
            )
        
        self.update_indicator_icon()
        self.update_status_display()
        
        # Auto-mount if enabled
        if self.config.get('auto_mount', True) and not self.mounted:
            self.mount_webdav()

    def _on_connection_failed(self):
        """Handle connection failure"""
        was_connected = self.connected
        self.connected = False
        self.device_info = {}
        
        if was_connected:
            self.show_notification(
                "PocketCloud Disconnected",
                "Lost connection to PocketCloud device"
            )
        
        self.update_indicator_icon()
        self.update_status_display()

    def show_notification(self, title, message, icon="dialog-information"):
        """Show desktop notification"""
        if not self.config.get('notifications', True):
            return
        
        try:
            notification = Notify.Notification.new(title, message, icon)
            notification.show()
        except Exception as e:
            print(f"Notification error: {e}")

    def mount_webdav(self):
        """Mount WebDAV using davfs2"""
        try:
            # Ensure mount point exists
            self.mount_point.mkdir(parents=True, exist_ok=True)
            
            # Check if already mounted
            result = subprocess.run(['mountpoint', str(self.mount_point)], 
                                  capture_output=True, text=True)
            if result.returncode == 0:
                self.mounted = True
                self.update_indicator_icon()
                self.update_status_display()
                return
            
            # Mount WebDAV
            host = self.config.get('host', 'pocketcloud.local')
            port = self.config.get('port', 3000)
            webdav_url = f"http://{host}:{port}/webdav"
            
            # Use mount command with davfs2
            cmd = [
                'mount', '-t', 'davfs',
                webdav_url,
                str(self.mount_point)
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                self.mounted = True
                self.show_notification(
                    "WebDAV Mounted",
                    f"PocketCloud mounted at {self.mount_point}"
                )
            else:
                self.show_notification(
                    "Mount Failed",
                    f"Failed to mount WebDAV: {result.stderr}",
                    "dialog-error"
                )
            
            self.update_indicator_icon()
            self.update_status_display()
            
        except Exception as e:
            self.show_notification(
                "Mount Error",
                f"Error mounting WebDAV: {e}",
                "dialog-error"
            )

    def unmount_webdav(self):
        """Unmount WebDAV"""
        try:
            result = subprocess.run(['umount', str(self.mount_point)], 
                                  capture_output=True, text=True)
            
            if result.returncode == 0:
                self.mounted = False
                self.show_notification(
                    "WebDAV Unmounted",
                    "PocketCloud has been unmounted"
                )
            else:
                self.show_notification(
                    "Unmount Failed",
                    f"Failed to unmount: {result.stderr}",
                    "dialog-error"
                )
            
            self.update_indicator_icon()
            self.update_status_display()
            
        except Exception as e:
            self.show_notification(
                "Unmount Error",
                f"Error unmounting: {e}",
                "dialog-error"
            )

    # Event handlers
    def on_activate(self, app):
        """Application activated"""
        pass

    def on_open_browser(self, item):
        """Open PocketCloud in web browser"""
        host = self.config.get('host', 'pocketcloud.local')
        port = self.config.get('port', 3000)
        url = f"http://{host}:{port}"
        
        subprocess.run(['xdg-open', url])

    def on_open_mount(self, item):
        """Open mount point in file manager"""
        if self.mounted:
            subprocess.run(['xdg-open', str(self.mount_point)])
        else:
            # Try to open config directory
            subprocess.run(['xdg-open', str(self.config_dir)])

    def on_upload_files(self, item):
        """Show file upload dialog"""
        dialog = Gtk.FileChooserDialog(
            title="Upload Files to PocketCloud",
            action=Gtk.FileChooserAction.OPEN,
            select_multiple=True
        )
        dialog.add_buttons(
            "Cancel", Gtk.ResponseType.CANCEL,
            "Upload", Gtk.ResponseType.OK
        )
        
        response = dialog.run()
        if response == Gtk.ResponseType.OK:
            files = dialog.get_filenames()
            self.upload_files(files)
        
        dialog.destroy()

    def on_upload_folder(self, item):
        """Show folder upload dialog"""
        dialog = Gtk.FileChooserDialog(
            title="Upload Folder to PocketCloud",
            action=Gtk.FileChooserAction.SELECT_FOLDER
        )
        dialog.add_buttons(
            "Cancel", Gtk.ResponseType.CANCEL,
            "Upload", Gtk.ResponseType.OK
        )
        
        response = dialog.run()
        if response == Gtk.ResponseType.OK:
            folder = dialog.get_filename()
            self.upload_folder(folder)
        
        dialog.destroy()

    def on_toggle_mount(self, item):
        """Toggle WebDAV mount"""
        if self.mounted:
            self.unmount_webdav()
        else:
            self.mount_webdav()

    def on_sync_folder(self, item):
        """Show sync folder dialog"""
        # Implementation for folder sync
        pass

    def on_show_settings(self, item):
        """Show settings window"""
        # Implementation for settings window
        pass

    def on_show_about(self, item):
        """Show about dialog"""
        about = Gtk.AboutDialog()
        about.set_program_name("PocketCloud Drive")
        about.set_version("1.0.0")
        about.set_comments("Linux client for PocketCloud Drive")
        about.set_website("https://pocketcloud.local")
        about.run()
        about.destroy()

    def on_quit(self, item):
        """Quit application"""
        if self.mounted:
            self.unmount_webdav()
        
        Notify.uninit()
        self.app.quit()

    def upload_files(self, files):
        """Upload files using pcd CLI"""
        def _upload():
            for file_path in files:
                try:
                    result = subprocess.run(['pcd', 'put', file_path], 
                                          capture_output=True, text=True)
                    
                    if result.returncode == 0:
                        GLib.idle_add(
                            self.show_notification,
                            "Upload Complete",
                            f"Uploaded {os.path.basename(file_path)}"
                        )
                    else:
                        GLib.idle_add(
                            self.show_notification,
                            "Upload Failed",
                            f"Failed to upload {os.path.basename(file_path)}",
                            "dialog-error"
                        )
                except Exception as e:
                    GLib.idle_add(
                        self.show_notification,
                        "Upload Error",
                        f"Error uploading {os.path.basename(file_path)}: {e}",
                        "dialog-error"
                    )
        
        threading.Thread(target=_upload, daemon=True).start()

    def upload_folder(self, folder_path):
        """Upload folder using pcd CLI"""
        def _upload():
            try:
                result = subprocess.run(['pcd', 'sync', folder_path], 
                                      capture_output=True, text=True)
                
                if result.returncode == 0:
                    GLib.idle_add(
                        self.show_notification,
                        "Sync Complete",
                        f"Synced {os.path.basename(folder_path)}"
                    )
                else:
                    GLib.idle_add(
                        self.show_notification,
                        "Sync Failed",
                        f"Failed to sync {os.path.basename(folder_path)}",
                        "dialog-error"
                    )
            except Exception as e:
                GLib.idle_add(
                    self.show_notification,
                    "Sync Error",
                    f"Error syncing folder: {e}",
                    "dialog-error"
                )
        
        threading.Thread(target=_upload, daemon=True).start()

    def run(self):
        """Run the application"""
        return self.app.run(sys.argv)

def main():
    app = PocketCloudTray()
    return app.run()

if __name__ == '__main__':
    sys.exit(main())