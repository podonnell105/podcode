import { z } from 'zod';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { Tool, ToolContext, ToolResult } from './types.js';
import { validatePathOrError } from './security.js';

const WriteParametersSchema = z.object({
  path: z.string().describe('Path to the file to write'),
  content: z.string().describe('Content to write to the file'),
  create_dirs: z.boolean().optional().default(true).describe('Create parent directories if they don\'t exist')
});

export class WriteTool implements Tool {
  name = 'write_file';
  description = 'Write content to a file. Will create the file if it doesn\'t exist and optionally create parent directories.';
  parameters = WriteParametersSchema;

  async execute(args: z.infer<typeof WriteParametersSchema>, context: ToolContext): Promise<ToolResult> {
    const { path, content, create_dirs } = args;
    
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
      
      if (create_dirs) {
        const dir = dirname(fullPath);
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(fullPath, content, 'utf-8');

      return {
        success: true,
        output: `Successfully wrote ${content.length} characters to ${path}`
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`
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
              description: 'Path to the file to write'
            },
            content: {
              type: 'string',
              description: 'Content to write to the file'
            },
            create_dirs: {
              type: 'boolean',
              description: 'Create parent directories if they don\'t exist',
              default: true
            }
          },
          required: ['path', 'content']
        }
      }
    };
  }
}

