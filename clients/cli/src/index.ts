#!/usr/bin/env node

/**
 * PocketCloud Drive CLI (pcd)
 * Universal Linux client for PocketCloud Drive
 * 
 * Works on: Ubuntu 20.04+, Kali Linux 2023+, Debian 11+, Raspberry Pi OS
 * Features: File operations, sync, mount, security tools for Kali
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { connectCommand } from './commands/connect';
import { lsCommand } from './commands/ls';
import { getCommand } from './commands/get';
import { putCommand } from './commands/put';
import { rmCommand } from './commands/rm';
import { mvCommand } from './commands/mv';
import { cpCommand } from './commands/cp';
import { mkdirCommand } from './commands/mkdir';
import { syncCommand } from './commands/sync';
import { mountCommand } from './commands/mount';
import { shareCommand } from './commands/share';
import { statusCommand } from './commands/status';
import { searchCommand } from './commands/search';
import { watchCommand } from './commands/watch';
import { secureWipeCommand } from './commands/secure-wipe';
import { encryptCommand } from './commands/encrypt';
import { decryptCommand } from './commands/decrypt';
import { auditCommand } from './commands/audit';
import { stealthCommand } from './commands/stealth';
import { config } from './lib/config';

const program = new Command();

program
  .name('pcd')
  .description('PocketCloud Drive CLI - Universal Linux client')
  .version('1.0.0')
  .configureOutput({
    outputError: (str, write) => write(chalk.red(str))
  });

// Core file operations
program
  .command('connect')
  .description('Discover and authenticate with PocketCloud')
  .argument('[ip]', 'IP address (optional, will auto-discover if not provided)')
  .option('-p, --port <port>', 'Port number', '3000')
  .option('-u, --username <username>', 'Username')
  .option('-s, --stealth', 'Connect without mDNS broadcast')
  .action(connectCommand);

program
  .command('ls')
  .description('List files and folders')
  .argument('[path]', 'Remote path', '/')
  .option('-l, --long', 'Long format with details')
  .option('-a, --all', 'Show hidden files')
  .option('-h, --human', 'Human readable sizes')
  .action(lsCommand);

program
  .command('get')
  .description('Download file (resumable)')
  .argument('<remote>', 'Remote file path')
  .argument('[local]', 'Local file path (optional)')
  .option('-r, --resume', 'Resume interrupted download')
  .option('-c, --continue', 'Continue partial download')
  .action(getCommand);

program
  .command('put')
  .description('Upload file (chunked, resumable)')
  .argument('<local>', 'Local file path')
  .argument('[remote]', 'Remote file path (optional)')
  .option('-r, --resume', 'Resume interrupted upload')
  .option('-c, --chunk-size <size>', 'Chunk size in MB', '10')
  .action(putCommand);

program
  .command('rm')
  .description('Delete file or folder (to trash)')
  .argument('<path>', 'Remote path to delete')
  .option('-f, --force', 'Force delete without confirmation')
  .option('--permanent', 'Permanent delete (bypass trash)')
  .action(rmCommand);

program
  .command('mv')
  .description('Move or rename file/folder')
  .argument('<src>', 'Source path')
  .argument('<dst>', 'Destination path')
  .option('-f, --force', 'Force overwrite existing files')
  .action(mvCommand);

program
  .command('cp')
  .description('Copy file or folder')
  .argument('<src>', 'Source path')
  .argument('<dst>', 'Destination path')
  .option('-r, --recursive', 'Copy directories recursively')
  .option('-f, --force', 'Force overwrite existing files')
  .action(cpCommand);

program
  .command('mkdir')
  .description('Create folder')
  .argument('<path>', 'Folder path to create')
  .option('-p, --parents', 'Create parent directories as needed')
  .action(mkdirCommand);

// Advanced operations
program
  .command('sync')
  .description('Two-way sync a folder')
  .argument('<local>', 'Local folder path')
  .argument('[remote]', 'Remote folder path (optional)')
  .option('-w, --watch', 'Watch for changes and sync continuously')
  .option('-d, --dry-run', 'Show what would be synced without doing it')
  .option('--delete', 'Delete files that don\'t exist on the other side')
  .option('--exclude <patterns>', 'Exclude patterns (comma-separated)')
  .action(syncCommand);

program
  .command('mount')
  .description('Mount PocketCloud via davfs2')
  .argument('[mountpoint]', 'Mount point', '~/pocketcloud')
  .option('-u, --unmount', 'Unmount instead of mount')
  .option('-o, --options <opts>', 'Mount options')
  .action(mountCommand);

program
  .command('share')
  .description('Create share link')
  .argument('<path>', 'File or folder path to share')
  .option('-e, --expires <days>', 'Expiration in days', '7')
  .option('-p, --password <password>', 'Password protect the share')
  .option('--read-only', 'Read-only access')
  .action(shareCommand);

program
  .command('status')
  .description('Show PocketCloud status and storage info')
  .option('-j, --json', 'Output as JSON')
  .option('-w, --watch', 'Watch status continuously')
  .action(statusCommand);

program
  .command('search')
  .description('Search files by name or content')
  .argument('<query>', 'Search query')
  .option('-t, --type <type>', 'File type filter (image, video, document, etc.)')
  .option('-s, --size <size>', 'Size filter (e.g., >1MB, <100KB)')
  .option('-m, --modified <time>', 'Modified time filter (e.g., 1d, 1w, 1m)')
  .action(searchCommand);

program
  .command('watch')
  .description('Watch folder and auto-upload changes')
  .argument('<folder>', 'Local folder to watch')
  .option('-r, --remote <path>', 'Remote destination path')
  .option('-i, --ignore <patterns>', 'Ignore patterns (comma-separated)')
  .option('-d, --delay <seconds>', 'Delay before upload (seconds)', '2')
  .action(watchCommand);

// Kali Linux security features
program
  .command('secure-wipe')
  .description('Securely wipe file (DoD 3-pass overwrite)')
  .argument('<path>', 'Remote file path to securely delete')
  .option('-p, --passes <num>', 'Number of overwrite passes', '3')
  .action(secureWipeCommand);

program.addCommand(encryptCommand);

program.addCommand(decryptCommand);

program
  .command('audit')
  .description('Show audit log of file access')
  .option('-f, --file <path>', 'Filter by file path')
  .option('-u, --user <user>', 'Filter by user')
  .option('-a, --action <action>', 'Filter by action (read, write, delete)')
  .option('-d, --days <days>', 'Show last N days', '7')
  .action(auditCommand);

program
  .command('stealth')
  .description('Connect in stealth mode (no mDNS broadcast)')
  .argument('<ip>', 'Target IP address')
  .option('-p, --port <port>', 'Port number', '3000')
  .action(stealthCommand);

// Global error handling
process.on('uncaughtException', (error) => {
  console.error(chalk.red('Fatal error:'), error.message);
  if (config.get('debug')) {
    console.error(error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(chalk.red('Unhandled rejection:'), reason);
  process.exit(1);
});

// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}