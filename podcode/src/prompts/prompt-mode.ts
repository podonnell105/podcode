export interface PromptModeConfig {
  type: 'dynamic' | 'memory' | 'memory-rating';
  config?: any;
}

export interface DynamicPromptConfig {
  model: string;
  knowledgeCutoff: string;
  workingDirectory: string;
  platform: string;
  isGitRepo: string;
  date: string;
  shell: string;
}

export interface MemoryPromptConfig {
  conversationContext: string;
  memory: string;
  criteria: string;
}

export interface EnvironmentDetails {
  workingDirectory: string;
  isGitRepo: string;
  platform: string;
  date: string;
  model: string;
}

export function createPromptMode(
  env: EnvironmentDetails,
  mode: PromptModeConfig = { type: 'dynamic' }
): PromptModeConfig {
  // Default to dynamic mode for all interactions
  return {
    type: 'dynamic',
    config: {
      model: env.model,
      knowledgeCutoff: '2024-06',
      workingDirectory: env.workingDirectory,
      platform: env.platform,
      isGitRepo: env.isGitRepo,
      date: env.date,
      shell: process.platform === 'win32' 
        ? 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' 
        : '/bin/bash'
    }
  };
}
