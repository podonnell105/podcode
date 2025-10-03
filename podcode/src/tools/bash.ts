import { z } from 'zod';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { Tool, ToolContext, ToolResult } from './types.js';
import { displayScrollableOutput } from '../utils/terminal-output.js';
import { executeInteractive } from '../utils/interactive-terminal.js';

const BashParametersSchema = z.object({
  command: z.string().describe('The bash command to execute'),
  timeout: z.number().optional().describe('Timeout in seconds (default: 30)'),
  scrollable: z.boolean().optional().describe('Whether to display output in scrollable mode (default: false)'),
  interactive: z.boolean().optional().describe('Whether to run the command in interactive mode, allowing user input (default: false)')
});

export class BashTool implements Tool {
  name = 'bash';
  description = 'Execute bash commands in the terminal. Use this to run shell commands, install packages, compile code, etc.';
  parameters = BashParametersSchema;

  async execute(args: z.infer<typeof BashParametersSchema>, context: ToolContext): Promise<ToolResult> {
    const { command, timeout = 30, scrollable = false, interactive = false } = args;
    
    // Show clean command execution like Cursor
    console.log(chalk.gray(`Running: ${command}`));
    
    // If interactive mode is enabled, use the interactive terminal
    if (interactive) {
      try {
        // Parse the command into executable and arguments
        const [cmd, ...cmdArgs] = command.split(' ').filter(Boolean);
        
        // Execute the command interactively
        const result = await executeInteractive(cmd, cmdArgs, {
          cwd: context.workingDirectory,
          timeout: timeout,
          showOutput: true,
          showPrompts: true,
          signal: context.signal
        });
        
        return {
          success: result.success,
          output: result.output,
          error: result.error
        };
      } catch (error) {
        return {
          success: false,
          output: '',
          error: `Failed to execute interactive command: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
    
    // Non-interactive mode (standard execution)
    return new Promise((resolve) => {
      const child = spawn('bash', ['-c', command], {
        cwd: context.workingDirectory,
        stdio: 'pipe',
        env: { ...process.env, TERM: 'dumb' }
      });

      let stdout = '';
      let stderr = '';
      let killed = false;

      const timer = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        resolve({
          success: false,
          output: stdout,
          error: `Command timed out after ${timeout} seconds`
        });
      }, timeout * 1000);

      if (context.signal) {
        context.signal.addEventListener('abort', () => {
          killed = true;
          child.kill('SIGTERM');
          clearTimeout(timer);
          resolve({
            success: false,
            output: stdout,
            error: 'Command aborted'
          });
        });
      }

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (killed) return;
        
        clearTimeout(timer);
        const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');
        
        resolve({
          success: code === 0,
          output,
          error: code !== 0 ? `Command exited with code ${code}` : undefined
        });
      });

      child.on('error', (error) => {
        if (killed) return;
        
        clearTimeout(timer);
        resolve({
          success: false,
          output: stdout,
          error: `Failed to execute command: ${error.message}`
        });
      });
    });
  }

  toOpenAITool() {
    return {
      type: 'function' as const,
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The bash command to execute'
            },
            timeout: {
              type: 'number',
              description: 'Timeout in seconds (default: 30)',
              default: 30
            },
            scrollable: {
              type: 'boolean',
              description: 'Whether to display output in scrollable mode with navigation controls (default: false)',
              default: false
            },
            interactive: {
              type: 'boolean',
              description: 'Whether to run the command in interactive mode, allowing user input for authentication, confirmations, etc. (default: false)',
              default: false
            }
          },
          required: ['command']
        }
      }
    };
  }
}

