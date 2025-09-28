import { z } from 'zod';
import { Tool, ToolContext, ToolResult } from './types.js';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

class TodoManager {
  private todos: Map<string, TodoItem> = new Map();
  private nextId = 1;

  addTodo(content: string): TodoItem {
    const id = `todo_${this.nextId++}`;
    const todo: TodoItem = {
      id,
      content,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.todos.set(id, todo);
    return todo;
  }

  updateTodoStatus(id: string, status: TodoItem['status']): boolean {
    const todo = this.todos.get(id);
    if (!todo) return false;
    
    todo.status = status;
    todo.updatedAt = new Date();
    return true;
  }

  getTodos(): TodoItem[] {
    return Array.from(this.todos.values()).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  getTodosByStatus(status: TodoItem['status']): TodoItem[] {
    return this.getTodos().filter(todo => todo.status === status);
  }

  clearCompleted(): number {
    const completedTodos = this.getTodosByStatus('completed');
    completedTodos.forEach(todo => this.todos.delete(todo.id));
    return completedTodos.length;
  }

  getStats() {
    const todos = this.getTodos();
    return {
      total: todos.length,
      pending: todos.filter(t => t.status === 'pending').length,
      in_progress: todos.filter(t => t.status === 'in_progress').length,
      completed: todos.filter(t => t.status === 'completed').length,
      cancelled: todos.filter(t => t.status === 'cancelled').length
    };
  }
}

// Global todo manager instance
const todoManager = new TodoManager();

export class TodoWriteTool implements Tool {
  name = 'todo_write';
  description = 'Add, update, or manage todo items for task tracking and planning. Use this tool VERY frequently to ensure you are tracking your tasks and giving the user visibility into your progress.';
  parameters = z.object({
    action: z.enum(['add', 'update', 'list', 'clear_completed', 'stats']).describe('The action to perform'),
    content: z.string().optional().describe('Todo content (required for add action)'),
    id: z.string().optional().describe('Todo ID (required for update action)'),
    status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional().describe('New status (required for update action)'),
    filter_status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional().describe('Filter todos by status (for list action)')
  });

  async execute(args: any, context: ToolContext): Promise<ToolResult> {
    try {
      const { action, content, id, status, filter_status } = args;

      switch (action) {
        case 'add':
          if (!content) {
            return {
              success: false,
              output: '',
              error: 'Content is required for add action'
            };
          }
          const newTodo = todoManager.addTodo(content);
          return {
            success: true,
            output: `✅ Added todo: "${content}" (ID: ${newTodo.id})`,
            metadata: {
              autoExecute: true,
              todoId: newTodo.id,
              todoContent: content
            }
          };

        case 'update':
          if (!id || !status) {
            return {
              success: false,
              output: '',
              error: 'ID and status are required for update action'
            };
          }
          const updated = todoManager.updateTodoStatus(id, status);
          if (!updated) {
            return {
              success: false,
              output: '',
              error: `Todo with ID ${id} not found`
            };
          }
          return {
            success: true,
            output: `✅ Updated todo ${id} to status: ${status}`
          };

        case 'list':
          const todos = filter_status 
            ? todoManager.getTodosByStatus(filter_status)
            : todoManager.getTodos();
          
          if (todos.length === 0) {
            return {
              success: true,
              output: `📋 No todos found${filter_status ? ` with status: ${filter_status}` : ''}`
            };
          }

          const todoList = todos.map(todo => {
            const statusEmoji = {
              pending: '⏳',
              in_progress: '🔄',
              completed: '✅',
              cancelled: '❌'
            }[todo.status];
            
            return `${statusEmoji} [${todo.id}] ${todo.content}`;
          }).join('\n');

          return {
            success: true,
            output: `📋 Todo List${filter_status ? ` (${filter_status})` : ''}:\n${todoList}`
          };

        case 'clear_completed':
          const clearedCount = todoManager.clearCompleted();
          return {
            success: true,
            output: `🧹 Cleared ${clearedCount} completed todos`
          };

        case 'stats':
          const stats = todoManager.getStats();
          return {
            success: true,
            output: `📊 Todo Statistics:\n` +
                   `  Total: ${stats.total}\n` +
                   `  Pending: ${stats.pending}\n` +
                   `  In Progress: ${stats.in_progress}\n` +
                   `  Completed: ${stats.completed}\n` +
                   `  Cancelled: ${stats.cancelled}`
          };

        default:
          return {
            success: false,
            output: '',
            error: `Unknown action: ${action}`
          };
      }
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `TodoWrite error: ${error instanceof Error ? error.message : String(error)}`
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
            action: {
              type: 'string',
              enum: ['add', 'update', 'list', 'clear_completed', 'stats'],
              description: 'The action to perform'
            },
            content: {
              type: 'string',
              description: 'Todo content (required for add action)'
            },
            id: {
              type: 'string',
              description: 'Todo ID (required for update action)'
            },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed', 'cancelled'],
              description: 'New status (required for update action)'
            },
            filter_status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed', 'cancelled'],
              description: 'Filter todos by status (for list action)'
            }
          },
          required: ['action']
        }
      }
    };
  }
}
