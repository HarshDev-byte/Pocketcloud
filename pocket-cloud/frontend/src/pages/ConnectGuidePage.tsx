import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface ConnectGuidePageProps {}

type OSTab = 'macos' | 'windows' | 'linux' | 'ios' | 'android';

export const ConnectGuidePage: React.FC<ConnectGuidePageProps> = () => {
  const [selectedOS, setSelectedOS] = useState<OSTab>(() => {
    // Auto-detect OS
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
    return 'macos';
  });

  const serverUrl = window.location.origin;
  const webdavUrl = `${serverUrl}/webdav`;

  const renderMacOSGuide = () => (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
          🍎 macOS Connection Guide
        </h3>
        <p className="text-blue-800 dark:text-blue-200 text-sm">
          Connect your Mac to PocketCloud using WiFi or the native menu bar app.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
            1
          </div>
          <div>
            <h4 className="font-medium">Connect to WiFi</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Connect to WiFi network: <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">PocketCloud-XXXX</code>
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Password: <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">pocketcloud123</code>
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
            2
          </div>
          <div>
            <h4 className="font-medium">Open Safari</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Navigate to: <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">http://pocketcloud.local</code>
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Or use the IP address: <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{serverUrl}</code>
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
            3
          </div>
          <div>
            <h4 className="font-medium">Login</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Enter your PocketCloud credentials to access your files
            </p>
          </div>
        </div>
      </div>

      <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
        <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">
          📱 Download the Menu Bar App
        </h4>
        <p className="text-sm text-green-800 dark:text-green-200 mb-3">
          Get automatic sync and native Finder integration
        </p>
        <a
          href="/get"
          className="inline-flex items-center bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Download for macOS
          <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </a>
      </div>
    </div>
  );

  const renderIOSGuide = () => (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
          📱 iOS Connection Guide
        </h3>
        <p className="text-blue-800 dark:text-blue-200 text-sm">
          Connect your iPhone or iPad to PocketCloud using Safari PWA and Files app.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
            1
          </div>
          <div>
            <h4 className="font-medium">Connect to WiFi</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Connect to network: <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">PocketCloud-XXXX</code>
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
            2
          </div>
          <div>
            <h4 className="font-medium">Tap "Sign in to PocketCloud"</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              iOS will show a notification - tap it to open Safari
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
            3
          </div>
          <div>
            <h4 className="font-medium">Add to Home Screen</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Tap Share button → "Add to Home Screen" for app-like experience
            </p>
          </div>
        </div>
      </div>

      <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
        <h4 className="font-medium text-purple-900 dark:text-purple-100 mb-2">
          📁 Add to Files App
        </h4>
        <p className="text-sm text-purple-800 dark:text-purple-200 mb-3">
          Access PocketCloud files natively in iOS Files app
        </p>
        <div className="space-y-2 text-sm text-purple-700 dark:text-purple-300">
          <div>1. Open Files app → Browse → ••• menu</div>
          <div>2. "Connect to Server"</div>
          <div>3. Enter: <code className="bg-purple-100 dark:bg-purple-800 px-2 py-1 rounded">{webdavUrl}</code></div>
        </div>
      </div>
    </div>
  );

  const osOptions = [
    { key: 'macos' as OSTab, label: '🍎 macOS', component: renderMacOSGuide },
    { key: 'ios' as OSTab, label: '📱 iOS', component: renderIOSGuide }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Connect Your Device
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Step-by-step instructions for connecting to your PocketCloud
          </p>
        </div>

        {/* OS Selector */}
        <div className="flex justify-center mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-1 shadow-sm">
            {osOptions.map((os) => (
              <button
                key={os.key}
                onClick={() => setSelectedOS(os.key)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  selectedOS === os.key
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {os.label}
              </button>
            ))}
          </div>
        </div>

        {/* Guide Content */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          {osOptions.find(os => os.key === selectedOS)?.component()}
        </div>

        {/* QR Code for easy connection */}
        <div className="mt-8 text-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 inline-block">
            <h3 className="font-semibold mb-4">Quick Connect QR Code</h3>
            <QRCodeSVG value={serverUrl} size={200} />
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Scan with your device's camera
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};