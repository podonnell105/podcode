import { z } from 'zod';
import { Tool, ToolContext, ToolResult } from './types.js';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

interface SpecializedAgent {
  name: string;
  description: string;
  capabilities: string[];
  tools: string[];
}

const SPECIALIZED_AGENTS: SpecializedAgent[] = [
  {
    name: 'code_reviewer',
    description: 'Specialized in reviewing code for quality, security, and best practices',
    capabilities: [
      'Code quality analysis',
      'Security vulnerability detection',
      'Performance optimization suggestions',
      'Best practices enforcement',
      'Documentation review'
    ],
    tools: ['read_file', 'grep_search', 'bash']
  },
  {
    name: 'security_analyst',
    description: 'Specialized in security analysis and vulnerability assessment',
    capabilities: [
      'Security vulnerability scanning',
      'Dependency analysis',
      'Configuration security review',
      'Threat modeling',
      'Security best practices'
    ],
    tools: ['read_file', 'grep_search', 'bash', 'webfetch']
  },
  {
    name: 'performance_optimizer',
    description: 'Specialized in performance analysis and optimization',
    capabilities: [
      'Performance profiling',
      'Bottleneck identification',
      'Memory usage analysis',
      'Database query optimization',
      'Caching strategies'
    ],
    tools: ['read_file', 'bash', 'grep_search']
  },
  {
    name: 'documentation_writer',
    description: 'Specialized in creating and maintaining documentation',
    capabilities: [
      'API documentation generation',
      'README creation',
      'Code comments and docstrings',
      'Architecture documentation',
      'User guides and tutorials'
    ],
    tools: ['read_file', 'write_file', 'edit_file']
  },
  {
    name: 'test_engineer',
    description: 'Specialized in testing strategies and test implementation',
    capabilities: [
      'Test case design',
      'Unit test implementation',
      'Integration testing',
      'Test coverage analysis',
      'Automated testing setup'
    ],
    tools: ['read_file', 'write_file', 'bash', 'grep_search']
  },
  {
    name: 'devops_engineer',
    description: 'Specialized in DevOps practices and infrastructure',
    capabilities: [
      'CI/CD pipeline setup',
      'Docker containerization',
      'Infrastructure as Code',
      'Monitoring and logging',
      'Deployment automation'
    ],
    tools: ['bash', 'read_file', 'write_file', 'webfetch']
  },
  {
    name: 'database_administrator',
    description: 'Specialized in database design and optimization',
    capabilities: [
      'Database schema design',
      'Query optimization',
      'Index management',
      'Data migration',
      'Database security'
    ],
    tools: ['read_file', 'write_file', 'bash', 'grep_search']
  },
  {
    name: 'frontend_developer',
    description: 'Specialized in frontend development and user experience',
    capabilities: [
      'UI/UX implementation',
      'Responsive design',
      'Performance optimization',
      'Accessibility compliance',
      'Modern framework usage'
    ],
    tools: ['read_file', 'write_file', 'edit_file', 'bash']
  },
  {
    name: 'backend_developer',
    description: 'Specialized in backend development and API design',
    capabilities: [
      'API design and implementation',
      'Server architecture',
      'Data processing',
      'Authentication and authorization',
      'Microservices architecture'
    ],
    tools: ['read_file', 'write_file', 'bash', 'grep_search']
  },
  {
    name: 'mobile_developer',
    description: 'Specialized in mobile application development',
    capabilities: [
      'Mobile app architecture',
      'Platform-specific optimization',
      'Cross-platform development',
      'Mobile UI/UX',
      'App store deployment'
    ],
    tools: ['read_file', 'write_file', 'bash', 'grep_search']
  }
];

export class TaskTool implements Tool {
  name = 'task';
  description = 'Delegate tasks to specialized agents based on the task type. Use this tool when the task matches a specialized agent\'s capabilities for more focused and expert assistance.';
  parameters = z.object({
    agent: z.string().describe('The specialized agent to use (e.g., code_reviewer, security_analyst, etc.)'),
    task_description: z.string().describe('Detailed description of the task to be performed'),
    context: z.string().optional().describe('Additional context about the current project or situation'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium').describe('Task priority level')
  });

  async execute(args: any, context: ToolContext): Promise<ToolResult> {
    try {
      const { agent, task_description, context: taskContext, priority = 'medium' } = args;

      // Find the specialized agent
      const specializedAgent = SPECIALIZED_AGENTS.find(a => a.name === agent);
      
      if (!specializedAgent) {
        const availableAgents = SPECIALIZED_AGENTS.map(a => `- ${a.name}: ${a.description}`).join('\n');
        return {
          success: false,
          output: '',
          error: `Unknown agent: ${agent}\n\nAvailable agents:\n${availableAgents}`
        };
      }

      // Create a detailed task assignment
      const taskAssignment = {
        agent: specializedAgent.name,
        description: specializedAgent.description,
        capabilities: specializedAgent.capabilities,
        available_tools: specializedAgent.tools,
        task: task_description,
        context: taskContext || 'No additional context provided',
        priority,
        working_directory: context.workingDirectory,
        session_id: context.sessionId
      };

      // Generate a comprehensive response with task ID for tracking
      const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const response = `🎯 **Task Assigned to ${specializedAgent.name.toUpperCase()}**

**Agent Description:** ${specializedAgent.description}

**Task:** ${task_description}
**Priority:** ${priority.toUpperCase()}
**Context:** ${taskContext || 'No additional context provided'}

**Agent Capabilities:**
${specializedAgent.capabilities.map(cap => `• ${cap}`).join('\n')}

**Available Tools:** ${specializedAgent.tools.join(', ')}

**Working Directory:** ${context.workingDirectory}

---

**Next Steps:**
The ${specializedAgent.name} agent is now active and ready to assist with this task. The agent will use its specialized knowledge and available tools to provide expert assistance in the ${specializedAgent.description.toLowerCase()} domain.

**Recommendations:**
1. The agent will analyze the task requirements
2. Use appropriate tools from its toolkit
3. Provide specialized insights and solutions
4. Follow best practices for ${specializedAgent.name.replace('_', ' ')} work

**Task ID:** ${taskId}`;

      // Store the task assignment in the result metadata for the orchestrator to pick up
      return {
        success: true,
        output: response,
        metadata: {
          taskAssignment,
          taskId,
          requiresAgentExecution: true,
          specializedAgent
        }
      };

    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Task assignment error: ${error instanceof Error ? error.message : String(error)}`
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
            agent: {
              type: 'string',
              description: 'The specialized agent to use',
              enum: SPECIALIZED_AGENTS.map(a => a.name)
            },
            task_description: {
              type: 'string',
              description: 'Detailed description of the task to be performed'
            },
            context: {
              type: 'string',
              description: 'Additional context about the current project or situation'
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'urgent'],
              default: 'medium',
              description: 'Task priority level'
            }
          },
          required: ['agent', 'task_description']
        }
      }
    };
  }
}

// Helper function to get available agents
export function getAvailableAgents(): SpecializedAgent[] {
  return SPECIALIZED_AGENTS;
}

// Helper function to get agent by name
export function getAgentByName(name: string): SpecializedAgent | undefined {
  return SPECIALIZED_AGENTS.find(agent => agent.name === name);
}
