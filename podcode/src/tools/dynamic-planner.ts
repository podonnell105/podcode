import { Tool, ToolContext, ToolResult } from './types.js';
import { z } from 'zod';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export interface PlanData {
  planId: string;
  title: string;
  description: string;
  steps: string[];
  estimatedDuration: string;
  complexity: 'simple' | 'medium' | 'complex';
}

export interface PlanUpdateData {
  updated: boolean;
  newSteps?: string[];
  reason?: string;
}

export class DynamicPlannerTool implements Tool {
  name = 'create_plan';
  description = 'Generate a dynamic execution plan for complex tasks';
  
  parameters = z.object({
    userRequest: z.string().describe('The user request to create a plan for'),
    context: z.string().optional().describe('Additional context for the plan'),
    updatePlan: z.boolean().optional().describe('Whether to update an existing plan'),
    previousAttempts: z.string().optional().describe('Information about previous attempts'),
    currentProgress: z.string().optional().describe('Current progress status'),
    conversationHistory: z.string().optional().describe('Previous conversation context'),
    executionResults: z.string().optional().describe('Results from recent executions'),
    stepFailures: z.array(z.string()).optional().describe('List of failed steps'),
    newRequirements: z.string().optional().describe('New requirements discovered'),
    partialSuccesses: z.string().optional().describe('Steps that partially succeeded')
  });
  
  private activePlans: Map<string, PlanData> = new Map();

  async execute(args: any, context: ToolContext): Promise<ToolResult> {
    try {
      if (args.updatePlan && args.userRequest) {
        return this.updateExistingPlan(args);
      } else {
        return this.createNewPlan(args);
      }
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async createNewPlan(args: any): Promise<{ success: boolean; output: string }> {
    const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Generate a dynamic plan based on the request
    const plan = this.generatePlan(args.userRequest, args.context || '');
    
    // Store the plan
    this.activePlans.set(planId, plan);
    
    const output = this.formatPlanOutput(plan);
    
    return {
      success: true,
      output
    };
  }

  private async updateExistingPlan(args: any): Promise<{ success: boolean; output: string }> {
    // Find the most recent active plan
    const activePlan = Array.from(this.activePlans.values())
      .filter(p => p.complexity !== 'simple')
      .sort((a, b) => b.planId.localeCompare(a.planId))[0];

    if (!activePlan) {
      return {
        success: false,
        output: 'No active plan found to update'
      };
    }

    // Update the plan based on new information
    const updatedPlan = this.updatePlan(activePlan, args);
    
    // Store the updated plan
    this.activePlans.set(updatedPlan.planId, updatedPlan);
    
    const output = this.formatUpdatedPlanOutput(updatedPlan, args);
    
    return {
      success: true,
      output
    };
  }

  private generatePlan(userRequest: string, context: string): PlanData {
    const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const complexity = this.determineComplexity(userRequest);
    
    // Generate steps based on request analysis
    const steps = this.generateSteps(userRequest, complexity);
    
    return {
      planId,
      title: this.generateTitle(userRequest),
      description: this.generateDescription(userRequest, context),
      steps,
      estimatedDuration: this.estimateDuration(steps.length, complexity),
      complexity
    };
  }

  private updatePlan(originalPlan: PlanData, updateArgs: any): PlanData {
    const updatedPlan = { ...originalPlan };
    
    // Add new steps for new requirements
    if (updateArgs.newRequirements && updateArgs.newRequirements !== 'None') {
      const newSteps = this.generateStepsForRequirements(updateArgs.newRequirements);
      updatedPlan.steps = [...updatedPlan.steps, ...newSteps];
    }
    
    // Modify steps based on failures
    if (updateArgs.stepFailures && updateArgs.stepFailures.length > 0) {
      updatedPlan.steps = this.modifyStepsForFailures(updatedPlan.steps, updateArgs.stepFailures);
    }
    
    // Update description to reflect changes
    updatedPlan.description += `\n\nPlan updated based on execution results: ${updateArgs.executionResults || 'N/A'}`;
    
    return updatedPlan;
  }

  private determineComplexity(userRequest: string): 'simple' | 'medium' | 'complex' {
    const request = userRequest.toLowerCase();
    
    if (request.includes('build') || request.includes('create') || request.includes('develop')) {
      return 'complex';
    }
    
    if (request.includes('setup') || request.includes('install') || request.includes('configure')) {
      return 'medium';
    }
    
    return 'simple';
  }

  private generateSteps(userRequest: string, complexity: 'simple' | 'medium' | 'complex'): string[] {
    const request = userRequest.toLowerCase();
    
    if (request.includes('todo') || request.includes('app')) {
      return [
        '1. Analyze requirements and choose technology stack',
        '2. Set up project structure and dependencies',
        '3. Create basic HTML structure',
        '4. Implement JavaScript functionality for adding/removing tasks',
        '5. Add styling and responsive design',
        '6. Test functionality and fix any issues',
        '7. Deploy or package the application'
      ];
    }
    
    if (request.includes('log') || request.includes('authenticate') || request.includes('connect')) {
      return [
        '1. Check if required CLI tools are installed',
        '2. Authenticate with the service',
        '3. Verify authentication status',
        '4. Execute requested operations',
        '5. Confirm successful completion'
      ];
    }
    
    if (request.includes('install') || request.includes('setup')) {
      return [
        '1. Check system requirements',
        '2. Download or install required components',
        '3. Configure settings and environment',
        '4. Verify installation success',
        '5. Test basic functionality'
      ];
    }
    
    // Generic steps based on complexity
    switch (complexity) {
      case 'complex':
        return [
          '1. Analyze the request and break it down into components',
          '2. Prepare the environment and gather resources',
          '3. Implement the core functionality',
          '4. Add additional features and polish',
          '5. Test and validate the implementation',
          '6. Document and finalize the solution'
        ];
      
      case 'medium':
        return [
          '1. Analyze the requirements',
          '2. Execute the main task',
          '3. Verify and test the results',
          '4. Complete any final touches'
        ];
      
      default:
        return [
          '1. Execute the requested task',
          '2. Verify the results'
        ];
    }
  }

  private generateStepsForRequirements(requirements: string): string[] {
    return [
      `1. Address new requirement: ${requirements}`,
      '2. Integrate the new requirement with existing plan',
      '3. Test the updated implementation'
    ];
  }

  private modifyStepsForFailures(steps: string[], failures: string[]): string[] {
    // Add recovery steps for failures
    const recoverySteps = failures.map((failure: string, index: number) => 
      `${steps.length + index + 1}. Recovery step for: ${failure}`
    );
    
    return [...steps, ...recoverySteps];
  }

  private generateTitle(userRequest: string): string {
    const request = userRequest.toLowerCase();
    
    if (request.includes('todo')) return 'Todo Application Development';
    if (request.includes('log') || request.includes('authenticate')) return 'Authentication Operations';
    if (request.includes('install')) return 'Installation and Setup';
    if (request.includes('build')) return 'Build and Development';
    
    return 'Task Execution Plan';
  }

  private generateDescription(userRequest: string, context: string): string {
    return `This plan will execute the user's request: "${userRequest}". ${context ? `Context: ${context}` : ''}`;
  }

  private estimateDuration(stepCount: number, complexity: 'simple' | 'medium' | 'complex'): string {
    const baseMinutes = stepCount * 2;
    
    switch (complexity) {
      case 'complex':
        return `${baseMinutes * 2}-${baseMinutes * 4} minutes`;
      case 'medium':
        return `${baseMinutes}-${baseMinutes * 2} minutes`;
      default:
        return `${baseMinutes}-${baseMinutes + 5} minutes`;
    }
  }

  private formatPlanOutput(plan: PlanData): string {
    return `📋 🧠 AUTONOMOUS PLAN for: ${plan.title}

🎯 EXECUTION PLAN:

TITLE: ${plan.title}
DESCRIPTION: ${plan.description}
COMPLEXITY: ${plan.complexity.toUpperCase()}
ESTIMATED DURATION: ${plan.estimatedDuration}

📝 EXECUTION STEPS:
${plan.steps.map(step => `  ${step}`).join('\n')}

🚀 DYNAMIC EXECUTION STRATEGY:
- Execute steps sequentially with validation
- Adapt approach based on results
- Handle errors gracefully with recovery
- Monitor progress and adjust as needed
- Complete all steps autonomously

📊 MONITORING & VALIDATION:
- Track progress through each step
- Validate outputs and intermediate results
- Monitor for errors or unexpected behavior
- Adapt plan based on real-time feedback
- Ensure complete task fulfillment

✨ Plan autonomously generated based on user needs and system analysis.`;
  }

  private formatUpdatedPlanOutput(plan: PlanData, updateArgs: any): string {
    return `📋 🔄 UPDATED AUTONOMOUS PLAN for: ${plan.title}

🔄 ADVANCED ADAPTIVE STRATEGY:

📊 EXECUTION ANALYSIS:
- Previous attempts: ${updateArgs.previousAttempts || 'None documented'}
- Current progress: ${updateArgs.currentProgress || 'Starting'}
- Execution results: ${updateArgs.executionResults || 'No previous results'}

🚨 FAILURE ANALYSIS:
${updateArgs.stepFailures && updateArgs.stepFailures.length > 0 
  ? updateArgs.stepFailures.map((failure: string) => `- ${failure}`).join('\n')
  : '- No specific failures documented'}

✨ PARTIAL SUCCESSES:
${updateArgs.partialSuccesses || 'None documented'}

🎯 NEW REQUIREMENTS DISCOVERED:
${updateArgs.newRequirements || 'None'}

🧠 ADAPTIVE ACTIONS:
- Analyze root causes of failures and partial successes
- Modify failed steps with alternative approaches
- Break down complex steps into smaller, manageable parts
- Add new steps for discovered requirements
- Refine partially successful steps for completion
- Use different tools or parameters for failed operations
- Validate each step before proceeding to next
- Implement retry mechanisms with exponential backoff

🔄 PLAN MODIFICATION STRATEGY:
- Replace failed steps with alternative methods
- Add intermediate validation steps
- Create fallback options for critical steps
- Implement step-by-step verification
- Add recovery procedures for common failure points

🎯 ADAPTIVE EXECUTION PLAN:

TITLE: ${plan.title}
DESCRIPTION: ${plan.description}
COMPLEXITY: ${plan.complexity.toUpperCase()}
ESTIMATED DURATION: ${plan.estimatedDuration}

📝 UPDATED EXECUTION STEPS:
${plan.steps.map(step => `  ${step}`).join('\n')}

🚀 DYNAMIC EXECUTION STRATEGY:
- Use adaptive execution based on previous attempts
- Apply learned lessons from failures
- Implement retry mechanisms with smart backoff
- Monitor with enhanced error detection
- Validate each step with multiple methods
- Maintain detailed logs for future learning

📊 ADVANCED MONITORING & VALIDATION:
- Enhanced progress tracking with failure analysis
- Validate outputs with multiple verification methods
- Monitor with predictive error detection
- Adapt plan based on comprehensive feedback analysis
- Ensure complete task fulfillment with requirement validation
- Store execution patterns for future optimization

🎯 Plan dynamically updated based on previous attempts and current context.`;
  }

  getActivePlans(): PlanData[] {
    return Array.from(this.activePlans.values());
  }

  getPlan(planId: string): PlanData | undefined {
    return this.activePlans.get(planId);
  }

  removePlan(planId: string): boolean {
    return this.activePlans.delete(planId);
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
            userRequest: {
              type: 'string',
              description: 'The user request to create a plan for'
            },
            context: {
              type: 'string',
              description: 'Additional context for the plan'
            },
            updatePlan: {
              type: 'boolean',
              description: 'Whether to update an existing plan'
            },
            previousAttempts: {
              type: 'string',
              description: 'Information about previous attempts'
            },
            currentProgress: {
              type: 'string',
              description: 'Current progress status'
            },
            conversationHistory: {
              type: 'string',
              description: 'Previous conversation context'
            },
            executionResults: {
              type: 'string',
              description: 'Results from recent executions'
            },
            stepFailures: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of failed steps'
            },
            newRequirements: {
              type: 'string',
              description: 'New requirements discovered'
            },
            partialSuccesses: {
              type: 'string',
              description: 'Steps that partially succeeded'
            }
          },
          required: ['userRequest']
        }
      }
    };
  }
}

export const dynamicPlannerTool = new DynamicPlannerTool();
