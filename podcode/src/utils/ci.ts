import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { UIFormatter } from './ui-formatter.js';

export interface CICheckResult {
  success: boolean;
  output: string;
  error?: string;
  checksRun: string[];
  failedStep?: string;
}

/**
 * Enforce CI sequence after any write/edit operations:
 * 1. lint (npm run lint if present in package.json)
 * 2. typecheck (tsc -p . if TS deps found, or npm run typecheck)
 * 3. tests (npm test if script exists)
 * FAIL FAST: If any step fails, stop and return failure
 */
export async function runCIChecks(workingDirectory: string): Promise<CICheckResult> {
  const checksRun: string[] = [];
  
  console.log(chalk.cyan('\n🔍 Enforcing CI sequence after write/edit...'));

  // Check if package.json exists
  const packageJsonPath = join(workingDirectory, 'package.json');
  if (!existsSync(packageJsonPath)) {
    console.log(chalk.gray('No package.json found, skipping CI checks'));
    return {
      success: true,
      output: 'No package.json found, skipping CI checks',
      checksRun: []
    };
  }

  // Parse package.json to discover scripts and dependencies
  let packageJson: any;
  try {
    packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  } catch (error) {
    return {
      success: false,
      output: '',
      error: 'Failed to parse package.json',
      checksRun: [],
      failedStep: 'package.json'
    };
  }

  const scripts = packageJson.scripts || {};
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const hasTypeScript = dependencies.typescript || dependencies['@types/node'] || existsSync(join(workingDirectory, 'tsconfig.json'));

  // STEP 1: Run lint if present in package.json
  if (scripts.lint) {
    try {
      console.log(chalk.gray('Step 1/3: Running lint...'));
      const lintOutput = execSync('npm run lint', { 
        cwd: workingDirectory, 
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      checksRun.push('lint');
      console.log(chalk.green('✅ Lint passed'));
    } catch (error: any) {
      const errorOutput = error.stdout || error.stderr || error.message;
      console.log(chalk.red('❌ Lint failed - stopping CI sequence'));
      return {
        success: false,
        output: '',
        error: `Lint failed:\n${errorOutput}`,
        checksRun: ['lint'],
        failedStep: 'lint'
      };
    }
  } else {
    console.log(chalk.gray('Step 1/3: No lint script found, skipping'));
  }

  // STEP 2: Run typecheck 
  if (scripts.typecheck) {
    try {
      console.log(chalk.gray('Step 2/3: Running typecheck (npm script)...'));
      const typecheckOutput = execSync('npm run typecheck', { 
        cwd: workingDirectory, 
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      checksRun.push('typecheck');
      console.log(chalk.green('✅ Typecheck passed'));
    } catch (error: any) {
      const errorOutput = error.stdout || error.stderr || error.message;
      console.log(chalk.red('❌ Typecheck failed - stopping CI sequence'));
      return {
        success: false,
        output: '',
        error: `Typecheck failed:\n${errorOutput}`,
        checksRun: [...checksRun, 'typecheck'],
        failedStep: 'typecheck'
      };
    }
  } else if (hasTypeScript) {
    try {
      console.log(chalk.gray('Step 2/3: Running typecheck (tsc -p .)...'));
      const typecheckOutput = execSync('tsc -p .', { 
        cwd: workingDirectory, 
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      checksRun.push('tsc');
      console.log(chalk.green('✅ TypeScript check passed'));
    } catch (error: any) {
      const errorOutput = error.stdout || error.stderr || error.message;
      console.log(chalk.red('❌ TypeScript check failed - stopping CI sequence'));
      return {
        success: false,
        output: '',
        error: `TypeScript check failed:\n${errorOutput}`,
        checksRun: [...checksRun, 'tsc'],
        failedStep: 'typecheck'
      };
    }
  } else {
    console.log(chalk.gray('Step 2/3: No TypeScript dependencies found, skipping typecheck'));
  }

  // STEP 3: Run tests if npm test script exists
  if (scripts.test) {
    try {
      console.log(chalk.gray('Step 3/3: Running tests...'));
      const testOutput = execSync('npm test', { 
        cwd: workingDirectory, 
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      checksRun.push('test');
      console.log(chalk.green('✅ Tests passed'));
    } catch (error: any) {
      const errorOutput = error.stdout || error.stderr || error.message;
      console.log(chalk.red('❌ Tests failed - stopping CI sequence'));
      return {
        success: false,
        output: '',
        error: `Tests failed:\n${errorOutput}`,
        checksRun: [...checksRun, 'test'],
        failedStep: 'test'
      };
    }
  } else {
    console.log(chalk.gray('Step 3/3: No test script found, skipping'));
  }

  const result: CICheckResult = {
    success: true,
    output: `All CI checks passed (${checksRun.join(', ')})`,
    checksRun
  };

  // Display success
  console.log('\n' + UIFormatter.createStatusBox('completed', `CI sequence completed (${checksRun.join(', ')})`));

  return result;
}

/**
 * Check if a tool name represents a write/edit operation
 */
export function isWriteEditTool(toolName: string): boolean {
  const writeEditTools = ['write', 'write_file', 'edit', 'edit_file', 'search_replace', 'MultiEdit'];
  return writeEditTools.includes(toolName);
}
