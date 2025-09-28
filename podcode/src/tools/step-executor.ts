import { z } from 'zod';
import { Tool, ToolContext, ToolResult } from './types.js';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

interface Step {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface StepQueue {
  id: string;
  title: string;
  steps: Step[];
  currentStepIndex: number;
  status: 'active' | 'completed' | 'failed' | 'paused';
  createdAt: Date;
  updatedAt: Date;
}

class StepQueueManager {
  private queues: Map<string, StepQueue> = new Map();
  private nextId = 1;

  createQueue(title: string, steps: string[]): StepQueue {
    const id = `queue_${this.nextId++}`;
    const queue: StepQueue = {
      id,
      title,
      steps: steps.map((content, index) => ({
        id: `step_${id}_${index}`,
        content,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      })),
      currentStepIndex: 0,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.queues.set(id, queue);
    return queue;
  }

  getQueue(id: string): StepQueue | undefined {
    return this.queues.get(id);
  }

  getActiveQueues(): StepQueue[] {
    return Array.from(this.queues.values()).filter(q => q.status === 'active');
  }

  updateStepStatus(queueId: string, stepId: string, status: Step['status'], result?: any, error?: string): boolean {
    const queue = this.queues.get(queueId);
    if (!queue) return false;

    const step = queue.steps.find(s => s.id === stepId);
    if (!step) return false;

    step.status = status;
    step.result = result;
    step.error = error;
    step.updatedAt = new Date();
    queue.updatedAt = new Date();

    // Update queue status based on step status
    if (status === 'failed') {
      queue.status = 'failed';
    } else if (status === 'completed') {
      // Check if all steps are completed
      const allCompleted = queue.steps.every(s => s.status === 'completed');
      if (allCompleted) {
        queue.status = 'completed';
      }
    }

    return true;
  }

  getNextStep(queueId: string): Step | null {
    const queue = this.queues.get(queueId);
    if (!queue || queue.status !== 'active') return null;

    const nextStep = queue.steps[queue.currentStepIndex];
    if (!nextStep || nextStep.status !== 'pending') return null;

    return nextStep;
  }

  advanceToNextStep(queueId: string): boolean {
    const queue = this.queues.get(queueId);
    if (!queue || queue.status !== 'active') return false;

    queue.currentStepIndex++;
    queue.updatedAt = new Date();
    return true;
  }

  pauseQueue(queueId: string): boolean {
    const queue = this.queues.get(queueId);
    if (!queue) return false;

    queue.status = 'paused';
    queue.updatedAt = new Date();
    return true;
  }

  resumeQueue(queueId: string): boolean {
    const queue = this.queues.get(queueId);
    if (!queue) return false;

    queue.status = 'active';
    queue.updatedAt = new Date();
    return true;
  }

  removeQueue(id: string): boolean {
    return this.queues.delete(id);
  }

  getQueueStats() {
    const queues = Array.from(this.queues.values());
    return {
      total: queues.length,
      active: queues.filter(q => q.status === 'active').length,
      completed: queues.filter(q => q.status === 'completed').length,
      failed: queues.filter(q => q.status === 'failed').length,
      paused: queues.filter(q => q.status === 'paused').length
    };
  }
}

// Global step queue manager instance
const stepQueueManager = new StepQueueManager();

export class StepExecutorTool implements Tool {
  name = 'step_executor';
  description = 'Execute steps from a plan in a controlled queue system. This tool manages step execution to prevent 400 errors and ensure proper tool call handling.';
  parameters = z.object({
    action: z.enum(['create_queue', 'get_next_step', 'update_step', 'get_queue_status', 'list_queues', 'pause_queue', 'resume_queue', 'remove_queue']).describe('The action to perform'),
    queueId: z.string().optional().describe('Queue ID (required for most actions)'),
    title: z.string().optional().describe('Queue title (required for create_queue)'),
    steps: z.array(z.string()).optional().describe('Array of step descriptions (required for create_queue)'),
    stepId: z.string().optional().describe('Step ID (required for update_step)'),
    status: z.enum(['pending', 'in_progress', 'completed', 'failed']).optional().describe('Step status (required for update_step)'),
    result: z.string().optional().describe('Step execution result (optional for update_step)'),
    error: z.string().optional().describe('Step execution error (optional for update_step)')
  });

  async execute(args: any, context: ToolContext): Promise<ToolResult> {
    try {
      const { action, queueId, title, steps, stepId, status, result, error } = args;

      switch (action) {
        case 'create_queue':
          if (!title || !steps || !Array.isArray(steps)) {
            return {
              success: false,
              output: '',
              error: 'Title and steps array are required for create_queue action'
            };
          }
          const queue = stepQueueManager.createQueue(title, steps);
          return {
            success: true,
            output: `✅ Created step queue: "${title}" with ${steps.length} steps (ID: ${queue.id})`,
            metadata: {
              queueId: queue.id,
              stepCount: steps.length
            }
          };

        case 'get_next_step':
          if (!queueId) {
            return {
              success: false,
              output: '',
              error: 'Queue ID is required for get_next_step action'
            };
          }
          const nextStep = stepQueueManager.getNextStep(queueId);
          if (!nextStep) {
            return {
              success: true,
              output: `📋 No pending steps in queue ${queueId}`
            };
          }
          return {
            success: true,
            output: `📋 Next step: ${nextStep.content}`,
            metadata: {
              stepId: nextStep.id,
              stepContent: nextStep.content,
              queueId: queueId
            }
          };

        case 'update_step':
          if (!queueId || !stepId || !status) {
            return {
              success: false,
              output: '',
              error: 'Queue ID, step ID, and status are required for update_step action'
            };
          }
          const updated = stepQueueManager.updateStepStatus(queueId, stepId, status, result, error);
          if (!updated) {
            return {
              success: false,
              output: '',
              error: `Failed to update step ${stepId} in queue ${queueId}`
            };
          }
          return {
            success: true,
            output: `✅ Updated step ${stepId} to status: ${status}`
          };

        case 'get_queue_status':
          if (!queueId) {
            return {
              success: false,
              output: '',
              error: 'Queue ID is required for get_queue_status action'
            };
          }
          const queueStatus = stepQueueManager.getQueue(queueId);
          if (!queueStatus) {
            return {
              success: false,
              output: '',
              error: `Queue ${queueId} not found`
            };
          }
          
          const stepStatuses = queueStatus.steps.map(step => {
            const statusEmoji = {
              pending: '⏳',
              in_progress: '🔄',
              completed: '✅',
              failed: '❌'
            }[step.status];
            return `${statusEmoji} ${step.content}`;
          }).join('\n');

          return {
            success: true,
            output: `📊 Queue Status: ${queueStatus.title}\nStatus: ${queueStatus.status}\nCurrent Step: ${queueStatus.currentStepIndex + 1}/${queueStatus.steps.length}\n\nSteps:\n${stepStatuses}`
          };

        case 'list_queues':
          const activeQueues = stepQueueManager.getActiveQueues();
          if (activeQueues.length === 0) {
            return {
              success: true,
              output: '📋 No active step queues'
            };
          }
          
          const queueList = activeQueues.map(q => {
            const completedSteps = q.steps.filter(s => s.status === 'completed').length;
            return `🔄 [${q.id}] ${q.title} (${completedSteps}/${q.steps.length} completed)`;
          }).join('\n');

          return {
            success: true,
            output: `📋 Active Step Queues:\n${queueList}`
          };

        case 'pause_queue':
          if (!queueId) {
            return {
              success: false,
              output: '',
              error: 'Queue ID is required for pause_queue action'
            };
          }
          const paused = stepQueueManager.pauseQueue(queueId);
          if (!paused) {
            return {
              success: false,
              output: '',
              error: `Failed to pause queue ${queueId}`
            };
          }
          return {
            success: true,
            output: `⏸️ Paused queue ${queueId}`
          };

        case 'resume_queue':
          if (!queueId) {
            return {
              success: false,
              output: '',
              error: 'Queue ID is required for resume_queue action'
            };
          }
          const resumed = stepQueueManager.resumeQueue(queueId);
          if (!resumed) {
            return {
              success: false,
              output: '',
              error: `Failed to resume queue ${queueId}`
            };
          }
          return {
            success: true,
            output: `▶️ Resumed queue ${queueId}`
          };

        case 'remove_queue':
          if (!queueId) {
            return {
              success: false,
              output: '',
              error: 'Queue ID is required for remove_queue action'
            };
          }
          const removed = stepQueueManager.removeQueue(queueId);
          if (!removed) {
            return {
              success: false,
              output: '',
              error: `Queue ${queueId} not found`
            };
          }
          return {
            success: true,
            output: `🗑️ Removed queue ${queueId}`
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
        error: `StepExecutor error: ${error instanceof Error ? error.message : String(error)}`
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
              enum: ['create_queue', 'get_next_step', 'update_step', 'get_queue_status', 'list_queues', 'pause_queue', 'resume_queue', 'remove_queue'],
              description: 'The action to perform'
            },
            queueId: {
              type: 'string',
              description: 'Queue ID (required for most actions)'
            },
            title: {
              type: 'string',
              description: 'Queue title (required for create_queue)'
            },
            steps: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of step descriptions (required for create_queue)'
            },
            stepId: {
              type: 'string',
              description: 'Step ID (required for update_step)'
            },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed', 'failed'],
              description: 'Step status (required for update_step)'
            },
            result: {
              type: 'string',
              description: 'Step execution result (optional for update_step)'
            },
            error: {
              type: 'string',
              description: 'Step execution error (optional for update_step)'
            }
          },
          required: ['action']
        }
      }
    };
  }
}

export const stepExecutorTool = new StepExecutorTool();
