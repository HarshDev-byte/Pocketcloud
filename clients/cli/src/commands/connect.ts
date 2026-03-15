/**
 * Connect command - discover and authenticate with PocketCloud
 */

import chalk from 'chalk';
import { config } from '../lib/config';
import { discovery } from '../lib/discover';
import { auth } from '../lib/auth';
import { api } from '../lib/api';
import { Spinner } from '../lib/progress';
import inquirer from 'inquirer';

export async function connectCommand(
  ip?: string,
  options: {
    port?: string;
    username?: string;
    stealth?: boolean;
  } = {}
): Promise<void> {
  const { port = '3000', username, stealth = false } = options;

  try {
    let targetDevice = null;

    if (ip) {
      // Connect to specific IP
      console.log(chalk.blue(`Connecting to ${ip}:${port}...`));
      
      config.set('ip', ip);
      config.set('port', parseInt(port));
      api.updateConfig();

      const device = await discovery.checkDevice(ip, parseInt(port));
      if (device) {
        targetDevice = device;
        console.log(chalk.green(`✓ Found PocketCloud at ${ip}:${port}`));
      } else {
        console.error(chalk.red(`✗ No PocketCloud found at ${ip}:${port}`));
        process.exit(1);
      }
    } else {
      // Auto-discover devices
      const spinner = new Spinner('Discovering PocketCloud devices...');
      spinner.start();

      const devices = await discovery.discover(stealth);
      spinner.stop();

      if (devices.length === 0) {
        console.error(chalk.red('✗ No PocketCloud devices found'));
        console.log('');
        console.log('Try:');
        console.log('  • Ensure PocketCloud is running and accessible');
        console.log('  • Use specific IP: pcd connect 192.168.4.1');
        console.log('  • Check network connectivity');
        process.exit(1);
      }

      if (devices.length === 1) {
        targetDevice = devices[0];
        console.log(chalk.green(`✓ Found PocketCloud at ${targetDevice.ip}:${targetDevice.port}`));
      } else {
        // Multiple devices found, let user choose
        console.log(chalk.blue(`Found ${devices.length} PocketCloud devices:`));
        
        const choices = devices.map((device, index) => ({
          name: `${device.ip}:${device.port} (${device.name || 'PocketCloud'})${device.version ? ` v${device.version}` : ''}`,
          value: index
        }));

        const { selectedIndex } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedIndex',
            message: 'Select device to connect to:',
            choices
          }
        ]);

        targetDevice = devices[selectedIndex];
      }
    }

    // Update configuration with selected device
    config.set('host', targetDevice.host);
    config.set('ip', targetDevice.ip);
    config.set('port', targetDevice.port);
    api.updateConfig();

    // Show device info
    if (targetDevice.version) {
      console.log(chalk.gray(`Device: ${targetDevice.name || 'PocketCloud'} v${targetDevice.version}`));
    }

    // Authenticate
    console.log('');
    const authenticated = await auth.login(username);
    
    if (authenticated) {
      // Get and display system status
      const statusResponse = await api.getStatus();
      if (statusResponse.success && statusResponse.data) {
        const status = statusResponse.data;
        console.log('');
        console.log(chalk.green('Connection established!'));
        console.log('');
        console.log('System Status:');
        console.log(`  Uptime: ${formatUptime(status.uptime)}`);
        
        if (status.storage) {
          const freeGB = Math.round(status.storage.free / (1024 ** 3));
          const totalGB = Math.round(status.storage.total / (1024 ** 3));
          console.log(`  Storage: ${freeGB}GB free of ${totalGB}GB (${status.storage.percentage}% used)`);
        }
        
        if (status.temperature) {
          console.log(`  Temperature: ${status.temperature}°C`);
        }
        
        console.log('');
        console.log('Available commands:');
        console.log('  pcd ls              - List files');
        console.log('  pcd put <file>      - Upload file');
        console.log('  pcd get <file>      - Download file');
        console.log('  pcd sync <folder>   - Sync folder');
        console.log('  pcd mount           - Mount as filesystem');
        console.log('  pcd status          - Show system status');
      }
    } else {
      process.exit(1);
    }

  } catch (error: any) {
    console.error(chalk.red('Connection failed:'), error.message);
    process.exit(1);
  }
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}