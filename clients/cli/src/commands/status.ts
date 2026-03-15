/**
 * Status command - show PocketCloud status and storage info
 */

import chalk from 'chalk';
import { auth } from '../lib/auth';
import { api } from '../lib/api';
import { config } from '../lib/config';

export async function statusCommand(
  options: {
    json?: boolean;
    watch?: boolean;
  } = {}
): Promise<void> {
  const { json = false, watch = false } = options;

  try {
    // Ensure authenticated
    const authenticated = await auth.ensureAuthenticated();
    if (!authenticated) {
      process.exit(1);
    }

    if (watch) {
      // Watch mode - update every 5 seconds
      console.log(chalk.blue('Watching PocketCloud status (Press Ctrl+C to stop)...'));
      console.log('');

      const updateStatus = async () => {
        // Clear screen and move cursor to top
        process.stdout.write('\x1b[2J\x1b[H');
        await displayStatus(json);
      };

      // Initial display
      await updateStatus();

      // Update every 5 seconds
      const interval = setInterval(updateStatus, 5000);

      // Handle Ctrl+C
      process.on('SIGINT', () => {
        clearInterval(interval);
        console.log('\n' + chalk.yellow('Status monitoring stopped'));
        process.exit(0);
      });

    } else {
      // Single status check
      await displayStatus(json);
    }

  } catch (error: any) {
    console.error(chalk.red('✗ Failed to get status:'), error.message);
    process.exit(1);
  }
}

async function displayStatus(json: boolean): Promise<void> {
  try {
    // Get system status
    const statusResponse = await api.getStatus();
    if (!statusResponse.success) {
      throw new Error(statusResponse.error || 'Failed to get status');
    }

    const status = statusResponse.data;
    if (!status) {
      throw new Error('No status data received');
    }
    const connectionInfo = {
      host: config.get('host') || config.get('ip'),
      port: config.get('port'),
      username: config.get('username'),
      connected: true
    };

    if (json) {
      // JSON output
      const output = {
        connection: connectionInfo,
        system: status,
        timestamp: new Date().toISOString()
      };
      console.log(JSON.stringify(output, null, 2));
    } else {
      // Human-readable output
      console.log(chalk.green('PocketCloud Status'));
      console.log('='.repeat(50));
      console.log('');

      // Connection info
      console.log(chalk.blue('Connection:'));
      console.log(`  Host:     ${connectionInfo.host}:${connectionInfo.port}`);
      console.log(`  User:     ${connectionInfo.username}`);
      console.log(`  Status:   ${chalk.green('Connected')}`);
      console.log('');

      // System info
      console.log(chalk.blue('System:'));
      console.log(`  Status:   ${status.status === 'ok' ? chalk.green('OK') : chalk.red('ERROR')}`);
      console.log(`  Version:  ${status.version}`);
      console.log(`  Uptime:   ${formatUptime(status.uptime)}`);
      
      if (status.cpu !== undefined) {
        console.log(`  CPU:      ${status.cpu.toFixed(1)}%`);
      }
      
      if (status.memory !== undefined) {
        console.log(`  Memory:   ${status.memory.toFixed(1)}%`);
      }
      
      if (status.temperature !== undefined) {
        const tempColor = status.temperature > 70 ? chalk.red : 
                         status.temperature > 60 ? chalk.yellow : chalk.green;
        console.log(`  Temp:     ${tempColor(status.temperature + '°C')}`);
      }
      
      console.log('');

      // Storage info
      if (status.storage) {
        const storage = status.storage;
        const usedGB = Math.round(storage.used / (1024 ** 3));
        const totalGB = Math.round(storage.total / (1024 ** 3));
        const freeGB = Math.round(storage.free / (1024 ** 3));
        
        console.log(chalk.blue('Storage:'));
        console.log(`  Total:    ${totalGB}GB`);
        console.log(`  Used:     ${usedGB}GB (${storage.percentage}%)`);
        console.log(`  Free:     ${freeGB}GB`);
        
        // Storage bar
        const barWidth = 30;
        const usedBlocks = Math.round((storage.percentage / 100) * barWidth);
        const freeBlocks = barWidth - usedBlocks;
        const storageBar = '█'.repeat(usedBlocks) + '░'.repeat(freeBlocks);
        
        const barColor = storage.percentage > 90 ? chalk.red :
                        storage.percentage > 75 ? chalk.yellow : chalk.green;
        
        console.log(`  Usage:    [${barColor(storageBar)}] ${storage.percentage}%`);
        console.log('');
      }

      // Show timestamp
      console.log(chalk.gray(`Last updated: ${new Date().toLocaleString()}`));
    }

  } catch (error: any) {
    if (json) {
      console.log(JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      }, null, 2));
    } else {
      console.error(chalk.red('✗ Error getting status:'), error.message);
    }
  }
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  
  return parts.join(' ') || '0m';
}