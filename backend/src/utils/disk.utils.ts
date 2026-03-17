import fs from 'fs';
import { AppError } from './errors';

const STORAGE_PATH = process.env.STORAGE_PATH ?? '/mnt/pocketcloud';
const WARNING_THRESHOLD = 0.90;   // Warn at 90% full
const CRITICAL_THRESHOLD = 0.95;  // Block uploads at 95% full
const MINIMUM_FREE_BYTES = 1073741824; // Always keep 1GB free

export interface DiskStatus {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  percentUsed: number;
  isWarning: boolean;
  isCritical: boolean;
}

export function getDiskStatus(): DiskStatus {
  const stats = fs.statfsSync(STORAGE_PATH);
  const totalBytes = stats.blocks * stats.bsize;
  const freeBytes = stats.bfree * stats.bsize;
  const usedBytes = totalBytes - freeBytes;
  const percentUsed = usedBytes / totalBytes;

  return {
    totalBytes,
    usedBytes,
    freeBytes,
    percentUsed,
    isWarning: percentUsed >= WARNING_THRESHOLD,
    isCritical: percentUsed >= CRITICAL_THRESHOLD
  };
}

export function assertSufficientSpace(requiredBytes: number): void {
  const disk = getDiskStatus();

  if (disk.isCritical) {
    throw new AppError(
      'STORAGE_FULL',
      `Storage is critically low (${Math.round(disk.percentUsed * 100)}% full). ` +
      `Free up space before uploading.`,
      507
    );
  }

  const safeAvailable = disk.freeBytes - MINIMUM_FREE_BYTES;
  
  if (requiredBytes > safeAvailable) {
    throw new AppError(
      'INSUFFICIENT_SPACE',
      `Not enough storage. Need ${formatBytes(requiredBytes)}, ` +
      `only ${formatBytes(safeAvailable)} safely available.`,
      507
    );
  }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(2)} KB`;
  return `${bytes} B`;
}
