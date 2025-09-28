import { AIClient } from './client.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export interface OrchestratorDecision {
  action: 'respond' | 'plan' | 'execute' | 'update_plan';
  reason: string;
  planId?: string;
  shouldContinue?: boolean;
}

export interface PlanContext {
  planId: string;
  currentStep: number;
  totalSteps: number;
  status: 'active' | 'completed' | 'failed' | 'paused';
  lastResult?: any;
  errors: string[];
  newRequirements: string[];
  updatedAt?: Date;
}

export class AIOrchestrator {
  private aiClient: AIClient;
  private activePlans: Map<string, PlanContext> = new Map();
  private conversationHistory: ChatCompletionMessageParam[] = [];

  constructor(aiClient: AIClient) {
    this.aiClient = aiClient;
  }

  async decideAction(
    userInput: string,
    availableTools: string[],
    workingDirectory: string
  ): Promise<OrchestratorDecision> {
    // Simple AI-based decision making instead of rigid pattern matching
    const decisionPrompt = this.buildDecisionPrompt(userInput, availableTools, workingDirectory);
    
    try {
      const response = await this.aiClient.chat([{
        role: 'system',
        content: decisionPrompt
      }, {
        role: 'user',
        content: userInput
      }], [], 'none');

      const decision = this.parseDecisionResponse(response.choices[0].message.content || '');
      return decision;
    } catch (error) {
      // Fallback to simple heuristics if AI fails
      return this.fallbackDecision(userInput);
    }
  }

  async generatePlan(
    userRequest: string,
    context: string,
    availableTools: string[],
    workingDirectory: string
  ): Promise<{ planId: string; title: string; plan: string; steps: string[] }> {
    const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const planPrompt = `You are an AI planning assistant. Create a detailed, specific, and executable plan for the user's request.

USER REQUEST: ${userRequest}
CONTEXT: ${context}
AVAILABLE TOOLS: ${availableTools.join(', ')}
WORKING DIRECTORY: ${workingDirectory}

CRITICAL REQUIREMENTS FOR PLAN GENERATION:
1. Each step MUST be HIGHLY SPECIFIC and directly executable by the AI
2. Include exact commands, file paths, and tool names that will be used
3. Focus on concrete actions, not vague descriptions
4. Research thoroughly before creating steps - don't assume availability of resources
5. If credentials are needed, include specific steps to locate or create them
6. For authentication tasks, include exact command syntax
7. Prefer bash tool with specific commands over generic descriptions
8. Include error handling and verification steps
9. Break complex operations into smaller, manageable steps
10. NEVER include steps that rely on resources you haven't verified exist

Create a JSON response with:
{
  "planId": "${planId}",
  "title": "Specific, action-oriented plan title",
  "description": "Detailed description of exactly what will be accomplished with specific tools and commands",
  "steps": [
    "Step 1: Use bash tool to run 'specific command with exact syntax' to accomplish X",
    "Step 2: Use read_file tool to check 'specific/file/path' for required configuration",
    "Step 3: Use bash tool to execute 'specific authentication command with exact parameters'"
  ],
  "estimatedDuration": "5-10 minutes",
  "complexity": "simple|medium|complex"
}

EXAMPLE OF GOOD STEP: "Use bash tool to run 'supabase login --token=your-token' to authenticate with Supabase CLI"
EXAMPLE OF BAD STEP: "Log into Supabase using credentials"

Make every step extremely specific, actionable, and directly executable by the AI.`;

    try {
      const response = await this.aiClient.chat([{
        role: 'system',
        content: planPrompt
      }], [], 'none');

      const planData = this.parsePlanResponse(response.choices[0].message.content || '');
      
      // Store plan context
      this.activePlans.set(planId, {
        planId,
        currentStep: 0,
        totalSteps: planData.steps.length,
        status: 'active',
        errors: [],
        newRequirements: []
      });

      return {
        planId,
        title: planData.title,
        plan: planData.description,
        steps: planData.steps
      };
    } catch (error) {
      throw new Error(`Failed to generate plan: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async updatePlan(
    planId: string,
    executionResults: string,
    errors: string[],
    newRequirements: string[]
  ): Promise<{ updated: boolean; newSteps?: string[]; reason?: string }> {
    const planContext = this.activePlans.get(planId);
    if (!planContext) {
      return { updated: false, reason: 'Plan not found' };
    }

    // Update plan context
    planContext.errors = [...planContext.errors, ...errors];
    planContext.newRequirements = [...planContext.newRequirements, ...newRequirements];

    // Simple logic for plan updates
    if (errors.length > 0 || newRequirements.length > 0) {
      const updatePrompt = `The current plan execution encountered issues. Create a SPECIFIC and DIRECTLY EXECUTABLE alternative plan.

CURRENT PLAN ID: ${planId}
EXECUTION RESULTS: ${executionResults}
ERRORS: ${errors.join(', ')}
NEW REQUIREMENTS: ${newRequirements.join(', ')}

CRITICAL REQUIREMENTS FOR PLAN UPDATES:
1. Each step MUST be HIGHLY SPECIFIC with exact commands and tool names
2. DO NOT repeat steps that have already failed - create true alternatives
3. Include detailed error handling and verification in each step
4. Focus on concrete, executable actions with exact syntax
5. If a resource wasn't found, don't assume it exists elsewhere - create it or use an alternative approach
6. For authentication failures, provide multiple authentication methods with exact commands
7. Always include verification steps after critical operations
8. Use bash tool with specific commands for direct execution

Generate alternative approaches for failed tools:
- If file not found, check alternative locations OR create the file with necessary content
- If MCP tools fail, use direct bash commands with exact syntax
- If CLI tools fail, provide alternative commands with different parameters
- If authentication fails, try alternative authentication methods with exact command syntax
- Always provide concrete, executable fallback options

Provide a JSON response:
{
  "updated": true,
  "newSteps": [
    "Step 1: Use bash tool to run 'specific alternative command' to accomplish X",
    "Step 2: Use write_file tool to create 'specific/file/path' with required configuration",
    "Step 3: Use bash tool to execute 'specific alternative authentication command'"
  ],
  "reason": "Updated plan with specific, executable alternative approaches"
}

EXAMPLE OF GOOD STEP: "Use bash tool to run 'supabase login --interactive' to start interactive authentication with Supabase CLI"
EXAMPLE OF BAD STEP: "Try alternative login method for Supabase"

If no update is needed, return:
{
  "updated": false,
  "reason": "Plan is still valid"
}`;

      try {
        const response = await this.aiClient.chat([{
          role: 'system',
          content: updatePrompt
        }], [], 'none');

        const updateData = this.parseUpdateResponse(response.choices[0].message.content || '');
        
        if (updateData.updated && updateData.newSteps && updateData.newSteps.length > 0) {
          // Store the updated steps in the plan context
          planContext.totalSteps = updateData.newSteps.length;
          planContext.currentStep = 0; // Reset to beginning of updated plan
          
          // Create a new plan object with the updated steps
          const updatedPlanData = {
            planId: planId,
            title: `Updated plan: ${planId}`,
            description: `Updated plan after encountering errors: ${executionResults}`,
            steps: updateData.newSteps
          };
          
          // Store the updated plan in the active plans
          this.activePlans.set(planId, {
            ...planContext,
            status: 'active',
            updatedAt: new Date()
          });
        }

        return updateData;
      } catch (error) {
        return { updated: false, reason: 'Failed to update plan' };
      }
    }

    return { updated: false, reason: 'No updates needed' };
  }

  getPlanContext(planId: string): PlanContext | undefined {
    return this.activePlans.get(planId);
  }

  completePlan(planId: string, success: boolean): void {
    const planContext = this.activePlans.get(planId);
    if (planContext) {
      planContext.status = success ? 'completed' : 'failed';
    }
  }

  private buildDecisionPrompt(userInput: string, availableTools: string[], workingDirectory: string): string {
    return `You are an AI orchestrator that decides how to handle user requests. Analyze the user input and decide the best action.

AVAILABLE TOOLS: ${availableTools.join(', ')}
WORKING DIRECTORY: ${workingDirectory}

ACTIONS AVAILABLE:
- "respond": Conversational response (greetings, questions, explanations, discussions)
- "execute": Execute tools directly for tasks that can be completed immediately
- "plan": Create a new execution plan for complex multi-step tasks
- "update_plan": Update an existing plan based on new information

IMPORTANT: Be conversational and helpful. Always explain what you're doing and why. Use TodoWrite tools frequently for task management.

PRIORITY: For service-specific tasks, prioritize relevant MCP tools over generic CLI tools.

Respond with ONLY a JSON object:
{
  "action": "respond|execute|plan|update_plan",
  "reason": "Brief explanation of why this action was chosen"
}

Examples:
- "hi" → {"action": "respond", "reason": "Simple greeting"}
- "build a todo app" → {"action": "plan", "reason": "Complex task requiring multiple steps and planning"}
- "log me into [service]" → {"action": "execute", "reason": "Authentication task - execute directly with explanation"}
- "list files" → {"action": "execute", "reason": "Simple command that can be executed directly"}
- "what can you do?" → {"action": "respond", "reason": "Question asking about capabilities"}
- "fix the error" → {"action": "update_plan", "reason": "Error correction requires plan modification"}`;
  }

  private parseDecisionResponse(response: string): OrchestratorDecision {
    try {
      const parsed = JSON.parse(response);
      return {
        action: parsed.action || 'respond',
        reason: parsed.reason || 'No reason provided'
      };
    } catch {
      return this.fallbackDecision('');
    }
  }

  private parsePlanResponse(response: string): any {
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No JSON found in response');
    } catch (error) {
      // Fallback plan if parsing fails
      return {
        planId: `plan_${Date.now()}`,
        title: 'Execution Plan',
        description: 'Execute the user request step by step',
        steps: ['Analyze the request', 'Execute necessary actions', 'Verify completion'],
        estimatedDuration: '5-10 minutes',
        complexity: 'medium'
      };
    }
  }

  private parseUpdateResponse(response: string): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { updated: false, reason: 'No JSON found in response' };
    } catch {
      return { updated: false, reason: 'Failed to parse response' };
    }
  }

  private fallbackDecision(userInput: string): OrchestratorDecision {
    const input = userInput.toLowerCase().trim();
    
    // Simple greetings - respond directly
    if (input.match(/^(hi|hey|hello|howdy|how are you|what's up)/)) {
      return { action: 'respond', reason: 'Simple greeting - no tools needed' };
    }
    
    // Questions about capabilities - respond directly
    if (input.match(/^(what can you do|what are your capabilities|how can you help)/)) {
      return { action: 'respond', reason: 'Question about capabilities' };
    }
    
    // Authentication tasks - execute directly, don't plan
    if (input.match(/log.*into|authenticate|login|connect/)) {
      return { action: 'execute', reason: 'Authentication task - execute directly' };
    }
    
    // Complex tasks requiring planning
    if (input.match(/^(build|create|make|develop|setup|install|configure|deploy)/)) {
      return { action: 'plan', reason: 'Complex task requiring planning' };
    }
    
    // Simple commands - execute directly
    if (input.match(/^(list|show|ls|cat|pwd|cd|grep|find|mkdir|rm|cp|mv)/)) {
      return { action: 'execute', reason: 'Simple command' };
    }
    
    // Git commands
    if (input.match(/^git\s+/)) {
      return { action: 'execute', reason: 'Git command' };
    }
    
    // If user is asking for something to be done (not just asking a question), prefer planning
    if (input.match(/^(help me|can you|please|do|run|execute)/)) {
      return { action: 'plan', reason: 'User requesting action to be performed' };
    }
    
    // Default to planning for action-oriented requests, respond for questions
    if (input.includes('?')) {
      return { action: 'respond', reason: 'Question detected' };
    }
    
    // Check if it's an authentication request
    if (input.match(/log.*into|authenticate|login|connect/)) {
      return { action: 'execute', reason: 'Authentication request - execute directly' };
    }
    
    return { action: 'plan', reason: 'Action-oriented request - default to planning' };
  }
}
