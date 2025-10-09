import { z } from 'zod';
import { spawn } from 'child_process';
import { Tool, ToolContext, ToolResult } from './types.js';

const CLIDiscoveryParametersSchema = z.object({
  tool: z.string().describe('The CLI tool to discover commands for (e.g., "sf", "aws", "git", "docker")'),
  action: z.string().describe('The action you want to perform (e.g., "list apps", "show data", "get info")'),
  context: z.string().optional().describe('Additional context about what you\'re looking for')
});

export class CLIDiscoveryTool implements Tool {
  name = 'cli_discovery';
  description = 'Discover and use CLI commands generically for any tool. Automatically finds the right commands to perform actions without being platform-specific.';
  parameters = CLIDiscoveryParametersSchema;

  async execute(args: z.infer<typeof CLIDiscoveryParametersSchema>, context: ToolContext): Promise<ToolResult> {
    const { tool, action, context: actionContext } = args;
    
    try {
      // Step 1: Check if tool exists
      const toolExists = await this.checkToolExists(tool, context);
      if (!toolExists.success) {
        return {
          success: false,
          output: `Tool '${tool}' not found. ${toolExists.error}`,
          error: toolExists.error
        };
      }

      // Step 2: Get help/commands for the tool
      const helpResult = await this.getToolHelp(tool, context);
      if (!helpResult.success) {
        return {
          success: false,
          output: `Could not get help for '${tool}': ${helpResult.error}`,
          error: helpResult.error
        };
      }

      // Step 3: Find relevant commands based on the action
      const relevantCommands = this.findRelevantCommands(helpResult.output, action, actionContext);
      
      if (relevantCommands.length === 0) {
        return {
          success: false,
          output: `No relevant commands found for action "${action}" in tool '${tool}'.\n\nAvailable commands:\n${helpResult.output}`,
          error: 'No relevant commands found'
        };
      }

      // Step 4: Try the most relevant command
      const bestCommand = relevantCommands[0];
      const commandResult = await this.executeCommand(tool, bestCommand, context);
      
      if (commandResult.success) {
        return {
          success: true,
          output: `✅ Found and executed: ${tool} ${bestCommand}\n\n${commandResult.output}`
        };
      } else {
        // Try alternative commands if the first one fails
        for (let i = 1; i < relevantCommands.length; i++) {
          const altCommand = relevantCommands[i];
          const altResult = await this.executeCommand(tool, altCommand, context);
          if (altResult.success) {
            return {
              success: true,
              output: `✅ Found and executed: ${tool} ${altCommand}\n\n${altResult.output}`
            };
          }
        }
        
        return {
          success: false,
          output: `Tried commands: ${relevantCommands.join(', ')}\n\nLast error: ${commandResult.error}`,
          error: commandResult.error
        };
      }

    } catch (error) {
      return {
        success: false,
        output: `Error discovering CLI commands: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async checkToolExists(tool: string, context: ToolContext): Promise<ToolResult> {
    // Try multiple ways to check if tool exists
    const checkCommands = [
      `which ${tool}`,
      `command -v ${tool}`,
      `${tool} --version`,
      `${tool} -v`
    ];

    for (const cmd of checkCommands) {
      const result = await this.runCommandWithTimeout(cmd, context, 5000);
      if (result.success) {
        return result;
      }
    }

    return {
      success: false,
      output: '',
      error: `Tool '${tool}' not found in PATH`
    };
  }

  private async getToolHelp(tool: string, context: ToolContext): Promise<ToolResult> {
    // Try different help formats with shorter timeout
    const helpCommands = [
      `${tool} --help`,
      `${tool} -h`,
      `${tool} help`
    ];

    for (const cmd of helpCommands) {
      const result = await this.runCommandWithTimeout(cmd, context, 10000); // 10 second timeout
      if (result.success && result.output.trim()) {
        return result;
      }
    }

    // If help commands fail, try to get basic command list
    const basicResult = await this.runCommandWithTimeout(`${tool}`, context, 5000);
    if (basicResult.success && basicResult.output.trim()) {
      return basicResult;
    }

    return {
      success: false,
      output: '',
      error: 'Could not get help information'
    };
  }

  private findRelevantCommands(helpOutput: string, action: string, context?: string): string[] {
    const actionLower = action.toLowerCase();
    const contextLower = context?.toLowerCase() || '';
    
    const lines = helpOutput.split('\n');
    const commands: string[] = [];
    
    // Smart command mapping based on common patterns
    const commandMap: Record<string, string[]> = {
      // List/show commands
      'list': ['list', 'ls', 'show', 'get', 'display'],
      'show': ['show', 'display', 'get', 'list', 'ls'],
      'get': ['get', 'show', 'list', 'display'],
      'display': ['display', 'show', 'get', 'list'],
      
      // Data/query commands
      'data': ['data', 'query', 'select', 'find', 'search'],
      'query': ['query', 'data', 'select', 'find'],
      'select': ['select', 'query', 'data', 'find'],
      'find': ['find', 'search', 'query', 'data'],
      
      // App/application commands
      'app': ['app', 'application', 'apps'],
      'apps': ['apps', 'app', 'application'],
      'application': ['application', 'app', 'apps'],
      
      // Org/organization commands
      'org': ['org', 'organization', 'orgs'],
      'orgs': ['orgs', 'org', 'organization'],
      'organization': ['organization', 'org', 'orgs'],
      
      // Info commands
      'info': ['info', 'information', 'details', 'describe'],
      'information': ['information', 'info', 'details'],
      'details': ['details', 'info', 'information']
    };

    // Extract potential commands from help output
    for (const line of lines) {
      const lineLower = line.toLowerCase().trim();
      
      // Look for command patterns
      const commandMatch = lineLower.match(/^([a-zA-Z][a-zA-Z0-9_-]*)/);
      if (commandMatch) {
        const command = commandMatch[1];
        
        // Check if this command is relevant to our action
        for (const [keyword, patterns] of Object.entries(commandMap)) {
          if (actionLower.includes(keyword) || contextLower.includes(keyword)) {
            if (patterns.some(pattern => command.includes(pattern) || lineLower.includes(pattern))) {
              commands.push(command);
              break;
            }
          }
        }
      }
    }

    // If no specific commands found, try common patterns
    if (commands.length === 0) {
      const commonCommands = ['list', 'show', 'get', 'query', 'data', 'info'];
      for (const cmd of commonCommands) {
        if (helpOutput.toLowerCase().includes(cmd)) {
          commands.push(cmd);
        }
      }
    }

    // Remove duplicates and return top matches
    return [...new Set(commands)].slice(0, 3);
  }

  private async executeCommand(tool: string, command: string, context: ToolContext): Promise<ToolResult> {
    const fullCommand = `${tool} ${command}`;
    return this.runCommand(fullCommand, context);
  }

  private async runCommand(command: string, context: ToolContext): Promise<ToolResult> {
    return this.runCommandWithTimeout(command, context, 15000); // 15 second timeout for CLI discovery (increased from 5s)
  }

  private async runCommandWithTimeout(command: string, context: ToolContext, timeoutMs: number): Promise<ToolResult> {
    return new Promise((resolve) => {
      // Use shell: true for better command execution and ensure proper environment
      const child = spawn(command, [], {
        cwd: context.workingDirectory,
        stdio: 'pipe',
        env: {
          ...process.env,
          PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
          NODE_ENV: process.env.NODE_ENV || 'development'
        },
        shell: true
      });

      let stdout = '';
      let stderr = '';
      let resolved = false;

      // Set timeout - increased for complex CLI tools
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          child.kill('SIGTERM');
          resolve({
            success: false,
            output: '',
            error: `Command timed out after ${timeoutMs}ms`
          });
        }
      }, Math.min(timeoutMs, 15000)); // Max 15 seconds for CLI discovery (increased from 5s)

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({
            success: code === 0,
            output: stdout.trim(),
            error: code !== 0 ? stderr.trim() : undefined
          });
        }
      });

      child.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({
            success: false,
            output: '',
            error: error.message
          });
        }
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
            tool: {
              type: 'string',
              description: 'The CLI tool to discover commands for (e.g., "sf", "aws", "git", "docker")'
            },
            action: {
              type: 'string',
              description: 'The action you want to perform (e.g., "list apps", "show data", "get info")'
            },
            context: {
              type: 'string',
              description: 'Additional context about what you\'re looking for'
            }
          },
          required: ['tool', 'action']
        }
      }
    };
  }
}
