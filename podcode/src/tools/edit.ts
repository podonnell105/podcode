import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { Tool, ToolContext, ToolResult } from './types.js';
import { validatePathOrError } from './security.js';

const EditParametersSchema = z.object({
  path: z.string().describe('Path to the file to edit'),
  old_text: z.string().describe('The exact text to replace'),
  new_text: z.string().describe('The text to replace it with'),
  replace_all: z.boolean().optional().default(false).describe('Replace all occurrences (default: false)')
});

export class EditTool implements Tool {
  name = 'edit_file';
  description = 'Edit a file by replacing specific text. Useful for making precise changes to existing files.';
  parameters = EditParametersSchema;

  async execute(args: z.infer<typeof EditParametersSchema>, context: ToolContext): Promise<ToolResult> {
    const { path, old_text, new_text, replace_all } = args;
    
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

      const content = readFileSync(fullPath, 'utf-8');
      
      if (!content.includes(old_text)) {
        return {
          success: false,
          output: '',
          error: `Text not found in file: "${old_text}"`
        };
      }

      let newContent: string;
      let replacementCount: number;

      if (replace_all) {
        newContent = content.replaceAll(old_text, new_text);
        replacementCount = (content.match(new RegExp(old_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      } else {
        newContent = content.replace(old_text, new_text);
        replacementCount = 1;
      }

      writeFileSync(fullPath, newContent, 'utf-8');

      return {
        success: true,
        output: `Successfully replaced ${replacementCount} occurrence(s) in ${path}`
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to edit file: ${error instanceof Error ? error.message : String(error)}`
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
              description: 'Path to the file to edit'
            },
            old_text: {
              type: 'string',
              description: 'The exact text to replace'
            },
            new_text: {
              type: 'string',
              description: 'The text to replace it with'
            },
            replace_all: {
              type: 'boolean',
              description: 'Replace all occurrences (default: false)',
              default: false
            }
          },
          required: ['path', 'old_text', 'new_text']
        }
      }
    };
  }
}

