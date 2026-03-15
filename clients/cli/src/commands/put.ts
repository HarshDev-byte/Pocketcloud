/**
 * Upload file command - pcd put <local> [remote]
 */

import { basename, join } from 'path';
import { existsSync, statSync } from 'fs';
import chalk from 'chalk';
import { auth } from '../lib/auth';
import { uploader } from '../lib/upload';

export async function putCommand(
  localPath: string,
  remotePath?: string,
  options: {
    resume?: boolean;
    chunkSize?: string;
  } = {}
): Promise<void> {
  const { resume = true, chunkSize = '10' } = options;

  try {
    // Validate local file
    if (!existsSync(localPath)) {
      console.error(chalk.red('✗ File not found:'), localPath);
      process.exit(1);
    }

    const stats = statSync(localPath);
    if (!stats.isFile()) {
      console.error(chalk.red('✗ Not a file:'), localPath);
      process.exit(1);
    }

    // Determine remote path
    if (!remotePath) {
      remotePath = '/' + basename(localPath);
    } else if (!remotePath.startsWith('/')) {
      remotePath = '/' + remotePath;
    }

    // Ensure authenticated
    const authenticated = await auth.ensureAuthenticated();
    if (!authenticated) {
      process.exit(1);
    }

    // Parse chunk size
    const chunkSizeMB = parseInt(chunkSize);
    if (isNaN(chunkSizeMB) || chunkSizeMB < 1 || chunkSizeMB > 100) {
      console.error(chalk.red('✗ Invalid chunk size. Must be between 1-100 MB'));
      process.exit(1);
    }

    // Show file info
    console.log(chalk.blue('Upload Details:'));
    console.log(`  Local:  ${localPath}`);
    console.log(`  Remote: ${remotePath}`);
    console.log(`  Size:   ${formatBytes(stats.size)}`);
    console.log(`  Chunks: ${chunkSizeMB}MB`);
    console.log('');

    // Check for existing upload
    if (resume) {
      const pendingUploads = uploader.listPendingUploads();
      const existingUpload = pendingUploads.find(upload => 
        upload.filePath === localPath && upload.remotePath === remotePath
      );

      if (existingUpload) {
        const uploadedBytes = existingUpload.uploadedChunks.length * existingUpload.chunkSize;
        const percentage = Math.round((uploadedBytes / existingUpload.fileSize) * 100);
        
        console.log(chalk.yellow(`Found existing upload (${percentage}% complete)`));
        console.log(`Resuming from ${formatBytes(uploadedBytes)}...`);
        console.log('');
      }
    }

    // Upload file
    const success = await uploader.uploadFile(localPath, remotePath, {
      chunkSize: chunkSizeMB,
      resume
    });

    if (success) {
      console.log('');
      console.log(chalk.green('Upload completed successfully!'));
      
      // Show next steps
      console.log('');
      console.log('Next steps:');
      console.log(`  pcd ls ${remotePath.split('/').slice(0, -1).join('/') || '/'}  - View uploaded file`);
      console.log(`  pcd share ${remotePath}  - Create share link`);
    }

  } catch (error: any) {
    console.error(chalk.red('✗ Upload failed:'), error.message);
    
    if (error.message.includes('authentication') || error.message.includes('401')) {
      console.log(chalk.yellow('Try: pcd connect'));
    } else if (error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
      console.log(chalk.yellow('Check network connection and PocketCloud status'));
    }
    
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