/**
 * Storage Error Handling Middleware
 * Handles USB drive disconnection gracefully
 */

const usbMountService = require('../services/usbMountService');

/**
 * Middleware to handle storage errors gracefully
 */
function handleStorageError(err, req, res, next) {
  // Check if this is a storage I/O error
  if (err.code === 'EIO' || err.code === 'ENOENT' || err.message.includes('i/o error')) {
    // Check if USB drive is still mounted
    const mountStatus = usbMountService.getMountStatus();
    
    if (!mountStatus.mounted) {
      // USB drive disconnected - show friendly error page
      return res.status(503).render('storage-disconnected', {
        title: 'Storage Disconnected',
        message: 'USB drive has been disconnected',
        action: 'Please reconnect your USB drive and refresh the page'
      });
    }
    
    // USB mounted but still I/O error - show generic storage error
    return res.status(503).render('error', {
      message: 'Storage temporarily unavailable',
      action: 'Please try again in a moment. If the problem persists, check your USB drive connection.'
    });
  }
  
  // Not a storage error, pass to next error handler
  next(err);
}

/**
 * Check storage before processing request
 */
function requireStorage(req, res, next) {
  const mountStatus = usbMountService.getMountStatus();
  
  if (!mountStatus.mounted) {
    return res.status(503).render('storage-disconnected', {
      title: 'Storage Disconnected',
      message: 'USB drive is not connected',
      action: 'Please connect your USB drive and refresh the page'
    });
  }
  
  next();
}

module.exports = {
  handleStorageError,
  requireStorage
};