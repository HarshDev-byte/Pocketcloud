const path = require('path');

/**
 * Ensures that a target path is within a base directory
 * Prevents path traversal attacks
 * @param {string} baseDir - The base directory that should contain the target
 * @param {string} targetPath - The path to validate
 * @throws {Error} If path traversal is detected
 */
function ensureInside(baseDir, targetPath) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  
  // Use path.relative to check if target is inside base
  const relativePath = path.relative(resolvedBase, resolvedTarget);
  
  // If relative path starts with '..' or is absolute, it's outside base directory
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Path traversal detected');
  }
  
  // Additional check: ensure resolved target actually starts with base path
  if (!resolvedTarget.startsWith(resolvedBase + path.sep) && resolvedTarget !== resolvedBase) {
    throw new Error('Path traversal detected');
  }
}

/**
 * Allowed file types for upload
 * Prevents malicious file uploads
 */
const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed'
];

/**
 * Validates if a file type is allowed
 * @param {string} mimetype - The MIME type to validate
 * @returns {boolean} True if allowed, false otherwise
 */
function isAllowedFileType(mimetype) {
  return ALLOWED_MIME_TYPES.includes(mimetype);
}

module.exports = {
  ensureInside,
  isAllowedFileType,
  ALLOWED_MIME_TYPES
};
