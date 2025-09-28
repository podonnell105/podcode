export interface ConversationContext {
  userInput: string;
  previousMessages: string[];
  sessionId: string;
  workingDirectory: string;
}

export interface ConversationResponse {
  type: 'greeting' | 'question' | 'command' | 'request' | 'unknown';
  shouldUseTools: boolean;
  shouldCreatePlan: boolean;
  responseTemplate?: string;
}

export function analyzeConversation(context: ConversationContext): ConversationResponse {
  const input = context.userInput.toLowerCase().trim();
  
  // Greeting patterns
  const greetingPatterns = [
    /^(hi|hey|hello|howdy|good morning|good afternoon|good evening)$/i,
    /^(hi|hey|hello)\s+(there|buddy|friend|mate)$/i,
    /^how\s+(are\s+you|do\s+you\s+do)$/i,
    /^what's\s+up$/i,
    /^how\s+is\s+it\s+going$/i,
    /^how\s+are\s+you\?$/i,
    /^hey\s+how\s+are\s+(you|u)$/i,
    /^how\s+are\s+(you|u)$/i,
    /^how\s+(you|u)\s+doing$/i
  ];
  
  // Question patterns
  const questionPatterns = [
    /^what\s+is/i,
    /^how\s+do\s+i/i,
    /^can\s+you\s+help/i,
    /^what\s+are\s+the/i,
    /^how\s+does/i,
    /^why\s+does/i,
    /^when\s+should/i,
    /^where\s+is/i,
    /^\?$/
  ];
  
  // Command patterns (simple tasks that don't need planning)
  const commandPatterns = [
    /^(list|show|ls)\s+(files|directory|dir)/i,
    /^(cd|change\s+directory)/i,
    /^(pwd|print\s+working\s+directory)/i,
    /^(cat|show|display)\s+/i,
    /^(grep|search|find)\s+/i,
    /^(mkdir|make\s+directory)/i,
    /^(rm|remove|delete)/i,
    /^(cp|copy)/i,
    /^(mv|move|rename)/i,
    /^(git\s+status|git\s+log|git\s+diff)/i,
    /^(npm\s+install|yarn\s+install|pip\s+install)/i,
    /^(node|python|java|go)\s+/i
  ];
  
  // Complex request patterns (need planning)
  const requestPatterns = [
    /^(build|create|make|develop)\s+/i,
    /^(setup|install|configure)\s+/i,
    /^(deploy|publish|release)/i,
    /^(refactor|restructure|reorganize)/i,
    /^(optimize|improve|enhance)/i,
    /^(debug|fix|troubleshoot)/i,
    /^(implement|add)\s+(feature|functionality)/i,
    /^(design|architect)/i,
    /^(test|write\s+tests)/i,
    /^(document|write\s+documentation)/i
  ];
  
  // Check for greetings
  for (const pattern of greetingPatterns) {
    if (pattern.test(input)) {
      return {
        type: 'greeting',
        shouldUseTools: false,
        shouldCreatePlan: false,
        responseTemplate: getGreetingResponse(input)
      };
    }
  }
  
  // Check for questions
  for (const pattern of questionPatterns) {
    if (pattern.test(input)) {
      return {
        type: 'question',
        shouldUseTools: true,
        shouldCreatePlan: false
      };
    }
  }
  
  // Check for simple commands
  for (const pattern of commandPatterns) {
    if (pattern.test(input)) {
      return {
        type: 'command',
        shouldUseTools: true,
        shouldCreatePlan: false
      };
    }
  }
  
  // Check for complex requests
  for (const pattern of requestPatterns) {
    if (pattern.test(input)) {
      return {
        type: 'request',
        shouldUseTools: true,
        shouldCreatePlan: true
      };
    }
  }
  
  // Default to unknown
  return {
    type: 'unknown',
    shouldUseTools: true,
    shouldCreatePlan: false
  };
}

function getGreetingResponse(input: string): string {
  const responses = [
    "Hey there! 👋 What can I help you with today?",
    "Hello! Ready to tackle some coding challenges?",
    "Hi! How can I assist you with your development work?",
    "Hey! What's on your mind today?",
    "Hello there! What would you like to work on?",
    "Hi! I'm here to help with your coding tasks. What do you need?",
    "Hey! Great to see you. What can I help you build today?",
    "Hello! Ready to dive into some code? What's the plan?"
  ];
  
  // Return a random response for variety
  return responses[Math.floor(Math.random() * responses.length)];
}

export function shouldCreatePlan(context: ConversationContext): boolean {
  const analysis = analyzeConversation(context);
  return analysis.shouldCreatePlan;
}

export function shouldUseTools(context: ConversationContext): boolean {
  const analysis = analyzeConversation(context);
  return analysis.shouldUseTools;
}

export function getResponseType(context: ConversationContext): string {
  const analysis = analyzeConversation(context);
  return analysis.type;
}
