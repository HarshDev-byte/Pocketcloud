/**
 * Kiro Pre-Commit Hook for PocketCloud
 * Runs before every git commit to ensure code quality and security
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

interface CommitContext {
  stagedFiles: string[];
  workspaceRoot: string;
}

export async function onPreCommit(context: CommitContext): Promise<void> {
  const { stagedFiles, workspaceRoot } = context;
  
  console.log('🔒 Running pre-commit checks...');
  console.log(`📁 Checking ${stagedFiles.length} staged files`);

  try {
    // 1. Run TypeScript check
    await runTypeScriptCheck(workspaceRoot);
    
    // 2. Run ESLint
    await runESLintCheck(workspaceRoot);
    
    // 3. Check for .env files
    checkForEnvFiles(stagedFiles);
    
    // 4. Check for hardcoded secrets
    checkForHardcodedSecrets(stagedFiles, workspaceRoot);
    
    console.log('✅ All pre-commit checks passed');

  } catch (error: any) {
    console.error(`❌ Pre-commit check failed: ${error.message}`);
    throw error;
  }
}

async function runTypeScriptCheck(workspaceRoot: string): Promise<void> {
  console.log('🔍 Running TypeScript check...');
  
  try {
    // Check backend
    execSync('pnpm typecheck', { 
      cwd: workspaceRoot,
      stdio: 'pipe',
      timeout: 60000 
    });
    
    console.log('✅ TypeScript check passed');
  } catch (error: any) {
    console.error('❌ TypeScript errors found:');
    console.error(error.stdout?.toString() || error.message);
    throw new Error('TypeScript check failed - fix errors before committing');
  }
}

async function runESLintCheck(workspaceRoot: string): Promise<void> {
  console.log('🔍 Running ESLint check...');
  
  try {
    execSync('pnpm lint', { 
      cwd: workspaceRoot,
      stdio: 'pipe',
      timeout: 60000 
    });
    
    console.log('✅ ESLint check passed');
  } catch (error: any) {
    console.error('❌ ESLint errors found:');
    console.error(error.stdout?.toString() || error.message);
    throw new Error('ESLint check failed - fix linting errors before committing');
  }
}

function checkForEnvFiles(stagedFiles: string[]): void {
  console.log('🔍 Checking for .env files...');
  
  const envFiles = stagedFiles.filter(file => 
    file.includes('.env') && 
    !file.includes('.env.example') &&
    !file.includes('.env.template')
  );
  
  if (envFiles.length > 0) {
    console.error('❌ Environment files found in staged changes:');
    envFiles.forEach(file => console.error(`  - ${file}`));
    throw new Error('Remove .env files from staged changes - they contain sensitive data');
  }
  
  console.log('✅ No .env files in staged changes');
}

function checkForHardcodedSecrets(stagedFiles: string[], workspaceRoot: string): void {
  console.log('🔍 Checking for hardcoded secrets...');
  
  const secretPatterns = [
    // Common password patterns
    /password\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    /secret\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    /key\s*[:=]\s*['"][^'"]{16,}['"]/gi,
    
    // Specific bad patterns
    /password123/gi,
    /admin123/gi,
    /secret123/gi,
    
    // IP addresses in source code (not config)
    /\b(?:192\.168\.|10\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)\d{1,3}\.\d{1,3}\b/g,
    
    // API keys and tokens
    /['"](sk|pk)_[a-zA-Z0-9]{20,}['"]/g,
    /['"]\w*token\w*['"]:\s*['"][^'"]{20,}['"]/gi,
    
    // Database URLs with credentials
    /['"](mysql|postgres|mongodb):\/\/[^:]+:[^@]+@[^'"]+['"]/gi
  ];
  
  const sourceFiles = stagedFiles.filter(file => 
    (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) &&
    !file.includes('.test.') &&
    !file.includes('node_modules') &&
    !file.includes('.env.example')
  );
  
  const violations: Array<{file: string, line: number, pattern: string}> = [];
  
  for (const file of sourceFiles) {
    try {
      const content = readFileSync(`${workspaceRoot}/${file}`, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        secretPatterns.forEach(pattern => {
          if (pattern.test(line)) {
            // Skip comments and obvious examples
            if (line.trim().startsWith('//') || 
                line.trim().startsWith('*') ||
                line.includes('example') ||
                line.includes('placeholder') ||
                line.includes('TODO') ||
                line.includes('FIXME')) {
              return;
            }
            
            violations.push({
              file,
              line: index + 1,
              pattern: line.trim()
            });
          }
        });
      });
    } catch (error) {
      // Skip files that can't be read
      continue;
    }
  }
  
  if (violations.length > 0) {
    console.error('❌ Potential hardcoded secrets found:');
    violations.forEach(v => {
      console.error(`  ${v.file}:${v.line} - ${v.pattern.substring(0, 80)}...`);
    });
    throw new Error('Remove hardcoded secrets before committing');
  }
  
  console.log('✅ No hardcoded secrets detected');
}

// Helper function to run command with timeout
function runCommand(command: string, cwd: string, timeoutMs: number = 30000): string {
  try {
    return execSync(command, { 
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: 'pipe'
    });
  } catch (error: any) {
    throw new Error(`Command failed: ${command}\n${error.stdout || error.message}`);
  }
}

// Export for Kiro hook system
export default {
  name: 'PocketCloud Pre-Commit Validator',
  description: 'Ensures code quality and security before commits',
  onPreCommit
};