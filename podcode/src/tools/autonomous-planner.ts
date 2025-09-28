import { z } from 'zod';
import { Tool, ToolContext, ToolResult } from './types.js';
import { memoryManager } from '../memory/manager.js';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

const AutonomousPlanParametersSchema = z.object({
  userRequest: z.string().describe('The user\'s request or task'),
  context: z.string().optional().describe('Additional context about current system state'),
  updatePlan: z.boolean().optional().describe('Whether this is updating an existing plan'),
  previousAttempts: z.string().optional().describe('What has been tried and failed'),
  currentProgress: z.string().optional().describe('What has been completed successfully'),
  conversationHistory: z.string().optional().describe('Recent conversation context'),
  executionResults: z.string().optional().describe('Results from recent tool executions'),
  stepFailures: z.array(z.string()).optional().describe('Specific steps that have failed'),
  newRequirements: z.string().optional().describe('New requirements discovered during execution'),
  partialSuccesses: z.string().optional().describe('Steps that partially succeeded and need refinement')
});

export class AutonomousPlannerTool implements Tool {
  name = 'create_plan';
  description = 'Autonomously analyze user requests and generate dynamic, adaptive execution plans based on user needs and context.';
  parameters = AutonomousPlanParametersSchema;

  async execute(args: z.infer<typeof AutonomousPlanParametersSchema>, context: ToolContext): Promise<ToolResult> {
    const { 
      userRequest, 
      context: taskContext, 
      updatePlan, 
      previousAttempts, 
      currentProgress, 
      conversationHistory,
      executionResults,
      stepFailures,
      newRequirements,
      partialSuccesses
    } = args;
    
    // Analyze the user request to understand intent and requirements
    const analysis = this.analyzeUserRequest(userRequest, taskContext, conversationHistory);
    
    // Generate a dynamic plan based on analysis and execution feedback
    const plan = this.generateAdaptivePlan(
      analysis, 
      updatePlan, 
      previousAttempts, 
      currentProgress, 
      executionResults,
      stepFailures,
      newRequirements,
      partialSuccesses
    );
    
    // Store plan context for future reference
    this.storePlanContext(userRequest, analysis, plan);
    
    const planType = updatePlan ? "🔄 UPDATED AUTONOMOUS PLAN" : "🧠 AUTONOMOUS PLAN";
    const message = updatePlan ? 
      `📋 ${planType} for: ${userRequest}\n\n${plan}\n\n🎯 Plan dynamically updated based on previous attempts and current context.` :
      `📋 ${planType} for: ${userRequest}\n\n${plan}\n\n✨ Plan autonomously generated based on user needs and system analysis.`;
    
    return {
      success: true,
      output: message
    };
  }

  toOpenAITool(): ChatCompletionTool {
    return {
      type: 'function' as const,
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            userRequest: {
              type: 'string',
              description: 'The user\'s request or task'
            },
            context: {
              type: 'string',
              description: 'Additional context about current system state'
            },
            updatePlan: {
              type: 'boolean',
              description: 'Whether this is updating an existing plan'
            },
            previousAttempts: {
              type: 'string',
              description: 'What has been tried and failed'
            },
            currentProgress: {
              type: 'string',
              description: 'What has been completed successfully'
            },
            conversationHistory: {
              type: 'string',
              description: 'Recent conversation context'
            },
            executionResults: {
              type: 'string',
              description: 'Results from recent tool executions'
            },
            stepFailures: {
              type: 'array',
              items: { type: 'string' },
              description: 'Specific steps that have failed'
            },
            newRequirements: {
              type: 'string',
              description: 'New requirements discovered during execution'
            },
            partialSuccesses: {
              type: 'string',
              description: 'Steps that partially succeeded and need refinement'
            }
          },
          required: ['userRequest']
        }
      }
    };
  }

  private analyzeUserRequest(request: string, context?: string, conversationHistory?: string): RequestAnalysis {
    const requestLower = request.toLowerCase();
    
    // Analyze intent and complexity
    const intent = this.identifyIntent(requestLower);
    const complexity = this.assessComplexity(request, intent);
    const urgency = this.assessUrgency(requestLower);
    const domain = this.identifyDomain(requestLower, context);
    
    // Extract key requirements and constraints
    const requirements = this.extractRequirements(request, context);
    const constraints = this.identifyConstraints(request, context);
    
    // Analyze available context
    const availableTools = this.analyzeAvailableTools(context);
    const systemState = this.analyzeSystemState(context);
    
    return {
      originalRequest: request,
      intent,
      complexity,
      urgency,
      domain,
      requirements,
      constraints,
      availableTools,
      systemState,
      conversationContext: conversationHistory
    };
  }

  private identifyIntent(request: string): Intent {
    if (request.includes('install') || request.includes('setup') || request.includes('configure')) {
      return 'installation';
    }
    if (request.includes('deploy') || request.includes('deployment')) {
      return 'deployment';
    }
    if (request.includes('login') || request.includes('authenticate') || request.includes('sign in')) {
      return 'authentication';
    }
    if (request.includes('create') || request.includes('build') || request.includes('make')) {
      return 'creation';
    }
    if (request.includes('fix') || request.includes('debug') || request.includes('error')) {
      return 'troubleshooting';
    }
    if (request.includes('test') || request.includes('testing')) {
      return 'testing';
    }
    if (request.includes('list') || request.includes('show') || request.includes('display')) {
      return 'information';
    }
    if (request.includes('update') || request.includes('upgrade')) {
      return 'update';
    }
    if (request.includes('delete') || request.includes('remove') || request.includes('clean')) {
      return 'cleanup';
    }
    return 'general';
  }

  private assessComplexity(request: string, intent: Intent): Complexity {
    const wordCount = request.split(' ').length;
    const hasMultipleActions = (request.match(/and|then|also|next|after/g) || []).length;
    const hasConditions = (request.match(/if|when|unless|provided/g) || []).length;
    
    if (wordCount > 20 || hasMultipleActions > 2 || hasConditions > 1) {
      return 'high';
    }
    if (wordCount > 10 || hasMultipleActions > 0 || intent === 'deployment' || intent === 'creation') {
      return 'medium';
    }
    return 'low';
  }

  private assessUrgency(request: string): Urgency {
    if (request.includes('urgent') || request.includes('asap') || request.includes('immediately')) {
      return 'high';
    }
    if (request.includes('quick') || request.includes('fast') || request.includes('soon')) {
      return 'medium';
    }
    return 'low';
  }

  private identifyDomain(request: string, context?: string): Domain {
    if (request.includes('web') || request.includes('html') || request.includes('css') || request.includes('javascript')) {
      return 'web';
    }
    if (request.includes('api') || request.includes('backend') || request.includes('server')) {
      return 'backend';
    }
    if (request.includes('database') || request.includes('sql') || request.includes('db')) {
      return 'database';
    }
    if (request.includes('mobile') || request.includes('app') || request.includes('ios') || request.includes('android')) {
      return 'mobile';
    }
    if (request.includes('docker') || request.includes('container') || request.includes('kubernetes')) {
      return 'devops';
    }
    if (request.includes('git') || request.includes('version') || request.includes('commit')) {
      return 'version_control';
    }
    if (request.includes('salesforce') || request.includes('sfdx') || request.includes('org')) {
      return 'salesforce';
    }
    return 'general';
  }

  private extractRequirements(request: string, context?: string): string[] {
    const requirements: string[] = [];
    
    // Extract technology requirements
    const techKeywords = ['node', 'python', 'java', 'react', 'vue', 'angular', 'typescript', 'javascript'];
    techKeywords.forEach(tech => {
      if (request.toLowerCase().includes(tech)) {
        requirements.push(`${tech} technology`);
      }
    });
    
    // Extract functional requirements
    if (request.includes('secure') || request.includes('security')) {
      requirements.push('security considerations');
    }
    if (request.includes('responsive') || request.includes('mobile')) {
      requirements.push('responsive design');
    }
    if (request.includes('fast') || request.includes('performance')) {
      requirements.push('performance optimization');
    }
    
    return requirements;
  }

  private identifyConstraints(request: string, context?: string): string[] {
    const constraints: string[] = [];
    
    if (request.includes('budget') || request.includes('free') || request.includes('cost')) {
      constraints.push('budget limitations');
    }
    if (request.includes('time') || request.includes('deadline')) {
      constraints.push('time constraints');
    }
    if (request.includes('simple') || request.includes('basic')) {
      constraints.push('simplicity requirement');
    }
    
    return constraints;
  }

  private analyzeAvailableTools(context?: string): string[] {
    // This would be populated based on actual available tools
    return [
      'file_operations', 'terminal_commands', 'code_analysis', 
      'web_search', 'memory_management', 'system_check'
    ];
  }

  private analyzeSystemState(context?: string): SystemState {
    return {
      platform: process.platform,
      nodeVersion: process.version,
      workingDirectory: process.cwd(),
      hasGit: true, // Would check actual system
      hasPackageManager: true // Would check actual system
    };
  }

  private generateAdaptivePlan(
    analysis: RequestAnalysis, 
    updatePlan?: boolean, 
    previousAttempts?: string, 
    currentProgress?: string,
    executionResults?: string,
    stepFailures?: string[],
    newRequirements?: string,
    partialSuccesses?: string
  ): string {
    let plan = '';
    
    // Add comprehensive adaptive strategy if updating
    if (updatePlan) {
      plan += this.generateAdvancedAdaptiveStrategy(
        analysis, 
        previousAttempts, 
        currentProgress, 
        executionResults,
        stepFailures,
        newRequirements,
        partialSuccesses
      );
    }
    
    // Generate domain-specific plan with execution feedback
    plan += this.generateAdaptiveDomainPlan(
      analysis, 
      stepFailures, 
      newRequirements, 
      partialSuccesses
    );
    
    // Add dynamic execution strategy
    plan += this.generateDynamicExecutionStrategy(analysis, updatePlan);
    
    // Add comprehensive monitoring and validation
    plan += this.generateAdvancedMonitoringStrategy(analysis, updatePlan);
    
    return plan;
  }

  private generateAdvancedAdaptiveStrategy(
    analysis: RequestAnalysis, 
    previousAttempts?: string, 
    currentProgress?: string,
    executionResults?: string,
    stepFailures?: string[],
    newRequirements?: string,
    partialSuccesses?: string
  ): string {
    return `
🔄 ADVANCED ADAPTIVE STRATEGY:

📊 EXECUTION ANALYSIS:
- Previous attempts: ${previousAttempts || 'None documented'}
- Current progress: ${currentProgress || 'Starting fresh'}
- Execution results: ${executionResults || 'No results yet'}

🚨 FAILURE ANALYSIS:
${stepFailures && stepFailures.length > 0 ? 
  stepFailures.map(failure => `- Failed step: ${failure}`).join('\n') : 
  '- No specific failures documented'}

✨ PARTIAL SUCCESSES:
${partialSuccesses || 'None documented'}

🎯 NEW REQUIREMENTS DISCOVERED:
${newRequirements || 'None identified'}

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

`;
  }

  private generateAdaptiveDomainPlan(
    analysis: RequestAnalysis, 
    stepFailures?: string[], 
    newRequirements?: string, 
    partialSuccesses?: string
  ): string {
    const { intent, complexity, domain, requirements } = analysis;
    
    let plan = `🎯 ADAPTIVE EXECUTION PLAN:

INTENT: ${intent.toUpperCase()}
COMPLEXITY: ${complexity.toUpperCase()}
DOMAIN: ${domain.toUpperCase()}
REQUIREMENTS: ${requirements.join(', ') || 'None specified'}

${newRequirements ? `🎯 NEW REQUIREMENTS: ${newRequirements}\n` : ''}
${partialSuccesses ? `✨ PARTIAL SUCCESSES TO BUILD ON: ${partialSuccesses}\n` : ''}
${stepFailures && stepFailures.length > 0 ? `🚨 FAILED STEPS TO ADDRESS: ${stepFailures.join(', ')}\n` : ''}

`;

    // Generate adaptive steps based on intent, domain, and execution feedback
    switch (intent) {
      case 'authentication':
        plan += this.generateAdaptiveAuthenticationSteps(analysis, stepFailures, newRequirements);
        break;
      case 'installation':
        plan += this.generateAdaptiveInstallationSteps(analysis, stepFailures, newRequirements);
        break;
      case 'creation':
        plan += this.generateAdaptiveCreationSteps(analysis, stepFailures, newRequirements);
        break;
      case 'deployment':
        plan += this.generateAdaptiveDeploymentSteps(analysis, stepFailures, newRequirements);
        break;
      case 'troubleshooting':
        plan += this.generateAdaptiveTroubleshootingSteps(analysis, stepFailures, newRequirements);
        break;
      case 'information':
        plan += this.generateAdaptiveInformationSteps(analysis, stepFailures, newRequirements);
        break;
      default:
        plan += this.generateAdaptiveGenericSteps(analysis, stepFailures, newRequirements);
    }
    
    return plan;
  }

  private generateDomainSpecificPlan(analysis: RequestAnalysis): string {
    const { intent, complexity, domain, requirements } = analysis;
    
    let plan = `🎯 AUTONOMOUS EXECUTION PLAN:

INTENT: ${intent.toUpperCase()}
COMPLEXITY: ${complexity.toUpperCase()}
DOMAIN: ${domain.toUpperCase()}
REQUIREMENTS: ${requirements.join(', ') || 'None specified'}

`;

    // Generate steps based on intent and domain
    switch (intent) {
      case 'authentication':
        plan += this.generateAuthenticationSteps(analysis);
        break;
      case 'installation':
        plan += this.generateInstallationSteps(analysis);
        break;
      case 'creation':
        plan += this.generateCreationSteps(analysis);
        break;
      case 'deployment':
        plan += this.generateDeploymentSteps(analysis);
        break;
      case 'troubleshooting':
        plan += this.generateTroubleshootingSteps(analysis);
        break;
      case 'information':
        plan += this.generateInformationSteps(analysis);
        break;
      default:
        plan += this.generateGenericSteps(analysis);
    }
    
    return plan;
  }

  private generateAuthenticationSteps(analysis: RequestAnalysis): string {
    return `
STEP 1: Analyze Authentication Requirements
  → Identify target system/service from request: "${analysis.originalRequest}"
  → Check available authentication methods
  → Determine required credentials or setup

STEP 2: Check Current Authentication State
  → Verify existing authentication status
  → Check for stored credentials or sessions
  → Identify authentication gaps

STEP 3: Execute Authentication Process
  → Use appropriate authentication method
  → Handle interactive prompts or browser-based auth
  → Configure authentication settings if needed

STEP 4: Validate Authentication Success
  → Test authentication with a simple operation
  → Verify permissions and access levels
  → Confirm ready for main task execution

`;
  }

  private generateInstallationSteps(analysis: RequestAnalysis): string {
    return `
STEP 1: System Analysis
  → Assess current system capabilities
  → Identify target software from: "${analysis.originalRequest}"
  → Check for existing installations or conflicts

STEP 2: Prerequisites Check
  → Verify system requirements
  → Install missing dependencies
  → Prepare installation environment

STEP 3: Installation Execution
  → Execute installation using appropriate method
  → Monitor installation progress
  → Handle any installation errors or prompts

STEP 4: Post-Installation Setup
  → Configure installed software
  → Test installation success
  → Set up environment variables if needed

`;
  }

  private generateCreationSteps(analysis: RequestAnalysis): string {
    return `
STEP 1: Project Analysis
  → Understand creation requirements from: "${analysis.originalRequest}"
  → Identify project type and structure needed
  → Plan project architecture and components

STEP 2: Environment Preparation
  → Set up development environment
  → Create project directory structure
  → Initialize necessary configuration files

STEP 3: Implementation
  → Create core project files
  → Implement main functionality
  → Add necessary dependencies and configurations

STEP 4: Validation and Testing
  → Test created project functionality
  → Verify all requirements are met
  → Document usage and setup instructions

`;
  }

  private generateDeploymentSteps(analysis: RequestAnalysis): string {
    return `
STEP 1: Deployment Planning
  → Analyze deployment target from: "${analysis.originalRequest}"
  → Identify deployment strategy and platform
  → Check deployment prerequisites

STEP 2: Pre-Deployment Checks
  → Verify code is ready for deployment
  → Run tests and quality checks
  → Prepare deployment artifacts

STEP 3: Deployment Execution
  → Execute deployment process
  → Monitor deployment progress
  → Handle deployment-specific configurations

STEP 4: Post-Deployment Validation
  → Test deployed application
  → Verify all functionality works
  → Monitor for deployment issues

`;
  }

  private generateTroubleshootingSteps(analysis: RequestAnalysis): string {
    return `
STEP 1: Problem Analysis
  → Analyze issue described in: "${analysis.originalRequest}"
  → Identify symptoms and error patterns
  → Check system logs and error messages

STEP 2: Root Cause Investigation
  → Examine relevant code and configurations
  → Test different scenarios to isolate issue
  → Research similar problems and solutions

STEP 3: Solution Implementation
  → Apply identified fixes
  → Test solutions incrementally
  → Document changes made

STEP 4: Verification and Prevention
  → Verify issue is completely resolved
  → Test system functionality
  → Implement preventive measures

`;
  }

  private generateInformationSteps(analysis: RequestAnalysis): string {
    return `
STEP 1: Information Gathering
  → Analyze information request: "${analysis.originalRequest}"
  → Identify relevant data sources
  → Determine information format needed

STEP 2: Data Collection
  → Gather requested information
  → Organize and structure data
  → Verify information accuracy

STEP 3: Presentation
  → Format information appropriately
  → Present data in clear, useful format
  → Provide additional context if helpful

`;
  }

  private generateGenericSteps(analysis: RequestAnalysis): string {
    return `
STEP 1: Task Analysis
  → Break down request: "${analysis.originalRequest}"
  → Identify required actions and tools
  → Plan execution approach

STEP 2: Preparation
  → Gather necessary resources
  → Set up required environment
  → Prepare for execution

STEP 3: Execution
  → Execute planned actions
  → Monitor progress and handle issues
  → Adapt approach as needed

STEP 4: Completion
  → Verify task completion
  → Test results
  → Clean up temporary resources

`;
  }

  private generateExecutionStrategy(analysis: RequestAnalysis): string {
    return `
🚀 EXECUTION STRATEGY:
- Use parallel execution where possible for efficiency
- Implement error handling and retry mechanisms
- Monitor progress and adapt approach dynamically
- Validate each step before proceeding to next
- Maintain detailed logs for troubleshooting

`;
  }

  private generateMonitoringStrategy(analysis: RequestAnalysis): string {
    return `
📊 MONITORING & VALIDATION:
- Track progress through each step
- Validate outputs and intermediate results
- Monitor for errors or unexpected behavior
- Adapt plan based on real-time feedback
- Ensure complete task fulfillment

`;
  }

  // Adaptive step generation methods that can modify plans based on execution feedback
  private generateAdaptiveAuthenticationSteps(analysis: RequestAnalysis, stepFailures?: string[], newRequirements?: string): string {
    const hasAuthFailures = stepFailures?.some(failure => failure.toLowerCase().includes('auth')) || false;
    
    return `
STEP 1: Enhanced Authentication Analysis
  → Deep analysis of request: "${analysis.originalRequest}"
  → ${hasAuthFailures ? '🔧 ADAPTIVE: Address previous authentication failures' : 'Check authentication requirements'}
  → ${newRequirements ? `🔧 NEW: Incorporate discovered requirements: ${newRequirements}` : 'Verify authentication methods'}
  → Use system_check to verify required tools and configurations

STEP 2: Robust Authentication State Check
  → ${hasAuthFailures ? '🔧 ADAPTIVE: Use alternative methods to check auth state' : 'Check current authentication status'}
  → Verify stored credentials and session validity
  → ${hasAuthFailures ? '🔧 ADAPTIVE: Try multiple authentication endpoints' : 'Identify authentication gaps'}

STEP 3: Dynamic Authentication Execution
  → ${hasAuthFailures ? '🔧 ADAPTIVE: Use fallback authentication methods' : 'Execute primary authentication method'}
  → Handle interactive prompts with timeout mechanisms
  → ${newRequirements ? '🔧 NEW: Apply new authentication requirements' : 'Configure authentication settings'}

STEP 4: Comprehensive Validation
  → ${hasAuthFailures ? '🔧 ADAPTIVE: Test multiple authentication scenarios' : 'Test authentication with core operations'}
  → Verify permissions and access levels thoroughly
  → ${newRequirements ? '🔧 NEW: Validate new requirements are met' : 'Confirm ready for main task'}

${newRequirements ? `\nSTEP 5: NEW REQUIREMENT FULFILLMENT
  → Implement discovered requirements: ${newRequirements}
  → Validate new functionality works correctly
  → Update authentication configuration as needed\n` : ''}

`;
  }

  private generateAdaptiveInstallationSteps(analysis: RequestAnalysis, stepFailures?: string[], newRequirements?: string): string {
    const hasInstallFailures = stepFailures?.some(failure => failure.toLowerCase().includes('install')) || false;
    
    return `
STEP 1: Comprehensive System Analysis
  → ${hasInstallFailures ? '🔧 ADAPTIVE: Analyze previous installation failures' : 'Assess current system capabilities'}
  → Deep analysis of installation target from: "${analysis.originalRequest}"
  → ${hasInstallFailures ? '🔧 ADAPTIVE: Check for conflicting installations' : 'Check for existing installations'}

STEP 2: Enhanced Prerequisites Check
  → ${hasInstallFailures ? '🔧 ADAPTIVE: Install missing dependencies with alternative methods' : 'Verify system requirements'}
  → ${newRequirements ? `🔧 NEW: Install prerequisites for: ${newRequirements}` : 'Install missing dependencies'}
  → ${hasInstallFailures ? '🔧 ADAPTIVE: Use multiple package managers if needed' : 'Prepare installation environment'}

STEP 3: Robust Installation Execution
  → ${hasInstallFailures ? '🔧 ADAPTIVE: Use alternative installation methods' : 'Execute installation with primary method'}
  → Monitor installation progress with detailed logging
  → ${hasInstallFailures ? '🔧 ADAPTIVE: Handle installation errors with retry logic' : 'Handle installation prompts'}

STEP 4: Advanced Post-Installation Setup
  → ${hasInstallFailures ? '🔧 ADAPTIVE: Verify installation integrity' : 'Configure installed software'}
  → ${newRequirements ? `🔧 NEW: Configure for new requirements: ${newRequirements}` : 'Test installation success'}
  → ${hasInstallFailures ? '🔧 ADAPTIVE: Set up environment with multiple fallbacks' : 'Set up environment variables'}

${newRequirements ? `\nSTEP 5: NEW REQUIREMENT IMPLEMENTATION
  → Install and configure components for: ${newRequirements}
  → Test integration with main installation
  → Validate all new requirements are satisfied\n` : ''}

`;
  }

  private generateAdaptiveCreationSteps(analysis: RequestAnalysis, stepFailures?: string[], newRequirements?: string): string {
    const hasCreationFailures = stepFailures?.some(failure => failure.toLowerCase().includes('create')) || false;
    
    return `
STEP 1: Enhanced Project Analysis
  → ${hasCreationFailures ? '🔧 ADAPTIVE: Analyze previous creation failures' : 'Deep analysis of creation requirements'}
  → Comprehensive understanding of: "${analysis.originalRequest}"
  → ${hasCreationFailures ? '🔧 ADAPTIVE: Identify and resolve creation blockers' : 'Plan project architecture'}

STEP 2: Robust Environment Preparation
  → ${hasCreationFailures ? '🔧 ADAPTIVE: Use alternative setup methods' : 'Set up development environment'}
  → ${newRequirements ? `🔧 NEW: Prepare environment for: ${newRequirements}` : 'Create project structure'}
  → ${hasCreationFailures ? '🔧 ADAPTIVE: Create with multiple fallback approaches' : 'Initialize configuration files'}

STEP 3: Dynamic Implementation
  → ${hasCreationFailures ? '🔧 ADAPTIVE: Implement with alternative approaches' : 'Create core project files'}
  → ${newRequirements ? `🔧 NEW: Implement new requirement features` : 'Implement main functionality'}
  → ${hasCreationFailures ? '🔧 ADAPTIVE: Use different tools or frameworks if needed' : 'Add dependencies'}

STEP 4: Comprehensive Validation
  → ${hasCreationFailures ? '🔧 ADAPTIVE: Test with multiple scenarios' : 'Test created project functionality'}
  → ${newRequirements ? `🔧 NEW: Validate new requirements: ${newRequirements}` : 'Verify all requirements met'}
  → ${hasCreationFailures ? '🔧 ADAPTIVE: Document lessons learned' : 'Document usage instructions'}

${newRequirements ? `\nSTEP 5: NEW REQUIREMENT INTEGRATION
  → Integrate new features: ${newRequirements}
  → Test complete integration
  → Update documentation for new functionality\n` : ''}

`;
  }

  private generateAdaptiveDeploymentSteps(analysis: RequestAnalysis, stepFailures?: string[], newRequirements?: string): string {
    const hasDeployFailures = stepFailures?.some(failure => failure.toLowerCase().includes('deploy')) || false;
    
    return `
STEP 1: Enhanced Deployment Planning
  → ${hasDeployFailures ? '🔧 ADAPTIVE: Analyze previous deployment failures' : 'Analyze deployment target'}
  → Comprehensive analysis of: "${analysis.originalRequest}"
  → ${hasDeployFailures ? '🔧 ADAPTIVE: Identify deployment bottlenecks' : 'Identify deployment strategy'}

STEP 2: Robust Pre-Deployment Checks
  → ${hasDeployFailures ? '🔧 ADAPTIVE: Use alternative validation methods' : 'Verify code readiness'}
  → ${newRequirements ? `🔧 NEW: Validate new requirements for deployment` : 'Run comprehensive tests'}
  → ${hasDeployFailures ? '🔧 ADAPTIVE: Prepare multiple deployment artifacts' : 'Prepare deployment artifacts'}

STEP 3: Dynamic Deployment Execution
  → ${hasDeployFailures ? '🔧 ADAPTIVE: Use alternative deployment methods' : 'Execute deployment process'}
  → ${newRequirements ? `🔧 NEW: Deploy with new requirement configurations` : 'Monitor deployment progress'}
  → ${hasDeployFailures ? '🔧 ADAPTIVE: Implement deployment rollback mechanisms' : 'Handle deployment configurations'}

STEP 4: Comprehensive Post-Deployment Validation
  → ${hasDeployFailures ? '🔧 ADAPTIVE: Test with multiple validation scenarios' : 'Test deployed application'}
  → ${newRequirements ? `🔧 NEW: Validate new requirement functionality` : 'Verify all functionality works'}
  → ${hasDeployFailures ? '🔧 ADAPTIVE: Monitor with enhanced error detection' : 'Monitor for issues'}

${newRequirements ? `\nSTEP 5: NEW REQUIREMENT VALIDATION
  → Test new features in production: ${newRequirements}
  → Validate performance and integration
  → Monitor new functionality for issues\n` : ''}

`;
  }

  private generateAdaptiveTroubleshootingSteps(analysis: RequestAnalysis, stepFailures?: string[], newRequirements?: string): string {
    const hasTroubleshootFailures = stepFailures?.some(failure => failure.toLowerCase().includes('troubleshoot')) || false;
    
    return `
STEP 1: Enhanced Problem Analysis
  → ${hasTroubleshootFailures ? '🔧 ADAPTIVE: Use alternative diagnostic methods' : 'Deep analysis of issue'}
  → Comprehensive examination of: "${analysis.originalRequest}"
  → ${hasTroubleshootFailures ? '🔧 ADAPTIVE: Try multiple diagnostic approaches' : 'Identify symptoms and patterns'}

STEP 2: Dynamic Root Cause Investigation
  → ${hasTroubleshootFailures ? '🔧 ADAPTIVE: Use alternative investigation methods' : 'Examine relevant code and configs'}
  → ${newRequirements ? `🔧 NEW: Check for issues related to: ${newRequirements}` : 'Test different scenarios'}
  → ${hasTroubleshootFailures ? '🔧 ADAPTIVE: Research with multiple sources' : 'Research similar problems'}

STEP 3: Adaptive Solution Implementation
  → ${hasTroubleshootFailures ? '🔧 ADAPTIVE: Try alternative solution approaches' : 'Apply identified fixes'}
  → ${newRequirements ? `🔧 NEW: Implement fixes for new requirement issues` : 'Test solutions incrementally'}
  → ${hasTroubleshootFailures ? '🔧 ADAPTIVE: Document all attempted solutions' : 'Document changes made'}

STEP 4: Comprehensive Verification
  → ${hasTroubleshootFailures ? '🔧 ADAPTIVE: Verify with multiple test scenarios' : 'Verify issue resolution'}
  → ${newRequirements ? `🔧 NEW: Test new requirement functionality` : 'Test system functionality'}
  → ${hasTroubleshootFailures ? '🔧 ADAPTIVE: Implement enhanced monitoring' : 'Implement preventive measures'}

${newRequirements ? `\nSTEP 5: NEW REQUIREMENT TROUBLESHOOTING
  → Address any issues with: ${newRequirements}
  → Ensure new functionality is stable
  → Document troubleshooting steps for new features\n` : ''}

`;
  }

  private generateAdaptiveInformationSteps(analysis: RequestAnalysis, stepFailures?: string[], newRequirements?: string): string {
    const hasInfoFailures = stepFailures?.some(failure => failure.toLowerCase().includes('information')) || false;
    
    return `
STEP 1: Enhanced Information Gathering
  → ${hasInfoFailures ? '🔧 ADAPTIVE: Use alternative data sources' : 'Analyze information request'}
  → Comprehensive analysis of: "${analysis.originalRequest}"
  → ${hasInfoFailures ? '🔧 ADAPTIVE: Try multiple collection methods' : 'Identify relevant data sources'}

STEP 2: Robust Data Collection
  → ${hasInfoFailures ? '🔧 ADAPTIVE: Use backup data sources' : 'Gather requested information'}
  → ${newRequirements ? `🔧 NEW: Collect additional data for: ${newRequirements}` : 'Organize and structure data'}
  → ${hasInfoFailures ? '🔧 ADAPTIVE: Validate data from multiple sources' : 'Verify information accuracy'}

STEP 3: Dynamic Presentation
  → ${hasInfoFailures ? '🔧 ADAPTIVE: Use alternative presentation formats' : 'Format information appropriately'}
  → ${newRequirements ? `🔧 NEW: Include information for new requirements` : 'Present data clearly'}
  → ${hasInfoFailures ? '🔧 ADAPTIVE: Provide multiple output formats' : 'Provide additional context'}

${newRequirements ? `\nSTEP 4: NEW REQUIREMENT INFORMATION
  → Gather and present information about: ${newRequirements}
  → Integrate with existing information
  → Provide comprehensive overview\n` : ''}

`;
  }

  private generateAdaptiveGenericSteps(analysis: RequestAnalysis, stepFailures?: string[], newRequirements?: string): string {
    const hasGenericFailures = stepFailures?.some(failure => failure.toLowerCase().includes('generic')) || false;
    
    return `
STEP 1: Enhanced Task Analysis
  → ${hasGenericFailures ? '🔧 ADAPTIVE: Use alternative analysis methods' : 'Break down request'}
  → Comprehensive analysis of: "${analysis.originalRequest}"
  → ${hasGenericFailures ? '🔧 ADAPTIVE: Try different task breakdown approaches' : 'Identify required actions'}

STEP 2: Robust Preparation
  → ${hasGenericFailures ? '🔧 ADAPTIVE: Use alternative resource gathering' : 'Gather necessary resources'}
  → ${newRequirements ? `🔧 NEW: Prepare resources for: ${newRequirements}` : 'Set up required environment'}
  → ${hasGenericFailures ? '🔧 ADAPTIVE: Prepare multiple execution approaches' : 'Prepare for execution'}

STEP 3: Dynamic Execution
  → ${hasGenericFailures ? '🔧 ADAPTIVE: Use alternative execution methods' : 'Execute planned actions'}
  → ${newRequirements ? `🔧 NEW: Execute new requirement tasks` : 'Monitor progress'}
  → ${hasGenericFailures ? '🔧 ADAPTIVE: Adapt approach with multiple strategies' : 'Handle issues as they arise'}

STEP 4: Comprehensive Completion
  → ${hasGenericFailures ? '🔧 ADAPTIVE: Verify with multiple validation methods' : 'Verify task completion'}
  → ${newRequirements ? `🔧 NEW: Validate new requirement completion` : 'Test results'}
  → ${hasGenericFailures ? '🔧 ADAPTIVE: Clean up with enhanced error handling' : 'Clean up resources'}

${newRequirements ? `\nSTEP 5: NEW REQUIREMENT COMPLETION
  → Complete tasks for: ${newRequirements}
  → Validate all new requirements are met
  → Document new functionality\n` : ''}

`;
  }

  private generateDynamicExecutionStrategy(analysis: RequestAnalysis, updatePlan?: boolean): string {
    return `
🚀 DYNAMIC EXECUTION STRATEGY:
- ${updatePlan ? 'Use adaptive execution based on previous attempts' : 'Implement parallel execution where possible'}
- ${updatePlan ? 'Apply learned lessons from failures' : 'Use efficient tool selection'}
- ${updatePlan ? 'Implement retry mechanisms with smart backoff' : 'Implement error handling and retry mechanisms'}
- ${updatePlan ? 'Monitor with enhanced error detection' : 'Monitor progress and adapt approach dynamically'}
- ${updatePlan ? 'Validate each step with multiple methods' : 'Validate each step before proceeding'}
- ${updatePlan ? 'Maintain detailed logs for future learning' : 'Maintain detailed logs for troubleshooting'}

`;
  }

  private generateAdvancedMonitoringStrategy(analysis: RequestAnalysis, updatePlan?: boolean): string {
    return `
📊 ADVANCED MONITORING & VALIDATION:
- ${updatePlan ? 'Enhanced progress tracking with failure analysis' : 'Track progress through each step'}
- ${updatePlan ? 'Validate outputs with multiple verification methods' : 'Validate outputs and intermediate results'}
- ${updatePlan ? 'Monitor with predictive error detection' : 'Monitor for errors or unexpected behavior'}
- ${updatePlan ? 'Adapt plan based on comprehensive feedback analysis' : 'Adapt plan based on real-time feedback'}
- ${updatePlan ? 'Ensure complete task fulfillment with requirement validation' : 'Ensure complete task fulfillment'}
- ${updatePlan ? 'Store execution patterns for future optimization' : 'Document lessons learned'}

`;
  }

  private storePlanContext(request: string, analysis: RequestAnalysis, plan: string): void {
    // Store in memory for future reference and learning
    const context = {
      request,
      analysis,
      plan,
      timestamp: new Date().toISOString(),
      success: false // Will be updated when plan completes
    };
    
    // This would integrate with memory manager for persistence
    memoryManager.addMessage({
      role: 'system',
      content: `Plan context stored: ${request}`,
      timestamp: new Date()
    });
  }
}

// Type definitions for the autonomous planner
interface RequestAnalysis {
  originalRequest: string;
  intent: Intent;
  complexity: Complexity;
  urgency: Urgency;
  domain: Domain;
  requirements: string[];
  constraints: string[];
  availableTools: string[];
  systemState: SystemState;
  conversationContext?: string;
}

type Intent = 'installation' | 'deployment' | 'authentication' | 'creation' | 'troubleshooting' | 'testing' | 'information' | 'update' | 'cleanup' | 'general';
type Complexity = 'low' | 'medium' | 'high';
type Urgency = 'low' | 'medium' | 'high';
type Domain = 'web' | 'backend' | 'database' | 'mobile' | 'devops' | 'version_control' | 'salesforce' | 'general';

interface SystemState {
  platform: string;
  nodeVersion: string;
  workingDirectory: string;
  hasGit: boolean;
  hasPackageManager: boolean;
}
