#!/usr/bin/env tsx

/**
 * CLI script to create admin users
 * Used during initial setup and password recovery
 */

import * as readline from 'readline';
import * as process from 'process';
import { AuthService, AuthError } from '../backend/src/services/auth.service.js';
import { initializeDatabase } from '../backend/src/db/client.js';

const authService = new AuthService();

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Prompt user for input with optional hidden input (for passwords)
 */
function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    if (hidden) {
      // Hide password input
      const stdin = process.stdin;
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');
      
      process.stdout.write(question);
      let input = '';
      
      const onData = (char: string) => {
        switch (char) {
          case '\n':
          case '\r':
          case '\u0004': // Ctrl+D
            stdin.setRawMode(false);
            stdin.pause();
            stdin.removeListener('data', onData);
            process.stdout.write('\n');
            resolve(input);
            break;
          case '\u0003': // Ctrl+C
            process.exit(1);
            break;
          case '\u007f': // Backspace
            if (input.length > 0) {
              input = input.slice(0, -1);
              process.stdout.write('\b \b');
            }
            break;
          default:
            input += char;
            process.stdout.write('•');
            break;
        }
      };
      
      stdin.on('data', onData);
    } else {
      rl.question(question, resolve);
    }
  });
}

/**
 * Validate username format
 */
function validateUsername(username: string): string | null {
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
    return 'Username must be 3-32 characters, alphanumeric and underscore only';
  }
  return null;
}

/**
 * Validate password strength
 */
function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (password.length > 128) {
    return 'Password must be no more than 128 characters';
  }
  return null;
}

/**
 * Main function to create admin user
 */
async function createAdminUser(): Promise<void> {
  console.log('PocketCloud Admin User Creation');
  console.log('================================\n');

  try {
    // Initialize database connection
    const dbPath = process.env.DATABASE_PATH || './data/storage.db';
    initializeDatabase(dbPath);
    
    let username: string;
    let password: string;
    let confirmPassword: string;

    // Get username
    while (true) {
      username = await prompt('Username: ');
      const usernameError = validateUsername(username);
      if (usernameError) {
        console.log(`Error: ${usernameError}\n`);
        continue;
      }

      // Check if username already exists
      try {
        const existingUser = await authService.findUserByUsername(username);
        if (existingUser) {
          console.log(`Error: Username '${username}' already exists\n`);
          continue;
        }
        break;
      } catch (error) {
        console.error('Error checking username:', error);
        process.exit(1);
      }
    }

    // Get password
    while (true) {
      password = await prompt('Password: ', true);
      const passwordError = validatePassword(password);
      if (passwordError) {
        console.log(`Error: ${passwordError}\n`);
        continue;
      }
      break;
    }

    // Confirm password
    while (true) {
      confirmPassword = await prompt('Confirm:  ', true);
      if (password !== confirmPassword) {
        console.log('Error: Passwords do not match\n');
        continue;
      }
      break;
    }

    // Create admin user
    try {
      const user = await authService.createUser(username, password, 'admin');
      console.log(`\nCreated admin user '${user.username}' successfully.`);
      console.log(`User ID: ${user.id}`);
      console.log(`Role: ${user.role}`);
      console.log(`Created: ${new Date(user.created_at).toISOString()}`);
    } catch (error) {
      if (error instanceof AuthError) {
        console.error(`\nError: ${error.message}`);
        process.exit(1);
      } else {
        console.error('\nError creating admin user:', error);
        process.exit(1);
      }
    }

  } catch (error) {
    console.error('Database initialization error:', error);
    process.exit(1);
  } finally {
    rl.close();
    process.exit(0);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\nOperation cancelled.');
  rl.close();
  process.exit(1);
});

process.on('SIGTERM', () => {
  rl.close();
  process.exit(1);
});

// Run the script
createAdminUser().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});