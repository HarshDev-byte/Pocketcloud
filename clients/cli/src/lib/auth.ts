/**
 * Authentication management
 * Handles login, token refresh, and logout
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { config } from './config';
import { api } from './api';

export class AuthManager {
  /**
   * Interactive login process
   */
  public async login(username?: string, password?: string): Promise<boolean> {
    try {
      // Get credentials if not provided
      if (!username || !password) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'username',
            message: 'Username:',
            default: username || config.get('username') || 'admin',
            validate: (input) => input.trim().length > 0 || 'Username is required'
          },
          {
            type: 'password',
            name: 'password',
            message: 'Password:',
            mask: '*',
            validate: (input) => input.length > 0 || 'Password is required'
          }
        ]);

        username = answers.username;
        password = answers.password;
      }

      console.log(chalk.blue('Authenticating...'));

      // Attempt login
      const response = await api.login(username!, password!);

      if (response.success && response.data?.token) {
        // Save credentials
        config.set('username', username);
        config.set('token', response.data.token);
        config.set('lastConnected', Date.now());

        console.log(chalk.green('✓ Authentication successful'));
        return true;
      } else {
        console.error(chalk.red('✗ Authentication failed:'), response.error || 'Invalid credentials');
        return false;
      }

    } catch (error: any) {
      console.error(chalk.red('✗ Authentication error:'), error.message);
      return false;
    }
  }

  /**
   * Logout and clear stored credentials
   */
  public async logout(): Promise<void> {
    try {
      // Attempt to logout on server
      await api.logout();
    } catch (error) {
      // Ignore server errors during logout
    }

    // Clear local credentials
    config.set('token', undefined);
    config.set('username', undefined);
    
    console.log(chalk.green('✓ Logged out successfully'));
  }

  /**
   * Check if user is currently authenticated
   */
  public isAuthenticated(): boolean {
    const token = config.get('token');
    return !!token;
  }

  /**
   * Get current username
   */
  public getCurrentUser(): string | undefined {
    return config.get('username');
  }

  /**
   * Verify token is still valid
   */
  public async verifyToken(): Promise<boolean> {
    if (!this.isAuthenticated()) {
      return false;
    }

    try {
      const response = await api.getStatus();
      return response.success;
    } catch (error) {
      return false;
    }
  }

  /**
   * Ensure user is authenticated, prompt for login if not
   */
  public async ensureAuthenticated(): Promise<boolean> {
    if (this.isAuthenticated()) {
      // Verify token is still valid
      const valid = await this.verifyToken();
      if (valid) {
        return true;
      } else {
        console.log(chalk.yellow('Session expired, please log in again'));
        config.set('token', undefined);
      }
    }

    console.log(chalk.blue('Authentication required'));
    return this.login();
  }

  /**
   * Interactive authentication with retry
   */
  public async authenticateWithRetry(maxRetries: number = 3): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const success = await this.ensureAuthenticated();
      
      if (success) {
        return true;
      }

      if (attempt < maxRetries) {
        console.log(chalk.yellow(`Authentication failed. Attempt ${attempt}/${maxRetries}`));
        console.log('');
      }
    }

    console.error(chalk.red('Maximum authentication attempts exceeded'));
    return false;
  }

  /**
   * Get authentication status info
   */
  public getAuthInfo(): {
    authenticated: boolean;
    username?: string;
    lastConnected?: Date;
  } {
    const lastConnected = config.get('lastConnected');
    
    return {
      authenticated: this.isAuthenticated(),
      username: this.getCurrentUser(),
      lastConnected: lastConnected ? new Date(lastConnected) : undefined
    };
  }
}

export const auth = new AuthManager();