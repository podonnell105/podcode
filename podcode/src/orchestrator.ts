import { AIClient } from './client.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export interface OrchestratorDecision {
  action: 'respond' | 'execute';
  reason: string;
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

export interface PlanBudgets {
  max_steps?: number;
  max_updates?: number;
  timeout_s?: number;
}

export interface PlanSummary {
  planId: string;
  title: string;
  description: string;
  plan: string;
  steps: string[];
  success_criteria: string[];
  budgets?: PlanBudgets;
  telemetry?: string[];
}

export class AIOrchestrator {
  private aiClient: AIClient;
  private activePlans: Map<string, PlanContext> = new Map();
  private conversationHistory: ChatCompletionMessageParam[] = [];
  private badPayloadsLogged: Set<string> = new Set();

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
  ): Promise<PlanSummary> {
    const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const planPrompt = `You are an AI planning assistant. You MUST respond with ONLY valid JSON matching the exact schema below. Any deviation will be rejected.

USER REQUEST: ${userRequest}
CONTEXT: ${context}
AVAILABLE TOOLS: ${availableTools.join(', ')}
WORKING DIRECTORY: ${workingDirectory}

PLANNING STRATEGY:
- If you don't know how to accomplish something, START with web_search steps to gather information
- You can include multiple web_search steps in parallel to research different aspects
- After gathering information through web_search, proceed with execution steps
- Use specific, technical search terms for web_search

Example: If asked to "create a custom field", your plan should:
1. First step: web_search with search_term like "CLI create custom field command syntax"
2. After learning the syntax, add steps to execute the actual commands

REQUIRED JSON SCHEMA (respond with EXACTLY this structure or be rejected):
{
  "planId": "<string>",
  "title": "<string>",
  "description": "<string>",
  "success_criteria": ["<cli or file-state checks>"],
  "steps": [
    {
      "id": "s1",
      "tool": "<one of registry tools>",
      "args": { /* fully specified; includes 'why' */ },
      "depends_on": [],
      "retries": 1,
      "rollback": "<command or patch name>"
    }
  ],
  "budgets": { "max_steps": ${parseInt(process.env.PODCODE_MAX_STEPS || '20')}, "max_updates": ${parseInt(process.env.PODCODE_MAX_UPDATES || '2')}, "timeout_s": ${parseInt(process.env.PODCODE_TIMEOUT_S || '600')} },
  "telemetry": ["step_latency","exit_code","patch_size"]
}

CRITICAL REQUIREMENTS:
1. planId must be: "${planId}"
2. tool field must be one of: ${availableTools.join(', ')}
3. args must include a "why" field explaining the tool choice
4. Include web_search steps at the beginning if you need to learn how to accomplish the task
5. success_criteria must be CLI commands or file checks that verify completion
6. JSON MUST be valid - any syntax error will cause rejection and re-generation

RESPOND WITH ONLY THE JSON OBJECT. NO OTHER TEXT.`;

    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        const response = await this.aiClient.chat([{
          role: 'system',
          content: planPrompt
        }], [], 'none');

        const planData = this.parsePlanResponseStrict(response.choices[0].message.content || '', availableTools);
        
        // Store plan context
        this.activePlans.set(planId, {
          planId,
          currentStep: 0,
          totalSteps: planData.steps.length,
          status: 'active',
          errors: [],
          newRequirements: []
        });

        const summarizedSteps = planData.steps.map((step: any) => `${step.id}: Use ${step.tool} tool - ${step.args.why || 'execute step'}`);

        return {
          planId,
          title: planData.title,
          description: planData.description,
          plan: JSON.stringify(planData),
          steps: summarizedSteps,
          success_criteria: planData.success_criteria,
          budgets: planData.budgets,
          telemetry: planData.telemetry
        };
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw new Error(`Failed to generate valid plan after ${maxAttempts} attempts: ${error instanceof Error ? error.message : String(error)}`);
        }
        // Continue to retry with the same prompt
      }
    }
    
    throw new Error('Failed to generate plan');
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

    // Check for repeated errors to trigger alternative approaches
    const errorCounts = new Map<string, number>();
    planContext.errors.forEach(error => {
      const count = errorCounts.get(error) || 0;
      errorCounts.set(error, count + 1);
    });
    
    const hasRepeatedError = Array.from(errorCounts.values()).some(count => count >= 2);

    // Only update if there are errors or new requirements
    if (errors.length > 0 || newRequirements.length > 0) {
      const updatePrompt = `You are a strict plan reflector. You MUST respond with ONLY valid JSON matching one of the exact schemas below.

CURRENT PLAN ID: ${planId}
EXECUTION RESULTS: ${executionResults}
ERRORS: ${errors.join(', ')}
NEW REQUIREMENTS: ${newRequirements.join(', ')}
REPEATED ERRORS: ${hasRepeatedError ? 'YES - must use alternative tools/args' : 'NO'}

STRICT RESPONSE SCHEMAS (choose one):

Schema 1 - No update needed:
{"updated":false,"reason":"<why>"}

Schema 2 - Update with new steps:
{"updated":true,"newSteps":[
  {
    "id": "s1",
    "tool": "<registry tool>",
    "args": {"why": "<reason>", /* other args */},
    "depends_on": [],
    "retries": 1,
    "rollback": "<command or patch name>"
  }
],"reason":"<root cause + alt path>"}

RULES:
- If same error twice → MUST replan with alternative tool/args
- Change at most 3 steps
- Keep existing budgets 
- newSteps must use same schema as original planner
- If updated=true, newSteps is required and must be array
- RESPOND WITH ONLY THE JSON OBJECT. NO OTHER TEXT.`;

      try {
        const response = await this.aiClient.chat([{
          role: 'system',
          content: updatePrompt
        }], [], 'none');

        const updateData = this.parseUpdateResponseStrict(response.choices[0].message.content || '');
        
        if (updateData.updated && updateData.newSteps && updateData.newSteps.length > 0) {
          // Validate newSteps schema matches original planner
          this.validateStepsSchema(updateData.newSteps);
          
          // Enforce max 3 steps rule
          if (updateData.newSteps.length > 3) {
            updateData.newSteps = updateData.newSteps.slice(0, 3);
          }
          
          // Store the updated steps in the plan context
          planContext.totalSteps = updateData.newSteps.length;
          planContext.currentStep = 0; // Reset to beginning of updated plan
          
          // Store the updated plan in the active plans
          this.activePlans.set(planId, {
            ...planContext,
            status: 'active',
            updatedAt: new Date()
          });
          
          // Convert steps to string format for return value
          const stepStrings = updateData.newSteps.map((step: any) => 
            `${step.id}: Use ${step.tool} tool - ${step.args.why || 'execute step'}`
          );
          
          return {
            updated: true,
            newSteps: stepStrings,
            reason: updateData.reason
          };
        }

        return {
          updated: updateData.updated,
          reason: updateData.reason
        };
      } catch (error) {
        return { updated: false, reason: 'Failed to parse update response' };
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
    return `You are an AI orchestrator that decides how to handle user requests. You MUST respond with ONLY valid JSON matching the exact format below.

AVAILABLE TOOLS: ${availableTools.join(', ')}
WORKING DIRECTORY: ${workingDirectory}

REQUIRED JSON FORMAT (respond with EXACTLY this structure):
{"action":"respond|execute","reason":"<short>"}

ACTIONS:
- "respond": Conversational response (greetings, questions, explanations, thinking out loud)
- "execute": Execute tools directly (always prefer this for any actionable request)

IMPORTANT: 
- Default to "execute" for any actionable request
- You'll decide which tools to call conversationally as you go
- There is no planning phase - just execute tools as needed
- If a tool fails, you'll see the error and can try a different approach

RESPOND WITH ONLY THE JSON OBJECT. NO OTHER TEXT.`;
  }

  private parseDecisionResponse(response: string): OrchestratorDecision {
    try {
      const parsed = this.parseJSONRobust(response, 'decision');
      // Validate action field
      const validActions = ['respond', 'execute'];
      if (!parsed.action || !validActions.includes(parsed.action)) {
        throw new Error('Invalid action');
      }
      return {
        action: parsed.action,
        reason: parsed.reason || 'No reason provided'
      };
    } catch {
      // Guard: if parse fails, default to execute for actionable requests
      return { action: 'execute', reason: 'JSON parse failed, defaulting to execute' };
    }
  }

  private parsePlanResponse(response: string): any {
    try {
      return this.parseJSONRobust(response, 'plan');
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

  private parsePlanResponseStrict(response: string, availableTools: string[]): any {
    const planData = this.parseJSONRobust(response, 'plan');
    
    // Validate required schema fields
    const requiredFields = ['planId', 'title', 'description', 'success_criteria', 'steps', 'budgets', 'telemetry'];
    for (const field of requiredFields) {
      if (!(field in planData)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Validate success_criteria is array
    if (!Array.isArray(planData.success_criteria)) {
      throw new Error('success_criteria must be an array');
    }
    
    // Validate steps structure
    if (!Array.isArray(planData.steps)) {
      throw new Error('steps must be an array');
    }
    
    for (const step of planData.steps) {
      const stepRequiredFields = ['id', 'tool', 'args', 'depends_on', 'retries', 'rollback'];
      for (const field of stepRequiredFields) {
        if (!(field in step)) {
          throw new Error(`Step missing required field: ${field}`);
        }
      }
      
      // Validate tool is in available tools
      if (!availableTools.includes(step.tool)) {
        throw new Error(`Invalid tool: ${step.tool}. Must be one of: ${availableTools.join(', ')}`);
      }
      
      // Validate args has 'why' field
      if (!step.args || typeof step.args !== 'object' || !('why' in step.args)) {
        throw new Error(`Step ${step.id} args must include 'why' field`);
      }
      
      // Validate depends_on is array
      if (!Array.isArray(step.depends_on)) {
        throw new Error(`Step ${step.id} depends_on must be an array`);
      }
    }
    
    // Validate budgets structure
    const budgetRequiredFields = ['max_steps', 'max_updates', 'timeout_s'];
    for (const field of budgetRequiredFields) {
      if (!(field in planData.budgets)) {
        throw new Error(`budgets missing required field: ${field}`);
      }
    }
    
    // Validate telemetry is array
    if (!Array.isArray(planData.telemetry)) {
      throw new Error('telemetry must be an array');
    }
    
    return planData;
  }

  private parseUpdateResponse(response: string): any {
    try {
      return this.parseJSONRobust(response, 'update');
    } catch {
      return { updated: false, reason: 'Failed to parse response' };
    }
  }

  private parseUpdateResponseStrict(response: string): any {
    const updateData = this.parseJSONRobust(response, 'update');
    
    // Validate required fields
    if (!('updated' in updateData) || typeof updateData.updated !== 'boolean') {
      throw new Error('Missing or invalid "updated" field');
    }
    
    if (!updateData.reason || typeof updateData.reason !== 'string') {
      throw new Error('Missing or invalid "reason" field');
    }
    
    // If updated is true, validate newSteps
    if (updateData.updated) {
      if (!updateData.newSteps || !Array.isArray(updateData.newSteps)) {
        throw new Error('When updated=true, newSteps must be an array');
      }
      
      if (updateData.newSteps.length === 0) {
        throw new Error('When updated=true, newSteps cannot be empty');
      }
    }
    
    return updateData;
  }

  private validateStepsSchema(steps: any[]): void {
    for (const step of steps) {
      const requiredFields = ['id', 'tool', 'args', 'depends_on', 'retries', 'rollback'];
      for (const field of requiredFields) {
        if (!(field in step)) {
          throw new Error(`Step missing required field: ${field}`);
        }
      }
      
      // Validate args has 'why' field
      if (!step.args || typeof step.args !== 'object' || !('why' in step.args)) {
        throw new Error(`Step ${step.id} args must include 'why' field`);
      }
      
      // Validate depends_on is array
      if (!Array.isArray(step.depends_on)) {
        throw new Error(`Step ${step.id} depends_on must be an array`);
      }
    }
  }

  /**
   * Robust JSON parser that handles garbage around JSON
   * Tries multiple strategies: largest complete JSON, individual JSON objects, then fallback
   * Falls back to JSON5 if available, logs bad payloads once per session
   */
  private parseJSONRobust(response: string, context: string = 'unknown'): any {
    try {
      // Strategy 1: Try to find the largest complete JSON object (first { to last })
      const firstBrace = response.indexOf('{');
      const lastBrace = response.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
        const jsonString = response.slice(firstBrace, lastBrace + 1);
        
        try {
          return JSON.parse(jsonString);
        } catch (jsonError) {
          // Strategy 2: Try individual JSON objects by finding complete { ... } pairs
          const jsonObjects = this.findCompleteJSONObjects(response);
          
          for (const jsonObj of jsonObjects) {
            try {
              return JSON.parse(jsonObj);
            } catch (parseError) {
              // Try JSON5 for this object
              try {
                const JSON5 = require('json5');
                return JSON5.parse(jsonObj);
              } catch (json5Error) {
                continue; // Try next object
              }
            }
          }
          
          // Strategy 3: Try JSON5 on the largest JSON
          try {
            const JSON5 = require('json5');
            return JSON5.parse(jsonString);
          } catch (json5Error) {
            // Log bad payload once per session
            const payloadKey = `${context}:${jsonString.substring(0, 100)}`;
            if (!this.badPayloadsLogged.has(payloadKey)) {
              console.warn(`⚠️ Bad JSON payload in ${context}:`, jsonString.substring(0, 200) + '...');
              console.warn(`JSON error:`, jsonError);
              this.badPayloadsLogged.add(payloadKey);
            }
            throw jsonError;
          }
        }
      }
      
      throw new Error('No valid JSON braces found');
    } catch (error) {
      // Log bad payload once per session
      const payloadKey = `${context}:${response.substring(0, 100)}`;
      if (!this.badPayloadsLogged.has(payloadKey)) {
        console.warn(`⚠️ Failed to parse JSON in ${context}:`, response.substring(0, 200) + '...');
        console.warn(`Parse error:`, error);
        this.badPayloadsLogged.add(payloadKey);
      }
      throw error;
    }
  }

  /**
   * Find all complete JSON objects in a string by matching balanced braces
   */
  private findCompleteJSONObjects(text: string): string[] {
    const objects: string[] = [];
    let braceCount = 0;
    let startIndex = -1;
    
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        if (braceCount === 0) {
          startIndex = i;
        }
        braceCount++;
      } else if (text[i] === '}') {
        braceCount--;
        if (braceCount === 0 && startIndex !== -1) {
          // Found a complete JSON object
          objects.push(text.slice(startIndex, i + 1));
          startIndex = -1;
        }
      }
    }
    
    return objects;
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
    
    // Questions without clear action - respond
    if (input.includes('?') && !input.match(/can you|could you|would you/)) {
      return { action: 'respond', reason: 'Question detected' };
    }
    
    // Everything else - execute (AI will decide tools conversationally)
    return { action: 'execute', reason: 'Actionable request - execute conversationally' };
  }
}
