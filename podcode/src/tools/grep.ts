import { z } from 'zod';
import { Tool, ToolContext, ToolResult } from './types.js';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { execSync } from 'child_process';

export class GrepTool implements Tool {
  name = 'grep';
  description = 'Search for text patterns in files using grep. Fast text-based regex search that finds exact pattern matches within files or directories.';
  parameters = z.object({
    pattern: z.string().describe('The regex pattern to search for'),
    path: z.string().optional().describe('File or directory to search in (defaults to current directory)'),
    include_pattern: z.string().optional().describe('Glob pattern for files to include (e.g. "*.js", "*.{ts,tsx}")'),
    exclude_pattern: z.string().optional().describe('Glob pattern for files to exclude'),
    case_sensitive: z.boolean().default(false).describe('Whether the search should be case sensitive'),
    context_lines: z.number().default(0).describe('Number of context lines to show before and after matches'),
    working_directory: z.string().optional().describe('Working directory for relative paths')
  });

  async execute(args: any, context: ToolContext): Promise<ToolResult> {
    try {
      const { 
        pattern, 
        path = '.', 
        include_pattern, 
        exclude_pattern, 
        case_sensitive = false,
        context_lines = 0,
        working_directory = context.workingDirectory 
      } = args;

      // Build grep command
      let grepCommand = 'grep';
      
      // Add flags
      if (!case_sensitive) {
        grepCommand += ' -i';
      }
      
      if (context_lines > 0) {
        grepCommand += ` -C ${context_lines}`;
      }
      
      // Add recursive flag for directories
      grepCommand += ' -r';
      
      // Add line numbers
      grepCommand += ' -n';
      
      // Add color for better readability
      grepCommand += ' --color=always';
      
      // Add include/exclude patterns
      if (include_pattern) {
        grepCommand += ` --include="${include_pattern}"`;
      }
      
      if (exclude_pattern) {
        grepCommand += ` --exclude="${exclude_pattern}"`;
      }
      
      // Add pattern and path
      grepCommand += ` "${pattern}" "${path}"`;
      
      // Execute grep command
      const result = execSync(grepCommand, {
        cwd: working_directory,
        encoding: 'utf8',
        stdio: 'pipe',
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      return {
        success: true,
        output: `🔍 Grep Results for pattern "${pattern}":\n${result}`
      };

    } catch (error: any) {
      // Handle grep errors (no matches, etc.)
      if (error.status === 1) {
        return {
          success: true,
          output: `🔍 No matches found for pattern "${args.pattern}"`
        };
      }
      
      return {
        success: false,
        output: '',
        error: `Grep error: ${error.message || 'Unknown error'}`
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
            pattern: {
              type: 'string',
              description: 'The regex pattern to search for'
            },
            path: {
              type: 'string',
              description: 'File or directory to search in (defaults to current directory)'
            },
            include_pattern: {
              type: 'string',
              description: 'Glob pattern for files to include (e.g. "*.js", "*.{ts,tsx}")'
            },
            exclude_pattern: {
              type: 'string',
              description: 'Glob pattern for files to exclude'
            },
            case_sensitive: {
              type: 'boolean',
              default: false,
              description: 'Whether the search should be case sensitive'
            },
            context_lines: {
              type: 'number',
              default: 0,
              description: 'Number of context lines to show before and after matches'
            },
            working_directory: {
              type: 'string',
              description: 'Working directory for relative paths'
            }
          },
          required: ['pattern']
        }
      }
    };
  }
}
