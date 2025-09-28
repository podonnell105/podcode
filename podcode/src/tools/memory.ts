import { z } from 'zod';
import { Tool, ToolContext, ToolResult } from './types.js';
import { memoryManager } from '../memory/manager.js';

const MemorySearchParametersSchema = z.object({
  task: z.string().optional().describe('Search for sessions related to this task'),
  toolName: z.string().optional().describe('Search for sessions that used this tool'),
  success: z.boolean().optional().describe('Filter by success status (true/false)'),
  tags: z.array(z.string()).optional().describe('Filter by session tags'),
  limit: z.number().optional().default(10).describe('Maximum number of results to return')
});

export class MemorySearchTool implements Tool {
  name = 'search_memory';
  description = 'Search through previous session history to find similar tasks, successful patterns, and learn from past attempts. Use this to understand what has worked before and avoid repeating mistakes.';
  parameters = MemorySearchParametersSchema;

  async execute(args: z.infer<typeof MemorySearchParametersSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const results = memoryManager.searchMemory(args);
      
      if (results.length === 0) {
        return {
          success: true,
          output: 'No previous sessions found matching the search criteria.'
        };
      }

      let output = `Found ${results.length} relevant previous sessions:\n\n`;
      
      results.forEach((result, index) => {
        const session = result.session;
        output += `${index + 1}. **${session.title}** (${session.success ? '✅ Success' : '❌ Failed'})\n`;
        output += `   - Created: ${session.createdAt.toLocaleDateString()}\n`;
        output += `   - Tags: ${session.tags.join(', ')}\n`;
        output += `   - Tool calls: ${session.metadata.totalToolCalls} (${session.metadata.successfulToolCalls} successful)\n`;
        
        if (result.matchingToolExecutions.length > 0) {
          output += `   - Relevant tool executions:\n`;
          result.matchingToolExecutions.slice(0, 3).forEach(exec => {
            output += `     • ${exec.toolName}: ${exec.result.success ? '✅' : '❌'} ${exec.result.output.substring(0, 100)}...\n`;
          });
        }
        
        if (session.metadata.lastError) {
          output += `   - Last error: ${session.metadata.lastError}\n`;
        }
        
        output += '\n';
      });

      return {
        success: true,
        output
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to search memory: ${error instanceof Error ? error.message : String(error)}`
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
            task: {
              type: 'string',
              description: 'Search for sessions related to this task'
            },
            toolName: {
              type: 'string',
              description: 'Search for sessions that used this tool'
            },
            success: {
              type: 'boolean',
              description: 'Filter by success status (true/false)'
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by session tags'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return',
              default: 10
            }
          }
        }
      }
    };
  }
}

const MemoryStatsParametersSchema = z.object({
  includeDetails: z.boolean().optional().default(false).describe('Include detailed breakdown of memory usage')
});

export class MemoryStatsTool implements Tool {
  name = 'memory_stats';
  description = 'Get statistics about stored session history and memory usage. Use this to understand how much historical data is available.';
  parameters = MemoryStatsParametersSchema;

  async execute(args: z.infer<typeof MemoryStatsParametersSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const stats = memoryManager.getStorageStats();
      const sessions = memoryManager.listSessions();
      
      let output = `📊 Memory Statistics:\n\n`;
      output += `• Total Sessions: ${stats.totalSessions}\n`;
      output += `• Total Messages: ${stats.totalMessages}\n`;
      output += `• Total Tool Executions: ${stats.totalToolExecutions}\n`;
      output += `• Storage Size: ${(stats.storageSize / 1024).toFixed(2)} KB\n\n`;

      if (args.includeDetails && sessions.length > 0) {
        output += `📈 Session Breakdown:\n`;
        
        const successfulSessions = sessions.filter(s => s.success).length;
        const failedSessions = sessions.filter(s => !s.success).length;
        
        output += `• Successful: ${successfulSessions} (${((successfulSessions / sessions.length) * 100).toFixed(1)}%)\n`;
        output += `• Failed: ${failedSessions} (${((failedSessions / sessions.length) * 100).toFixed(1)}%)\n\n`;

        // Most common tags
        const tagCounts = new Map<string, number>();
        sessions.forEach(session => {
          session.tags.forEach(tag => {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
          });
        });

        if (tagCounts.size > 0) {
          output += `🏷️ Most Common Tags:\n`;
          Array.from(tagCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .forEach(([tag, count]) => {
              output += `• ${tag}: ${count} sessions\n`;
            });
        }

        // Recent sessions
        output += `\n📅 Recent Sessions:\n`;
        sessions.slice(0, 5).forEach(session => {
          output += `• ${session.title} (${session.success ? '✅' : '❌'}) - ${session.updatedAt.toLocaleDateString()}\n`;
        });
      }

      return {
        success: true,
        output
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to get memory stats: ${error instanceof Error ? error.message : String(error)}`
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
            includeDetails: {
              type: 'boolean',
              description: 'Include detailed breakdown of memory usage',
              default: false
            }
          }
        }
      }
    };
  }
}

const MemoryListParametersSchema = z.object({
  limit: z.number().optional().default(10).describe('Maximum number of sessions to list'),
  showDetails: z.boolean().optional().default(false).describe('Show detailed information for each session')
});

export class MemoryListTool implements Tool {
  name = 'list_sessions';
  description = 'List all stored sessions with their status and basic information. Use this to see what tasks have been attempted before.';
  parameters = MemoryListParametersSchema;

  async execute(args: z.infer<typeof MemoryListParametersSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const sessions = memoryManager.listSessions().slice(0, args.limit);
      
      if (sessions.length === 0) {
        return {
          success: true,
          output: 'No sessions found in memory.'
        };
      }

      let output = `📋 Recent Sessions (${sessions.length}):\n\n`;
      
      sessions.forEach((session, index) => {
        output += `${index + 1}. **${session.title}**\n`;
        output += `   - Status: ${session.success ? '✅ Success' : '❌ Failed'}\n`;
        output += `   - Created: ${session.createdAt.toLocaleDateString()}\n`;
        output += `   - Updated: ${session.updatedAt.toLocaleDateString()}\n`;
        output += `   - Tags: ${session.tags.join(', ')}\n`;
        output += `   - Tool calls: ${session.metadata.totalToolCalls}\n`;
        
        if (args.showDetails) {
          output += `   - Messages: ${session.messages.length}\n`;
          output += `   - Working directory: ${session.workingDirectory}\n`;
          if (session.description) {
            output += `   - Description: ${session.description}\n`;
          }
          if (session.metadata.lastError) {
            output += `   - Last error: ${session.metadata.lastError}\n`;
          }
        }
        
        output += '\n';
      });

      return {
        success: true,
        output
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to list sessions: ${error instanceof Error ? error.message : String(error)}`
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
            limit: {
              type: 'number',
              description: 'Maximum number of sessions to list',
              default: 10
            },
            showDetails: {
              type: 'boolean',
              description: 'Show detailed information for each session',
              default: false
            }
          }
        }
      }
    };
  }
}

