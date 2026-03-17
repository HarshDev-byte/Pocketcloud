import fileType from 'file-type';
import { logger } from './logger';

export async function detectMimeType(filePath: string): Promise<string> {
  try {
    const result = await fileType.fromFile(filePath);
    return result?.mime ?? 'application/octet-stream';
  } catch {
    return 'application/octet-stream';
  }
}

export function isMimeTypeTrusted(declaredMime: string, actualMime: string): boolean {
  // Allow if exact match
  if (declaredMime === actualMime) return true;

  // Allow text/* files (text/plain vs text/markdown etc)
  if (declaredMime.startsWith('text/') && actualMime.startsWith('text/')) {
    return true;
  }

  // Allow application/octet-stream as declared (generic binary)
  if (declaredMime === 'application/octet-stream') return true;

  // Log mismatch but don't always block (some clients are wrong about mime)
  logger.warn('MIME type mismatch', { declaredMime, actualMime });

  // BLOCK if declared as image/document but actual is executable
  const dangerousMimes = [
    'application/x-executable',
    'application/x-msdownload',
    'application/x-sh',
    'application/x-mach-binary',
    'application/x-elf'
  ];

  if (dangerousMimes.includes(actualMime)) {
    logger.error('Dangerous MIME type detected', { declaredMime, actualMime });
    return false;
  }

  return true; // Warn but allow minor mismatches
}
