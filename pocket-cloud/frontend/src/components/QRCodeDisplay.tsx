import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface QRCodeDisplayProps {
  url: string;
  title?: string;
  description?: string;
  size?: number;
  className?: string;
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  url,
  title = "Share this page",
  description = "Scan with your device's camera",
  size = 200,
  className = ""
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'PocketCloud Download Page',
          text: 'Download PocketCloud clients for any device',
          url: url
        });
      } catch (error) {
        console.error('Failed to share:', error);
      }
    } else {
      // Fallback to copy
      handleCopyUrl();
    }
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 ${className}`}>
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {title}
        </h3>
        
        {/* QR Code */}
        <div className="bg-white p-4 rounded-xl inline-block mb-4 shadow-inner">
          <QRCodeSVG
            value={url}
            size={size}
            level="M"
            includeMargin={true}
            bgColor="#ffffff"
            fgColor="#000000"
          />
        </div>
        
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {description}
        </p>
        
        {/* URL Display */}
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-4">
          <code className="text-sm text-gray-800 dark:text-gray-200 break-all">
            {url}
          </code>
        </div>
        
        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            onClick={handleCopyUrl}
            className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy URL
              </>
            )}
          </button>
          
          {navigator.share && (
            <button
              onClick={handleShare}
              className="inline-flex items-center justify-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
              </svg>
              Share
            </button>
          )}
        </div>
        
        {/* Additional Info */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Works with any QR code scanner or camera app
          </p>
        </div>
      </div>
    </div>
  );
};

// Utility component for inline QR codes
export const InlineQRCode: React.FC<{ url: string; size?: number }> = ({ 
  url, 
  size = 100 
}) => {
  return (
    <div className="inline-block bg-white p-2 rounded-lg shadow-sm">
      <QRCodeSVG
        value={url}
        size={size}
        level="M"
        includeMargin={false}
        bgColor="#ffffff"
        fgColor="#000000"
      />
    </div>
  );
};