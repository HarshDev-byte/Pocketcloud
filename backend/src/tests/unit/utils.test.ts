import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

describe('Password Hashing', () => {
  it('should hash password with bcrypt', async () => {
    const password = 'mypassword123';
    const hash = await bcrypt.hash(password, 12);
    
    expect(hash).not.toBe(password);
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it('should verify correct password', async () => {
    const password = 'mypassword123';
    const hash = await bcrypt.hash(password, 12);
    
    const isValid = await bcrypt.compare(password, hash);
    expect(isValid).toBe(true);
  });

  it('should reject incorrect password', async () => {
    const password = 'mypassword123';
    const hash = await bcrypt.hash(password, 12);
    
    const isValid = await bcrypt.compare('wrongpassword', hash);
    expect(isValid).toBe(false);
  });
});

describe('Token Generation', () => {
  it('should generate random token', () => {
    const token = crypto.randomBytes(32).toString('hex');
    
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[a-f0-9]+$/);
  });

  it('should hash token with SHA256', () => {
    const rawToken = 'test-token-12345';
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it('should produce consistent hash for same input', () => {
    const rawToken = 'test-token-12345';
    const hash1 = crypto.createHash('sha256').update(rawToken).digest('hex');
    const hash2 = crypto.createHash('sha256').update(rawToken).digest('hex');
    
    expect(hash1).toBe(hash2);
  });

  it('should produce different hash for different input', () => {
    const hash1 = crypto.createHash('sha256').update('token1').digest('hex');
    const hash2 = crypto.createHash('sha256').update('token2').digest('hex');
    
    expect(hash1).not.toBe(hash2);
  });
});

describe('Byte Formatting', () => {
  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  it('should format 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('should format bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(2621440)).toBe('2.5 MB');
  });

  it('should format gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1 GB');
    expect(formatBytes(5368709120)).toBe('5 GB');
  });
});

describe('Quota Calculations', () => {
  it('should calculate percentage used', () => {
    const used = 3000;
    const quota = 10000;
    const percentUsed = (used / quota) * 100;
    
    expect(percentUsed).toBe(30);
  });

  it('should handle 100% usage', () => {
    const used = 10000;
    const quota = 10000;
    const percentUsed = Math.min(100, (used / quota) * 100);
    
    expect(percentUsed).toBe(100);
  });

  it('should cap at 100% for over-quota', () => {
    const used = 12000;
    const quota = 10000;
    const percentUsed = Math.min(100, (used / quota) * 100);
    
    expect(percentUsed).toBe(100);
  });

  it('should calculate free space', () => {
    const used = 3000;
    const quota = 10000;
    const free = Math.max(0, quota - used);
    
    expect(free).toBe(7000);
  });

  it('should return 0 free space when over quota', () => {
    const used = 12000;
    const quota = 10000;
    const free = Math.max(0, quota - used);
    
    expect(free).toBe(0);
  });
});

describe('Size Parsing', () => {
  function parseSize(sizeStr: string): number {
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const unit = (match[2] || 'B').toUpperCase();
    
    const multipliers: Record<string, number> = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024
    };
    
    return value * (multipliers[unit] || 1);
  }

  it('should parse bytes', () => {
    expect(parseSize('1024B')).toBe(1024);
    expect(parseSize('512B')).toBe(512);
  });

  it('should parse kilobytes', () => {
    expect(parseSize('1KB')).toBe(1024);
    expect(parseSize('1.5KB')).toBe(1536);
  });

  it('should parse megabytes', () => {
    expect(parseSize('1MB')).toBe(1048576);
    expect(parseSize('2.5MB')).toBe(2621440);
  });

  it('should parse gigabytes', () => {
    expect(parseSize('1GB')).toBe(1073741824);
  });

  it('should handle invalid input', () => {
    expect(parseSize('invalid')).toBe(0);
    expect(parseSize('')).toBe(0);
  });
});

describe('Dedup Statistics', () => {
  it('should calculate savings correctly', () => {
    const files = [
      { size: 1000, refCount: 3 },
      { size: 2000, refCount: 2 }
    ];
    
    const totalFiles = files.reduce((sum, f) => sum + f.refCount, 0);
    const uniqueContent = files.length;
    const totalStorageUsed = files.reduce((sum, f) => sum + (f.size * f.refCount), 0);
    const actualStorageUsed = files.reduce((sum, f) => sum + f.size, 0);
    const savedBytes = totalStorageUsed - actualStorageUsed;
    const savedPercent = (savedBytes / totalStorageUsed) * 100;
    
    expect(totalFiles).toBe(5);
    expect(uniqueContent).toBe(2);
    expect(totalStorageUsed).toBe(7000);
    expect(actualStorageUsed).toBe(3000);
    expect(savedBytes).toBe(4000);
    expect(savedPercent).toBeCloseTo(57.14, 1);
  });
});

describe('Username Validation', () => {
  function validateUsername(username: string): { valid: boolean; error?: string } {
    if (!username || typeof username !== 'string') {
      return { valid: false, error: 'Username is required' };
    }
    
    if (username.length < 3 || username.length > 32) {
      return { valid: false, error: 'Username must be 3-32 characters long' };
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return { valid: false, error: 'Username can only contain letters, numbers, and underscores' };
    }
    
    return { valid: true };
  }

  it('should accept valid username', () => {
    expect(validateUsername('testuser').valid).toBe(true);
    expect(validateUsername('test_user_123').valid).toBe(true);
  });

  it('should reject short username', () => {
    const result = validateUsername('ab');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('3-32 characters');
  });

  it('should reject long username', () => {
    const result = validateUsername('a'.repeat(33));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('3-32 characters');
  });

  it('should reject invalid characters', () => {
    const result = validateUsername('user@name');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('letters, numbers, and underscores');
  });
});

describe('Password Validation', () => {
  function validatePassword(password: string): { valid: boolean; error?: string } {
    if (!password || typeof password !== 'string') {
      return { valid: false, error: 'Password is required' };
    }
    
    if (password.length < 8 || password.length > 128) {
      return { valid: false, error: 'Password must be 8-128 characters long' };
    }
    
    return { valid: true };
  }

  it('should accept valid password', () => {
    expect(validatePassword('password123').valid).toBe(true);
    expect(validatePassword('MySecureP@ssw0rd!').valid).toBe(true);
  });

  it('should reject short password', () => {
    const result = validatePassword('pass');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('8-128 characters');
  });

  it('should reject long password', () => {
    const result = validatePassword('a'.repeat(129));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('8-128 characters');
  });
});
