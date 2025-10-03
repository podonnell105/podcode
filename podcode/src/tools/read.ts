import { z } from 'zod';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { Tool, ToolContext, ToolResult } from './types.js';
import { validatePathOrError } from './security.js';

const ReadParametersSchema = z.object({
  path: z.string().describe('Path to the file to read'),
  startLine: z.number().optional().describe('Start reading from this line number (1-indexed)'),
  endLine: z.number().optional().describe('Stop reading at this line number (1-indexed)')
});

export class ReadTool implements Tool {
  name = 'read_file';
  description = 'Read the contents of a file. Can optionally specify line ranges to read only part of a file.';
  parameters = ReadParametersSchema;

  async execute(args: z.infer<typeof ReadParametersSchema>, context: ToolContext): Promise<ToolResult> {
    const { path, startLine, endLine } = args;
    
    // Security validation - check if path is safe
    const pathValidation = validatePathOrError(path, context.workingDirectory);
    if (!pathValidation.success) {
      return {
        success: false,
        output: '',
        error: pathValidation.error
      };
    }
    
    try {
      const fullPath = resolve(context.workingDirectory, path);
      
      if (!existsSync(fullPath)) {
        return {
          success: false,
          output: '',
          error: `File not found: ${path}`
        };
      }

      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        return {
          success: false,
          output: '',
          error: `Path is a directory, not a file: ${path}`
        };
      }

      let content = readFileSync(fullPath, 'utf-8');
      
      if (startLine !== undefined || endLine !== undefined) {
        const lines = content.split('\n');
        const start = startLine ? Math.max(0, startLine - 1) : 0;
        const end = endLine ? Math.min(lines.length, endLine) : lines.length;
        content = lines.slice(start, end).join('\n');
      }

      return {
        success: true,
        output: content
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`
      };
    }
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
            path: {
              type: 'string',
              description: 'Path to the file to read'
            },
            startLine: {
              type: 'number',
              description: 'Start reading from this line number (1-indexed)'
            },
            endLine: {
              type: 'number',
              description: 'Stop reading at this line number (1-indexed)'
            }
          },
          required: ['path']
        }
      }
    };
  }
}

