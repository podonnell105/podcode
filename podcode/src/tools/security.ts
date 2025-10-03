import { resolve } from 'path';

export interface SafePathResult {
  isValid: boolean;
  reason?: string;
}

/**
 * Validates that a file path is safe for file operations
 * Prevents access outside project root and blocks sensitive files
 */
export function validateSafePath(filePath: string, workingDirectory: string): SafePathResult {
  // Handle tilde expansion manually
  let expandedPath = filePath;
  if (filePath.startsWith('~/')) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    if (homeDir) {
      expandedPath = filePath.replace('~', homeDir);
    }
  }
  
  // Resolve the full path
  const fullPath = resolve(workingDirectory, expandedPath);
  
  // Deny .env files
  if (filePath.includes('.env')) {
    return { isValid: false, reason: '.env files are blocked for security' };
  }
  
  // Deny secrets directories
  if (filePath.includes('/secrets/') || filePath.includes('\\secrets\\')) {
    return { isValid: false, reason: 'secrets directories are blocked for security' };
  }
  
  // Deny home directory access outside of current working directory
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (homeDir && fullPath.startsWith(homeDir) && !fullPath.startsWith(workingDirectory)) {
    return { isValid: false, reason: 'home directory access outside project is blocked' };
  }
  
  // Ensure path is within the working directory (project root)
  if (!fullPath.startsWith(workingDirectory)) {
    return { isValid: false, reason: 'access outside project root is blocked for security' };
  }
  
  // Block system directories
  const systemPaths = ['/etc/', '/usr/', '/var/', '/sys/', '/proc/', 'C:\\Windows\\', 'C:\\Program Files\\'];
  if (systemPaths.some(sysPath => fullPath.startsWith(sysPath))) {
    return { isValid: false, reason: 'system directory access is blocked for security' };
  }
  
  return { isValid: true };
}

/**
 * Security wrapper for file operations
 * Returns error result if path validation fails
 */
export function validatePathOrError(filePath: string, workingDirectory: string): { success: true } | { success: false; error: string } {
  const validation = validateSafePath(filePath, workingDirectory);
  
  if (!validation.isValid) {
    return {
      success: false,
      error: `Security violation: ${validation.reason}`
    };
  }
  
  return { success: true };
}
