import { z } from 'zod';
import { Tool, ToolContext, ToolResult } from './types.js';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { execSync } from 'child_process';

export class GitTool implements Tool {
  name = 'git';
  description = 'Execute Git operations for version control. Supports common Git commands like status, add, commit, push, pull, branch operations, and more.';
  parameters = z.object({
    command: z.enum([
      'status', 'add', 'commit', 'push', 'pull', 'fetch', 'merge', 'rebase',
      'branch', 'checkout', 'switch', 'log', 'diff', 'show', 'reset', 'stash',
      'tag', 'remote', 'clone', 'init', 'config', 'blame', 'grep'
    ]).describe('Git command to execute'),
    args: z.array(z.string()).default([]).describe('Additional arguments for the git command'),
    message: z.string().optional().describe('Commit message (required for commit command)'),
    branch: z.string().optional().describe('Branch name (for branch, checkout, switch commands)'),
    remote: z.string().optional().describe('Remote name (for push, pull, fetch commands)'),
    path: z.string().optional().describe('Specific file or path to operate on'),
    working_directory: z.string().optional().describe('Working directory for git operations (defaults to session working directory)')
  });

  async execute(args: any, context: ToolContext): Promise<ToolResult> {
    try {
      const { 
        command, 
        args: commandArgs = [], 
        message, 
        branch, 
        remote, 
        path, 
        working_directory = context.workingDirectory 
      } = args;

      // Validate required parameters for specific commands
      if (command === 'commit' && !message) {
        return {
          success: false,
          output: '',
          error: 'Commit message is required for commit command'
        };
      }

      if ((command === 'branch' || command === 'checkout' || command === 'switch') && !branch) {
        return {
          success: false,
          output: '',
          error: `Branch name is required for ${command} command`
        };
      }

      // Build the git command
      let gitCommand = `git ${command}`;

      // Add command-specific arguments
      switch (command) {
        case 'add':
          if (path) {
            gitCommand += ` "${path}"`;
          } else if (commandArgs.length > 0) {
            gitCommand += ` ${commandArgs.map((arg: string) => `"${arg}"`).join(' ')}`;
          } else {
            gitCommand += ' .';
          }
          break;

        case 'commit':
          gitCommand += ` -m "${message}"`;
          break;

        case 'push':
        case 'pull':
        case 'fetch':
          if (remote) {
            gitCommand += ` ${remote}`;
            if (branch) {
              gitCommand += ` ${branch}`;
            }
          } else if (branch) {
            gitCommand += ` origin ${branch}`;
          }
          break;

        case 'branch':
          if (commandArgs.includes('--delete') || commandArgs.includes('-d')) {
            gitCommand += ` ${commandArgs.join(' ')} ${branch}`;
          } else {
            gitCommand += ` ${branch}`;
          }
          break;

        case 'checkout':
        case 'switch':
          gitCommand += ` ${branch}`;
          break;

        case 'merge':
        case 'rebase':
          if (branch) {
            gitCommand += ` ${branch}`;
          }
          break;

        case 'log':
          if (commandArgs.length > 0) {
            gitCommand += ` ${commandArgs.join(' ')}`;
          } else {
            gitCommand += ' --oneline -10'; // Show last 10 commits by default
          }
          break;

        case 'diff':
          if (path) {
            gitCommand += ` "${path}"`;
          } else if (commandArgs.length > 0) {
            gitCommand += ` ${commandArgs.join(' ')}`;
          }
          break;

        case 'show':
          if (commandArgs.length > 0) {
            gitCommand += ` ${commandArgs.join(' ')}`;
          }
          break;

        case 'reset':
          if (commandArgs.length > 0) {
            gitCommand += ` ${commandArgs.join(' ')}`;
          } else {
            gitCommand += ' --soft HEAD~1'; // Default to soft reset last commit
          }
          break;

        case 'stash':
          if (commandArgs.length > 0) {
            gitCommand += ` ${commandArgs.join(' ')}`;
          } else {
            gitCommand += ' list'; // Default to list stashes
          }
          break;

        case 'tag':
          if (commandArgs.length > 0) {
            gitCommand += ` ${commandArgs.join(' ')}`;
          } else {
            gitCommand += ' -l'; // List tags by default
          }
          break;

        case 'remote':
          if (commandArgs.length > 0) {
            gitCommand += ` ${commandArgs.join(' ')}`;
          } else {
            gitCommand += ' -v'; // Show remotes by default
          }
          break;

        case 'clone':
          if (commandArgs.length > 0) {
            gitCommand += ` ${commandArgs.join(' ')}`;
          } else {
            return {
              success: false,
              output: '',
              error: 'Repository URL is required for clone command'
            };
          }
          break;

        case 'init':
          if (commandArgs.length > 0) {
            gitCommand += ` ${commandArgs.join(' ')}`;
          }
          break;

        case 'config':
          if (commandArgs.length > 0) {
            gitCommand += ` ${commandArgs.join(' ')}`;
          } else {
            gitCommand += ' --list'; // List config by default
          }
          break;

        case 'blame':
          if (path) {
            gitCommand += ` "${path}"`;
          } else {
            return {
              success: false,
              output: '',
              error: 'File path is required for blame command'
            };
          }
          break;

        case 'grep':
          if (commandArgs.length > 0) {
            gitCommand += ` ${commandArgs.join(' ')}`;
          } else {
            return {
              success: false,
              output: '',
              error: 'Search pattern is required for grep command'
            };
          }
          break;

        default:
          if (commandArgs.length > 0) {
            gitCommand += ` ${commandArgs.join(' ')}`;
          }
      }

      // Execute the git command
      const result = execSync(gitCommand, {
        cwd: working_directory,
        encoding: 'utf8',
        stdio: 'pipe'
      });

      return {
        success: true,
        output: `✅ Git ${command} completed successfully:\n${result}`
      };

    } catch (error: any) {
      // Handle git command errors
      const errorMessage = error.stderr || error.message || 'Unknown git error';
      
      return {
        success: false,
        output: '',
        error: `Git ${args.command} failed: ${errorMessage}`
      };
    }
  }

  toOpenAITool(): ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              enum: [
                'status', 'add', 'commit', 'push', 'pull', 'fetch', 'merge', 'rebase',
                'branch', 'checkout', 'switch', 'log', 'diff', 'show', 'reset', 'stash',
                'tag', 'remote', 'clone', 'init', 'config', 'blame', 'grep'
              ],
              description: 'Git command to execute'
            },
            args: {
              type: 'array',
              items: { type: 'string' },
              default: [],
              description: 'Additional arguments for the git command'
            },
            message: {
              type: 'string',
              description: 'Commit message (required for commit command)'
            },
            branch: {
              type: 'string',
              description: 'Branch name (for branch, checkout, switch commands)'
            },
            remote: {
              type: 'string',
              description: 'Remote name (for push, pull, fetch commands)'
            },
            path: {
              type: 'string',
              description: 'Specific file or path to operate on'
            },
            working_directory: {
              type: 'string',
              description: 'Working directory for git operations (defaults to session working directory)'
            }
          },
          required: ['command']
        }
      }
    };
  }
}
