/**
 * Delete file command - pcd rm <path>
 */

import chalk from 'chalk';
import { auth } from '../lib/auth';
import { api } from '../lib/api';
import inquirer from 'inquirer';

export async function rmCommand(
  path: string,
  options: {
    force?: boolean;
    permanent?: boolean;
  } = {}
): Promise<void> {
  const { force = false, permanent = false } = options;

  try {
    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    const authenticated = await auth.ensureAuthenticated();
    if (!authenticated) {
      process.exit(1);
    }

    // Get file info
    const fileInfoResponse = await api.getFileInfo(path);
    if (!fileInfoResponse.success) {
      console.error(chalk.red('✗ File not found:'), path);
      process.exit(1);
    }

    const fileInfo = fileInfoResponse.data;
    if (!fileInfo) {
      console.error(chalk.red('✗ File not found:'), path);
      process.exit(1);
    }
    
    const isDirectory = fileInfo.type === 'directory';

    // Confirm deletion unless forced
    if (!force) {
      const message = permanent 
        ? `Permanently delete ${isDirectory ? 'directory' : 'file'} "${path}"?`
        : `Move ${isDirectory ? 'directory' : 'file'} "${path}" to trash?`;

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message,
          default: false
        }
      ]);

      if (!confirm) {
        console.log(chalk.yellow('Operation cancelled'));
        return;
      }
    }

    // Delete file
    const response = await api.deleteFile(path, permanent);
    
    if (response.success) {
      const action = permanent ? 'deleted permanently' : 'moved to trash';
      console.log(chalk.green(`✓ ${fileInfo?.name || 'File'} ${action}`));
    } else {
      console.error(chalk.red('✗ Delete failed:'), response.error);
      process.exit(1);
    }

  } catch (error: any) {
    console.error(chalk.red('✗ Error:'), error.message);
    process.exit(1);
  }
}