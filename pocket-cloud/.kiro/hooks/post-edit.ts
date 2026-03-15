/**
 * Kiro Post-Edit Hook for PocketCloud
 * Runs after any file is edited to perform context-aware checks
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';

interface EditContext {
  filePath: string;
  isNewFile: boolean;
  workspaceRoot: string;
}

export async function onPostEdit(context: EditContext): Promise<void> {
  const { filePath, workspaceRoot } = context;
  const relativePath = filePath.replace(workspaceRoot + '/', '');
  const fileName = basename(filePath);
  
  console.log(`🔍 Post-edit check: ${relativePath}`);

  try {
    // a) Network service edited - remind about testing
    if (relativePath.includes('network.service.ts')) {
      console.log('📡 Network service modified');
      console.log('💡 Reminder: Run scripts/test-network-modes.sh to verify all 3 modes');
      return;
    }

    // b) DB migration added - check reversibility
    if (relativePath.includes('db/migrations/') && relativePath.endsWith('.sql')) {
      console.log('🗄️  Database migration detected');
      console.log('💡 Reminder: Run pnpm migrate:check to verify migration is reversible');
      
      // Check if migration has both UP and DOWN sections
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf8');
        if (!content.includes('-- DOWN') && !content.includes('-- ROLLBACK')) {
          console.log('⚠️  Warning: Migration may not be reversible (no DOWN/ROLLBACK section found)');
        }
      }
      return;
    }

    // c) Route file edited - run TypeScript check
    if (relativePath.includes('/routes/') && relativePath.endsWith('.ts')) {
      console.log('🛣️  Route file modified, running TypeScript check...');
      
      try {
        execSync('npx tsc --noEmit', { 
          cwd: workspaceRoot,
          stdio: 'pipe',
          timeout: 30000 
        });
        console.log('✅ TypeScript check passed');
      } catch (error: any) {
        console.error('❌ TypeScript errors found:');
        console.error(error.stdout?.toString() || error.message);
        throw new Error('TypeScript check failed - please fix errors before continuing');
      }
      return;
    }

    // d) Frontend component edited - check for console.log
    if (relativePath.includes('frontend/src/') && 
        (relativePath.endsWith('.tsx') || relativePath.endsWith('.ts')) &&
        !relativePath.includes('.test.')) {
      
      console.log('⚛️  Frontend component modified, checking for console.log...');
      
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf8');
        const consoleLogMatches = content.match(/console\.log\(/g);
        
        if (consoleLogMatches && consoleLogMatches.length > 0) {
          console.log(`⚠️  Warning: Found ${consoleLogMatches.length} console.log statement(s) in ${fileName}`);
          console.log('💡 Consider using proper logging or removing debug statements');
          // Don't block - just warn
        }
      }
      return;
    }

    // e) Shell script edited - run shellcheck
    if (relativePath.includes('scripts/') && relativePath.endsWith('.sh')) {
      console.log('🐚 Shell script modified, running shellcheck...');
      
      try {
        // Check if shellcheck is available
        execSync('which shellcheck', { stdio: 'pipe' });
        
        execSync(`shellcheck "${filePath}"`, { 
          cwd: workspaceRoot,
          stdio: 'pipe',
          timeout: 15000 
        });
        console.log('✅ Shellcheck passed');
      } catch (error: any) {
        if (error.message.includes('which shellcheck')) {
          console.log('⚠️  Shellcheck not installed - skipping shell script validation');
          console.log('💡 Install with: brew install shellcheck (macOS) or apt install shellcheck (Ubuntu)');
        } else {
          console.error('❌ Shellcheck issues found:');
          console.error(error.stdout?.toString() || error.message);
          throw new Error('Shellcheck validation failed - please fix issues before continuing');
        }
      }
      return;
    }

    // Default case - no specific checks needed
    console.log('✅ No specific checks required for this file type');

  } catch (error: any) {
    console.error(`❌ Post-edit check failed: ${error.message}`);
    throw error;
  }
}

// Helper function to check if a command exists
function commandExists(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Export for Kiro hook system
export default {
  name: 'PocketCloud Post-Edit Validator',
  description: 'Runs context-aware checks after file edits',
  onPostEdit
};