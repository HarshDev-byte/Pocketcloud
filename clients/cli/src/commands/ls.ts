/**
 * List files command - pcd ls [path]
 */

import chalk from 'chalk';
import { auth } from '../lib/auth';
import { api, FileInfo } from '../lib/api';

export async function lsCommand(
  path: string = '/',
  options: {
    long?: boolean;
    all?: boolean;
    human?: boolean;
  } = {}
): Promise<void> {
  const { long = false, all = false, human = true } = options;

  try {
    // Ensure authenticated
    const authenticated = await auth.ensureAuthenticated();
    if (!authenticated) {
      process.exit(1);
    }

    // List files
    const response = await api.listFiles(path);
    
    if (!response.success) {
      console.error(chalk.red('✗ Failed to list files:'), response.error);
      process.exit(1);
    }

    const files = response.data || [];
    
    if (files.length === 0) {
      console.log(chalk.gray('(empty directory)'));
      return;
    }

    // Filter hidden files if not showing all
    const filteredFiles = all ? files : files.filter(file => !file.name.startsWith('.'));

    if (long) {
      // Long format output
      console.log('');
      
      for (const file of filteredFiles) {
        const permissions = file.permissions || (file.type === 'directory' ? 'drwxr-xr-x' : '-rw-r--r--');
        const size = file.type === 'directory' ? '-' : (human ? formatBytes(file.size) : file.size.toString());
        const modified = formatDate(file.updatedAt);
        const name = file.type === 'directory' ? chalk.blue(file.name + '/') : file.name;
        
        console.log(`${permissions}  ${size.padStart(10)}  ${modified}  ${name}`);
      }
    } else {
      // Simple format output (like ls output)
      const maxNameLength = Math.max(...filteredFiles.map(f => f.name.length));
      const terminalWidth = process.stdout.columns || 80;
      const columnWidth = Math.max(maxNameLength + 2, 20);
      const columns = Math.floor(terminalWidth / columnWidth);
      
      for (let i = 0; i < filteredFiles.length; i += columns) {
        const row = filteredFiles.slice(i, i + columns);
        const formattedRow = row.map(file => {
          const name = file.type === 'directory' 
            ? chalk.blue(file.name + '/') 
            : file.name;
          return name.padEnd(columnWidth);
        });
        
        console.log(formattedRow.join(''));
      }
    }

    // Show summary
    const dirCount = filteredFiles.filter(f => f.type === 'directory').length;
    const fileCount = filteredFiles.filter(f => f.type === 'file').length;
    const totalSize = filteredFiles
      .filter(f => f.type === 'file')
      .reduce((sum, f) => sum + f.size, 0);

    console.log('');
    console.log(chalk.gray(
      `${dirCount} directories, ${fileCount} files` +
      (fileCount > 0 ? `, ${formatBytes(totalSize)} total` : '')
    ));

  } catch (error: any) {
    console.error(chalk.red('✗ Error:'), error.message);
    process.exit(1);
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }
}