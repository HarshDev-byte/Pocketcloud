import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface OSInfo {
  name: string;
  icon: string;
  detected: boolean;
  downloads: Array<{
    name: string;
    description: string;
    url: string;
    size?: string;
    version?: string;
  }>;
  instructions?: string;
}

interface ClientVersions {
  [key: string]: {
    version: string;
    size: number;
    sha256: string;
  };
}

export const GetClientPage: React.FC = () => {
  const [detectedOS, setDetectedOS] = useState<string>('');
  const [versions, setVersions] = useState<ClientVersions>({});
  const [showQR, setShowQR] = useState(false);

  // Detect user's operating system
  useEffect(() => {
    const detectOS = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const platform = navigator.platform.toLowerCase();

      if (/iphone|ipad|ipod/.test(userAgent)) {
        return 'ios';
      } else if (/android/.test(userAgent)) {
        return 'android';
      } else if (/mac/.test(platform) || /darwin/.test(userAgent)) {
        return 'macos';
      } else if (/win/.test(platform) || /windows/.test(userAgent)) {
        return 'windows';
      } else if (/linux/.test(platform) || /x11/.test(userAgent)) {
        return 'linux';
      }
      return 'unknown';
    };

    setDetectedOS(detectOS());
  }, []);

  // Fetch version information
  useEffect(() => {
    fetch('/downloads/info')
      .then(res => res.json())
      .then(data => setVersions(data))
      .catch(err => console.error('Failed to fetch version info:', err));
  }, []);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const osData: Record<string, OSInfo> = {
    macos: {
      name: 'macOS',
      icon: '🍎',
      detected: detectedOS === 'macos',
      downloads: [
        {
          name: 'PocketCloud for macOS',
          description: 'Menu bar app with auto-sync',
          url: '/downloads/mac-arm64.dmg',
          size: versions['mac-arm64'] ? formatFileSize(versions['mac-arm64'].size) : 'Unknown',
          version: versions['mac-arm64']?.version || '1.0.0'
        }
      ]
    },
    windows: {
      name: 'Windows',
      icon: '🪟',
      detected: detectedOS === 'windows',
      downloads: [
        {
          name: 'PocketCloud for Windows',
          description: 'System tray app with WebDAV mounting',
          url: '/downloads/win-x64-setup.exe',
          size: versions['win-x64'] ? formatFileSize(versions['win-x64'].size) : 'Unknown',
          version: versions['win-x64']?.version || '1.0.0'
        }
      ]
    },
    linux: {
      name: 'Linux',
      icon: '🐧',
      detected: detectedOS === 'linux',
      downloads: [
        {
          name: 'PocketCloud CLI + GTK App',
          description: 'Command line tool and system tray app',
          url: '/downloads/linux-x64.tar.gz',
          size: versions['linux-x64'] ? formatFileSize(versions['linux-x64'].size) : 'Unknown',
          version: versions['linux-x64']?.version || '1.0.0'
        },
        {
          name: 'Quick Install (One-line)',
          description: 'Automatic installation script',
          url: '/downloads/install.sh',
          size: '< 1 KB',
          version: 'Latest'
        }
      ]
    },
    ios: {
      name: 'iOS',
      icon: '📱',
      detected: detectedOS === 'ios',
      downloads: [],
      instructions: 'Install via Safari PWA'
    },
    android: {
      name: 'Android',
      icon: '🤖',
      detected: detectedOS === 'android',
      downloads: [],
      instructions: 'Install via Chrome PWA'
    }
  };

  const handleDownload = (url: string, filename: string) => {
    // Create a temporary link to trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const currentUrl = window.location.origin + '/get';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-purple-600/10"></div>
        <div className="relative max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
              Connect from
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"> any device</span>
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-8">
              Download the PocketCloud client for your device, served directly from your Pocket Cloud Drive.
              <span className="block mt-2 text-lg font-medium text-blue-600 dark:text-blue-400">
                Zero internet required.
              </span>
            </p>
            
            {/* Quick Stats */}
            <div className="flex justify-center space-x-8 text-sm text-gray-500 dark:text-gray-400 mb-12">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                Offline-first
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                Cross-platform
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-purple-500 rounded-full mr-2"></div>
                Self-hosted
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Download Cards */}
      <div className="max-w-7xl mx-auto px-4 pb-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {Object.entries(osData).map(([key, os]) => (
            <div
              key={key}
              className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden ${
                os.detected ? 'ring-2 ring-blue-500 ring-opacity-50 transform scale-105' : ''
              }`}
            >
              {/* Recommended Badge */}
              {os.detected && (
                <div className="absolute top-4 right-4 z-10">
                  <span className="bg-gradient-to-r from-blue-500 to-purple-500 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-lg">
                    Recommended for you
                  </span>
                </div>
              )}

              <div className="p-6">
                {/* OS Header */}
                <div className="flex items-center mb-4">
                  <span className="text-4xl mr-3">{os.icon}</span>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                      {os.name}
                    </h3>
                    {key === 'macos' && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">Apple Silicon & Intel</p>
                    )}
                    {key === 'windows' && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">x64 installer</p>
                    )}
                    {key === 'linux' && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">Ubuntu / Kali / Debian</p>
                    )}
                  </div>
                </div>

                {/* Downloads or Instructions */}
                {os.downloads.length > 0 ? (
                  <div className="space-y-3">
                    {os.downloads.map((download, index) => (
                      <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-semibold text-gray-900 dark:text-white text-sm">
                            {download.name}
                          </h4>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            v{download.version}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                          {download.description}
                        </p>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {download.size}
                          </span>
                          <button
                            onClick={() => handleDownload(download.url, download.name)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200"
                          >
                            Download
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-6xl mb-4">{os.icon}</div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                      {os.instructions}
                    </h4>
                    <button
                      onClick={() => window.location.href = '/connect'}
                      className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white px-6 py-3 rounded-lg font-medium transition-all duration-200 transform hover:scale-105"
                    >
                      View Instructions
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Web Interface Link */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center bg-white dark:bg-gray-800 rounded-full px-6 py-3 shadow-lg">
            <span className="text-gray-600 dark:text-gray-300 mr-3">
              Or just use the web interface
            </span>
            <a
              href="/files"
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium flex items-center"
            >
              Open Web App
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>

        {/* QR Code Section */}
        <div className="text-center">
          <button
            onClick={() => setShowQR(!showQR)}
            className="inline-flex items-center text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors duration-200"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
            </svg>
            Share this page with other devices
          </button>

          {showQR && (
            <div className="mt-6 inline-block bg-white p-6 rounded-2xl shadow-lg">
              <QRCodeSVG
                value={currentUrl}
                size={200}
                level="M"
                includeMargin={true}
              />
              <p className="text-sm text-gray-600 mt-3">
                Scan to open download page
              </p>
              <p className="text-xs text-gray-500 mt-1 font-mono">
                {currentUrl}
              </p>
            </div>
          )}
        </div>

        {/* Additional Info */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
            <div className="text-3xl mb-3">🔒</div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Private & Secure</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Your files never leave your device. Everything runs locally on your Raspberry Pi.
            </p>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
            <div className="text-3xl mb-3">⚡</div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Lightning Fast</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Direct WiFi connection means blazing fast file transfers without internet bottlenecks.
            </p>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
            <div className="text-3xl mb-3">🌐</div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Works Everywhere</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Native apps for every platform, plus a powerful web interface that works on any device.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};