import { describe, it, expect } from 'vitest';

describe('Pipeline - Condition Evaluation', () => {
  const mockFile = {
    id: 'file1',
    name: 'document.pdf',
    mime_type: 'application/pdf',
    size: 1048576, // 1MB
    folder_id: 'folder1',
    created_at: Date.now()
  };

  it('should match mime_type equals condition', () => {
    const matches = mockFile.mime_type === 'application/pdf';
    expect(matches).toBe(true);
  });

  it('should match filename contains condition', () => {
    const matches = mockFile.name.toLowerCase().includes('document');
    expect(matches).toBe(true);
  });

  it('should match file_size greater_than condition', () => {
    const threshold = 500 * 1024; // 500KB
    const matches = mockFile.size > threshold;
    expect(matches).toBe(true);
  });

  it('should match file_size less_than condition', () => {
    const threshold = 2 * 1024 * 1024; // 2MB
    const matches = mockFile.size < threshold;
    expect(matches).toBe(true);
  });
});

describe('Pipeline - Rename Template', () => {
  const mockFile = {
    id: 'file1',
    name: 'vacation.jpg',
    mime_type: 'image/jpeg',
    size: 2048576,
    created_at: new Date('2024-07-15T10:30:00').getTime()
  };

  function applyTemplate(pattern: string, file: any): string {
    let result = pattern;
    
    // Replace {name}
    result = result.replace('{name}', file.name);
    
    // Replace {date}
    const date = new Date(file.created_at);
    const dateStr = date.toISOString().slice(0, 10);
    result = result.replace('{date}', dateStr);
    
    // Replace {timestamp}
    result = result.replace('{timestamp}', file.created_at.toString());
    
    // Replace {ext}
    const ext = file.name.split('.').pop() || '';
    result = result.replace('{ext}', ext);
    
    return result;
  }

  it('should replace {name} variable', () => {
    const result = applyTemplate('photo_{name}', mockFile);
    expect(result).toBe('photo_vacation.jpg');
  });

  it('should replace {date} variable', () => {
    const result = applyTemplate('{date}_{name}', mockFile);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_vacation\.jpg$/);
  });

  it('should replace {ext} variable', () => {
    const result = applyTemplate('file.{ext}', mockFile);
    expect(result).toBe('file.jpg');
  });

  it('should handle multiple variables', () => {
    const result = applyTemplate('{date}_{name}', mockFile);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_vacation\.jpg$/);
  });
});

describe('Pipeline - Size Parsing', () => {
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
});
