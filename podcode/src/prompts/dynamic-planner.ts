import { ConversationContext } from './conversation-handler.js';

export interface PlanDecision {
  shouldCreatePlan: boolean;
  reason: string;
  complexity: 'simple' | 'medium' | 'complex';
  estimatedSteps: number;
}

export interface PlanContext {
  userRequest: string;
  conversationHistory: string[];
  workingDirectory: string;
  availableTools: string[];
}

export function shouldCreatePlan(context: ConversationContext, planContext: PlanContext): PlanDecision {
  const input = context.userInput.toLowerCase().trim();
  
  // Simple patterns that don't need planning
  const simplePatterns = [
    /^(hi|hey|hello|howdy)$/i,
    /^(list|show|ls)\s+(files|directory|dir)$/i,
    /^(pwd|print\s+working\s+directory)$/i,
    /^(cd|change\s+directory)\s+/i,
    /^(cat|show|display)\s+\w+/i,
    /^(grep|search|find)\s+\w+/i,
    /^(git\s+status|git\s+log|git\s+diff)$/i,
    /^(npm\s+list|yarn\s+list|pip\s+list)$/i,
    /^(node\s+--version|python\s+--version|java\s+-version)$/i,
    /^(mkdir|make\s+directory)\s+\w+/i,
    /^(rm|remove|delete)\s+\w+/i,
    /^(cp|copy)\s+\w+/i,
    /^(mv|move|rename)\s+\w+/i
  ];
  
  // Medium complexity patterns that might need planning
  const mediumPatterns = [
    /^(npm\s+install|yarn\s+install|pip\s+install)\s+/i,
    /^(git\s+(clone|pull|push|commit|branch))/i,
    /^(setup|configure)\s+\w+/i,
    /^(create|make)\s+\w+\s+(file|folder|directory)/i,
    /^(run|execute)\s+\w+/i,
    /^(test|check)\s+\w+/i,
    /^(format|lint)\s+/i,
    /^(update|upgrade)\s+/i
  ];
  
  // Complex patterns that definitely need planning
  const complexPatterns = [
    /^(build|create|develop|make)\s+(app|application|website|project|todo)/i,
    /^(setup|install|configure)\s+(project|environment|development)/i,
    /^(deploy|publish|release|launch)/i,
    /^(refactor|restructure|reorganize)/i,
    /^(optimize|improve|enhance)\s+(performance|code|system)/i,
    /^(debug|fix|troubleshoot)\s+(complex|system|application)/i,
    /^(implement|add)\s+(feature|functionality|system)/i,
    /^(design|architect)\s+(system|application|database)/i,
    /^(write|create)\s+(tests|documentation|api)/i,
    /^(integrate|connect)\s+(api|service|database)/i,
    /^(migrate|convert|transform)/i,
    /^(automate|script)\s+(process|workflow)/i,
    /^(create|make)\s+(new)\s+(project)/i,
    /^(build|create)\s+(a|an|the)\s+(todo|app|application|website|project)/i,
    /^(create|make)\s+(a|an|the)\s+(new)\s+(project)/i
  ];
  
  // Check for simple patterns
  for (const pattern of simplePatterns) {
    if (pattern.test(input)) {
      return {
        shouldCreatePlan: false,
        reason: 'Simple command that can be executed directly',
        complexity: 'simple',
        estimatedSteps: 1
      };
    }
  }
  
  // Check for complex patterns
  for (const pattern of complexPatterns) {
    if (pattern.test(input)) {
      return {
        shouldCreatePlan: true,
        reason: 'Complex task requiring multiple steps and coordination',
        complexity: 'complex',
        estimatedSteps: 5
      };
    }
  }
  
  // Check for medium patterns
  for (const pattern of mediumPatterns) {
    if (pattern.test(input)) {
      return {
        shouldCreatePlan: true,
        reason: 'Medium complexity task that benefits from planning',
        complexity: 'medium',
        estimatedSteps: 3
      };
    }
  }
  
  // Check for multi-word requests (likely complex)
  const wordCount = input.split(/\s+/).length;
  if (wordCount > 4) {
    return {
      shouldCreatePlan: true,
      reason: 'Multi-word request suggesting complex task',
      complexity: 'medium',
      estimatedSteps: 3
    };
  }
  
  // Check for question patterns
  if (input.includes('?') || /^(what|how|why|when|where|which|who)/i.test(input)) {
    return {
      shouldCreatePlan: false,
      reason: 'Question that can be answered directly or with simple tool usage',
      complexity: 'simple',
      estimatedSteps: 1
    };
  }
  
  // Default to no plan for simple requests
  return {
    shouldCreatePlan: false,
    reason: 'Simple request that can be handled directly',
    complexity: 'simple',
    estimatedSteps: 1
  };
}

export function generatePlanContext(context: ConversationContext, availableTools: string[]): PlanContext {
  return {
    userRequest: context.userInput,
    conversationHistory: context.previousMessages,
    workingDirectory: context.workingDirectory,
    availableTools
  };
}

export function getPlanParameters(context: ConversationContext, planContext: PlanContext): any {
  const decision = shouldCreatePlan(context, planContext);
  
  if (!decision.shouldCreatePlan) {
    return null;
  }
  
  return {
    userRequest: context.userInput,
    context: `Complexity: ${decision.complexity}, Estimated steps: ${decision.estimatedSteps}, Reason: ${decision.reason}`,
    updatePlan: false,
    previousAttempts: 'None',
    currentProgress: 'Starting',
    conversationHistory: context.previousMessages.join(' | '),
    executionResults: 'None',
    stepFailures: [],
    newRequirements: 'None',
    partialSuccesses: 'None'
  };
}
