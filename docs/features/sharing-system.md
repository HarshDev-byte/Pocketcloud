# File and Folder Sharing System

Pocket Cloud Drive includes a comprehensive sharing system that allows users to create shareable links for files and folders accessible to other devices on the local network, with optional password protection and expiry settings.

## Features

### Share Creation
- **Shareable Links**: Generate cryptographically secure tokens (32-character hex strings)
- **Expiry Options**: 1 hour, 1 day, 1 week, 1 month, never, or custom duration
- **Password Protection**: Optional password protection with bcrypt hashing
- **Download Limits**: Optional maximum download count restrictions
- **QR Codes**: Automatic QR code generation for easy mobile access

### Security Features
- **Cryptographically Secure Tokens**: 16-byte random tokens (32 hex chars)
- **Timing-Safe Password Comparison**: Uses bcrypt for secure password verification
- **Rate Limiting**: 30 requests per minute per IP for public endpoints
- **Access Tokens**: Short-lived tokens (15 minutes) for password-protected shares
- **User Limits**: Maximum 50 active shares per user

### Share Management
- **Active Share Listing**: View all active shares with metadata
- **Share Revocation**: Instantly revoke share links
- **Download Tracking**: Monitor download counts and usage
- **Automatic Cleanup**: Expired shares cleaned up daily

## Architecture

### Backend Components

1. **ShareService** (`backend/src/services/share.service.ts`)
   - Core sharing logic and validation
   - Token generation and management
   - Password protection and access tokens
   - Share lifecycle management

2. **Share Routes** (`backend/src/routes/share.routes.ts`)
   - **Authenticated Routes** (file owners):
     - `POST /api/shares` - Create new share
     - `GET /api/shares` - List user's shares
     - `DELETE /api/shares/:id` - Revoke share
   - **Public Routes** (no authentication):
     - `GET /s/:token` - Share page HTML
     - `POST /s/:token/auth` - Password authentication
     - `GET /s/:token/download` - File download
     - `GET /s/:token/info` - Share metadata
     - `GET /s/:token/contents` - Folder contents

3. **Share Page** (`backend/src/pages/share.page.html`)
   - Self-contained HTML page (no React dependencies)
   - Works without JavaScript (progressive enhancement)
   - Mobile-friendly responsive design
   - Password input and file download functionality

4. **Database Schema** (`backend/src/db/migrations/003_shares.sql`)
   - Shares table with proper constraints and indexes
   - Foreign key relationships to users, files, and folders
   - Optimized for token lookups and cleanup operations

### Frontend Components

1. **ShareDialog** (`frontend/src/components/ShareDialog.tsx`)
   - Modal dialog for share creation and management
   - Expiry, password, and download limit configuration
   - Active share listing with revoke functionality
   - QR code display for easy mobile access

2. **QRCodeDisplay** (`frontend/src/components/QRCodeDisplay.tsx`)
   - SVG-based QR code generation
   - 200×200 pixel size with quiet zone
   - Works on all devices without canvas dependencies

3. **FileBrowser Integration**
   - Share option in file/folder context menus
   - Seamless integration with existing file management

## Usage Examples

### Creating a Share

```typescript
// From ShareDialog component
const shareData = {
  fileId: 'file-uuid',
  expiresInHours: 24,
  password: 'optional-password',
  maxDownloads: 10
};

const response = await apiClient.post('/shares', shareData);
// Returns: { success: true, shareUrl: 'http://192.168.4.1/s/abc123...' }
```

### Accessing a Share

1. **Visit Share URL**: `http://192.168.4.1/s/abc123...`
2. **Enter Password** (if required): Submit password form
3. **Download File**: Click download button or browse folder contents

### Share Management

```typescript
// List user's shares
const shares = await apiClient.get('/shares');

// Revoke a share
await apiClient.delete(`/shares/${shareId}`);
```

## Security Considerations

### Token Security
- Tokens are generated using `crypto.randomBytes(16)` for cryptographic security
- 32-character hex strings provide 2^128 possible combinations
- Tokens are single-use context and don't reveal file paths

### Password Protection
- Passwords hashed using bcrypt with salt rounds of 10
- Timing-safe comparison using `bcrypt.compareSync()`
- Short-lived access tokens (15 minutes) for authenticated sessions

### Rate Limiting
- Public endpoints limited to 30 requests per minute per IP
- Prevents brute force attacks on password-protected shares
- Configurable via express-rate-limit middleware

### Access Control
- Share ownership verified before creation/modification
- File/folder existence and ownership checked
- Deleted files/folders automatically invalidate shares

## Share Page Features

### Progressive Enhancement
- Works without JavaScript enabled
- Enhanced functionality with JavaScript
- Mobile-responsive design
- Accessibility compliant

### File Type Support
- **Files**: Direct download with proper MIME types
- **Folders**: Browsable file listing (download individual files)
- **Media Files**: Appropriate icons and metadata display

### User Experience
- **Expiry Countdown**: Shows time remaining before expiration
- **Download Progress**: Visual feedback during downloads
- **Error Handling**: Clear error messages for expired/invalid shares
- **Mobile Friendly**: Touch-optimized interface

## Configuration

### Environment Variables
- `STORAGE_PATH`: Base path for file storage
- `JWT_SECRET`: Used for access token generation

### Share Limits
- Maximum 50 active shares per user
- Maximum 4KB message size for WebSocket events
- 15-minute access token lifetime for password-protected shares

### Cleanup Schedule
- Expired shares cleaned daily via cleanup job
- Automatic removal from database
- No manual intervention required

## API Reference

### Create Share
```http
POST /api/shares
Content-Type: application/json
Authorization: Bearer <jwt-token>

{
  "fileId": "uuid",
  "expiresInHours": 24,
  "password": "optional",
  "maxDownloads": 10
}
```

### Access Share
```http
GET /s/{token}
```

### Download File
```http
GET /s/{token}/download?access_token={token}
```

The sharing system provides a secure, user-friendly way to share files and folders locally while maintaining proper access controls and security measures appropriate for a Raspberry Pi-based personal cloud storage solution.