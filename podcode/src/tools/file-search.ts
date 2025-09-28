import { z } from 'zod';
import { Tool, ToolContext, ToolResult } from './types.js';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

export class FileSearchTool implements Tool {
  name = 'file_search';
  description = 'Fast file search based on fuzzy matching against file path. Use if you know part of the file path but don\'t know where it\'s located exactly.';
  parameters = z.object({
    query: z.string().describe('Fuzzy filename to search for'),
    directory: z.string().optional().describe('Directory to search in (defaults to current directory)'),
    max_results: z.number().default(10).describe('Maximum number of results to return'),
    include_hidden: z.boolean().default(false).describe('Whether to include hidden files and directories'),
    working_directory: z.string().optional().describe('Working directory for relative paths')
  });

  async execute(args: any, context: ToolContext): Promise<ToolResult> {
    try {
      const { 
        query, 
        directory = '.', 
        max_results = 10,
        include_hidden = false,
        working_directory = context.workingDirectory 
      } = args;

      const searchDir = resolve(working_directory, directory);
      const results: string[] = [];

      // Simple fuzzy search function
      const fuzzyMatch = (filename: string, query: string): boolean => {
        const lowerFilename = filename.toLowerCase();
        const lowerQuery = query.toLowerCase();
        
        // Exact match
        if (lowerFilename.includes(lowerQuery)) {
          return true;
        }
        
        // Fuzzy match - check if all characters in query appear in order
        let queryIndex = 0;
        for (let i = 0; i < lowerFilename.length && queryIndex < lowerQuery.length; i++) {
          if (lowerFilename[i] === lowerQuery[queryIndex]) {
            queryIndex++;
          }
        }
        
        return queryIndex === lowerQuery.length;
      };

      // Recursive search function
      const searchRecursive = (dir: string, depth: number = 0): void => {
        if (depth > 10) return; // Prevent infinite recursion
        
        try {
          const entries = readdirSync(dir);
          
          for (const entry of entries) {
            // Skip hidden files if not requested
            if (!include_hidden && entry.startsWith('.')) {
              continue;
            }
            
            const fullPath = join(dir, entry);
            const relativePath = fullPath.replace(working_directory + '/', '');
            
            try {
              const stats = statSync(fullPath);
              
              if (stats.isDirectory()) {
                // Check if directory name matches
                if (fuzzyMatch(entry, query)) {
                  results.push(`${relativePath}/`);
                }
                
                // Search inside directory
                searchRecursive(fullPath, depth + 1);
              } else if (stats.isFile()) {
                // Check if file name matches
                if (fuzzyMatch(entry, query)) {
                  results.push(relativePath);
                }
              }
            } catch (error) {
              // Skip files/directories we can't access
              continue;
            }
            
            // Limit results
            if (results.length >= max_results) {
              return;
            }
          }
        } catch (error) {
          // Skip directories we can't read
          return;
        }
      };

      // Start search
      searchRecursive(searchDir);

      if (results.length === 0) {
        return {
          success: true,
          output: `🔍 No files found matching "${query}"`
        };
      }

      const resultList = results.map((result, index) => `${index + 1}. ${result}`).join('\n');
      
      return {
        success: true,
        output: `🔍 File Search Results for "${query}":\n${resultList}`
      };

    } catch (error) {
      return {
        success: false,
        output: '',
        error: `File search error: ${error instanceof Error ? error.message : String(error)}`
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
            query: {
              type: 'string',
              description: 'Fuzzy filename to search for'
            },
            directory: {
              type: 'string',
              description: 'Directory to search in (defaults to current directory)'
            },
            max_results: {
              type: 'number',
              default: 10,
              description: 'Maximum number of results to return'
            },
            include_hidden: {
              type: 'boolean',
              default: false,
              description: 'Whether to include hidden files and directories'
            },
            working_directory: {
              type: 'string',
              description: 'Working directory for relative paths'
            }
          },
          required: ['query']
        }
      }
    };
  }
}
