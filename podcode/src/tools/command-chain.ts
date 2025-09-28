import { z } from 'zod';
import chalk from 'chalk';
import { Tool, ToolContext, ToolResult } from './types.js';
import { CommandChainBuilder, executeCommandChain } from '../utils/command-chain.js';

const CommandChainParametersSchema = z.object({
  commands: z.array(z.object({
    command: z.string().describe('The command to execute'),
    args: z.array(z.string()).optional().describe('Arguments for the command'),
    condition: z.string().optional().describe('JavaScript condition to evaluate (has access to prevOutput and prevExitCode)'),
    continueOnError: z.boolean().optional().describe('Whether to continue chain if this command fails')
  })).describe('Array of commands to execute in sequence'),
  timeout: z.number().optional().describe('Timeout in seconds for each command (default: 120)')
});

export class CommandChainTool implements Tool {
  name = 'command_chain';
  description = 'Execute a chain of interactive commands in sequence, with each command potentially depending on the output of previous commands. Useful for multi-step processes like authentication flows.';
  parameters = CommandChainParametersSchema;

  async execute(args: z.infer<typeof CommandChainParametersSchema>, context: ToolContext): Promise<ToolResult> {
    const { commands, timeout = 120 } = args;
    
    console.log(chalk.cyan(`🔗 Executing command chain with ${commands.length} commands`));
    
    try {
      // Convert the commands to the format expected by executeCommandChain
      const chainCommands = commands.map(cmd => ({
        command: cmd.command,
        args: cmd.args || [],
        timeout,
        cwd: context.workingDirectory,
        continueOnError: cmd.continueOnError || false,
        // Parse condition if provided
        condition: cmd.condition ? this.createConditionFunction(cmd.condition) : undefined
      }));
      
      // Execute the command chain
      const result = await executeCommandChain(chainCommands);
      
      // Format the result
      const output = this.formatResult(result);
      
      return {
        success: result.success,
        output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to execute command chain: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  /**
   * Create a condition function from a string condition
   * @param conditionStr The condition string to evaluate
   * @returns A function that evaluates the condition
   */
  private createConditionFunction(conditionStr: string): (prevOutput: string, prevExitCode?: number) => boolean {
    // Create a safe function that can access prevOutput and prevExitCode
    try {
      // eslint-disable-next-line no-new-func
      return new Function('prevOutput', 'prevExitCode', `return (${conditionStr});`) as any;
    } catch (error) {
      console.error(`Invalid condition: ${conditionStr}`, error);
      // Return a function that always returns true if the condition is invalid
      return () => true;
    }
  }
  
  /**
   * Format the result of the command chain execution
   * @param result The result of the command chain execution
   * @returns Formatted output string
   */
  private formatResult(result: any): string {
    let output = `Command Chain ${result.success ? 'Succeeded' : 'Failed'}\n\n`;
    
    result.results.forEach((cmdResult: any, index: number) => {
      output += `Command ${index + 1}: ${cmdResult.command}\n`;
      output += `Status: ${cmdResult.success ? 'Success' : 'Failed'}\n`;
      if (cmdResult.exitCode !== undefined) {
        output += `Exit Code: ${cmdResult.exitCode}\n`;
      }
      if (cmdResult.error) {
        output += `Error: ${cmdResult.error}\n`;
      }
      output += `Output:\n${cmdResult.output}\n\n`;
    });
    
    return output;
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
            commands: {
              type: 'array',
              description: 'Array of commands to execute in sequence',
              items: {
                type: 'object',
                properties: {
                  command: {
                    type: 'string',
                    description: 'The command to execute'
                  },
                  args: {
                    type: 'array',
                    items: {
                      type: 'string'
                    },
                    description: 'Arguments for the command'
                  },
                  condition: {
                    type: 'string',
                    description: 'JavaScript condition to evaluate (has access to prevOutput and prevExitCode)'
                  },
                  continueOnError: {
                    type: 'boolean',
                    description: 'Whether to continue chain if this command fails'
                  }
                },
                required: ['command']
              }
            },
            timeout: {
              type: 'number',
              description: 'Timeout in seconds for each command (default: 120)',
              default: 120
            }
          },
          required: ['commands']
        }
      }
    };
  }
}
