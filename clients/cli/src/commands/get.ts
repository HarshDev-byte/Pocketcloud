/**
 * Download file command - pcd get <remote> [local]
 */

import { basename, join, resolve } from 'path';
import { existsSync } from 'fs';
import chalk from 'chalk';
import { auth } from '../lib/auth';
import { downloader } from '../lib/download';
import { api } from '../lib/api';

export async function getCommand(
  remotePath: string,
  localPath?: string,
  options: {
    resume?: boolean;
    continue?: boolean;
  } = {}
): Promise<void> {
  const { resume = true } = options;

  try {
    // Ensure remote path starts with /
    if (!remotePath.startsWith('/')) {
      remotePath = '/' + remotePath;
    }

    // Determine local path
    if (!localPath) {
      localPath = basename(remotePath);
    }
    
    localPath = resolve(localPath);

    // Ensure authenticated
    const authenticated = await auth.ensureAuthenticated();
    if (!authenticated) {
      process.exit(1);
    }

    // Get file info from server
    const fileInfoResponse = await api.getFileInfo(remotePath);
    if (!fileInfoResponse.success) {
      console.error(chalk.red('✗ File not found:'), remotePath);
      process.exit(1);
    }

    const fileInfo = fileInfoResponse.data;
    if (!fileInfo) {
      console.error(chalk.red('✗ File not found:'), remotePath);
      process.exit(1);
    }
    
    if (fileInfo.type === 'directory') {
      console.error(chalk.red('✗ Cannot download directory. Use sync command for directories.'));
      process.exit(1);
    }

    // Check if local file exists
    let canResume = false;
    if (existsSync(localPath)) {
      if (resume) {
        canResume = await downloader.canResume(remotePath, localPath);
        if (canResume) {
          console.log(chalk.yellow('Local file exists and can be resumed'));
        } else {
          console.log(chalk.yellow('Local file exists and appears complete'));
          
          // Ask user what to do
          const inquirer = await import('inquirer');
          const { action } = await inquirer.default.prompt([
            {
              type: 'list',
              name: 'action',
              message: 'What would you like to do?',
              choices: [
                { name: 'Overwrite existing file', value: 'overwrite' },
                { name: 'Skip download', value: 'skip' },
                { name: 'Download to different name', value: 'rename' }
              ]
            }
          ]);

          if (action === 'skip') {
            console.log(chalk.green('✓ Download skipped'));
            return;
          } else if (action === 'rename') {
            const { newName } = await inquirer.default.prompt([
              {
                type: 'input',
                name: 'newName',
                message: 'Enter new filename:',
                default: `${basename(localPath, '.' + localPath.split('.').pop())}_copy.${localPath.split('.').pop()}`
              }
            ]);
            localPath = join(localPath.split('/').slice(0, -1).join('/'), newName);
          }
          // For overwrite, just continue with existing localPath
        }
      } else {
        console.error(chalk.red('✗ Local file already exists:'), localPath);
        console.log(chalk.yellow('Use --resume to resume download or choose a different filename'));
        process.exit(1);
      }
    }

    // Show download info
    console.log(chalk.blue('Download Details:'));
    console.log(`  Remote: ${remotePath}`);
    console.log(`  Local:  ${localPath}`);
    console.log(`  Size:   ${formatBytes(fileInfo?.size || 0)}`);
    
    if (canResume) {
      console.log(`  Mode:   Resume`);
    }
    
    console.log('');

    // Download file
    const success = await downloader.downloadFile(remotePath, localPath, {
      resume
    });

    if (success) {
      console.log('');
      console.log(chalk.green('Download completed successfully!'));
      
      // Show file info
      console.log('');
      console.log('File saved to:', localPath);
    }

  } catch (error: any) {
    console.error(chalk.red('✗ Download failed:'), error.message);
    
    if (error.message.includes('authentication') || error.message.includes('401')) {
      console.log(chalk.yellow('Try: pcd connect'));
    } else if (error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
      console.log(chalk.yellow('Check network connection and PocketCloud status'));
    } else if (error.message.includes('resume')) {
      console.log(chalk.yellow('Server does not support resume. Try without --resume flag.'));
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