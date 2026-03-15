import { Router } from 'express';

const router = Router();

// Digital Asset Links for Android App Links
// This allows the PWA to be treated as a trusted web activity
router.get('/assetlinks.json', (req, res) => {
  const packageName = 'com.pocketcloud.drive'; // Would be actual package name if native app existed
  const sha256Fingerprints = [
    // These would be actual SHA256 fingerprints of the app signing certificate
    '14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5'
  ];

  const assetLinks = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: sha256Fingerprints
      }
    },
    {
      relation: ['delegate_permission/common.get_login_creds'],
      target: {
        namespace: 'web',
        site: `https://${req.get('host')}`
      }
    }
  ];

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
  res.json(assetLinks);
});

// Android intent filter configuration
router.get('/android-intent-config', (req, res) => {
  const serverUrl = `${req.protocol}://${req.get('host')}`;
  
  const intentConfig = {
    // Intent filters that would be used in an Android app manifest
    intentFilters: [
      {
        action: 'android.intent.action.SEND',
        category: 'android.intent.category.DEFAULT',
        mimeType: '*/*',
        targetUrl: `${serverUrl}/upload-share`
      },
      {
        action: 'android.intent.action.SEND_MULTIPLE',
        category: 'android.intent.category.DEFAULT',
        mimeType: '*/*',
        targetUrl: `${serverUrl}/upload-share`
      },
      {
        action: 'android.intent.action.VIEW',
        category: ['android.intent.category.DEFAULT', 'android.intent.category.BROWSABLE'],
        scheme: 'https',
        host: req.get('host'),
        pathPrefix: '/share/'
      }
    ],
    // Web Share Target API configuration (already in manifest.json)
    webShareTarget: {
      action: '/upload-share',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        files: [
          {
            name: 'files',
            accept: ['*/*']
          }
        ]
      }
    },
    // File System Access API configuration
    fileSystemAccess: {
      supportedTypes: [
        {
          description: 'All files',
          accept: {
            '*/*': []
          }
        },
        {
          description: 'Images',
          accept: {
            'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
          }
        },
        {
          description: 'Videos',
          accept: {
            'video/*': ['.mp4', '.webm', '.ogg', '.mov', '.avi']
          }
        },
        {
          description: 'Documents',
          accept: {
            'application/pdf': ['.pdf'],
            'text/*': ['.txt', '.md', '.json', '.xml', '.csv'],
            'application/msword': ['.doc'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
          }
        }
      ]
    }
  };

  res.json(intentConfig);
});

export { router as androidAppLinksRoutes };