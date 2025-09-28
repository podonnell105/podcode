#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import enquirer from 'enquirer';
const { prompt } = enquirer;
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { config } from './config.js';
import { AIClient } from './client.js';
import { toolRegistry } from './tools/registry.js';
import { MCPClient } from './mcp/client.js';
import { sessionManager } from './session/manager.js';
import { memoryManager } from './memory/manager.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { SessionMessage, ToolExecution } from './memory/types.js';
import { generateSystemPrompt, getEnvironmentDetails } from './system-prompt.js';
import { displayLogo } from './logo.js';
import { AIOrchestrator } from './orchestrator.js';
import { displayScrollableOutput } from './utils/terminal-output.js';
import { UIFormatter } from './utils/ui-formatter.js';

// Helper function to update plan after tool failure (Claude Code style)
async function updatePlanAfterFailure(
  failedToolName: string,
  error: string,
  session: any,
  orchestrator: any,
  model: string
) {
  try {
    // Find the most recent plan
    const recentPlans = orchestrator.activePlans ? Array.from(orchestrator.activePlans.values()) as any[] : [];
    const activePlan = recentPlans.filter((p: any) => p.status === 'active').sort((a: any, b: any) => b.planId.localeCompare(a.planId))[0];
    
    if (activePlan) {
      console.log(chalk.cyan(`📝 Updating plan: ${activePlan.planId}`));
      console.log(chalk.gray(`Failed: ${failedToolName} - ${error}`));
      
      const updateResult = await orchestrator.updatePlan(
        activePlan.planId,
        `Tool ${failedToolName} failed: ${error}`,
        [failedToolName],
        [`Find alternative approach for ${failedToolName}`, 'Try different tool or method', 'Fallback to basic commands']
      );
      
      if (updateResult.updated && updateResult.newSteps) {
        console.log(chalk.green(`✅ Plan updated with ${updateResult.newSteps.length} new steps`));
        console.log(chalk.gray(`Reason: ${updateResult.reason}`));
        console.log(chalk.cyan(`New steps:`));
        updateResult.newSteps.forEach((step: string, index: number) => {
          console.log(chalk.gray(`  ${index + 1}. ${step}`));
        });
        
        return true;
      } else {
        console.log(chalk.yellow(`ℹ️ Plan update not needed: ${updateResult.reason}`));
      }
    } else {
      console.log(chalk.yellow(`ℹ️ No active plan found to update`));
    }
  } catch (error) {
    console.log(chalk.red(`❌ Failed to update plan: ${error instanceof Error ? error.message : String(error)}`));
  }
  return false;
}

// Execute a plan directly without step queue system
async function executePlan(
  planResult: any,
  session: any,
  allTools: any[],
  mcpClient: any,
  aiClient: any,
  orchestrator: any,
  model: string
) {
  console.log(UIFormatter.createSectionHeader('Plan Execution', '📋'));
  console.log(UIFormatter.createPlanBox(planResult.title || 'Execution Plan', planResult.planId, planResult.steps));
  
  for (let i = 0; i < planResult.steps.length; i++) {
    const step = planResult.steps[i];
    console.log('\n' + UIFormatter.createTaskBox(i + 1, planResult.steps.length, step));
    
    // Execute step autonomously like Cursor (no user approval needed)
    console.log(chalk.yellow(`\n🚀 Executing step ${i + 1}...`));
    
    try {
      // Create a message that represents this step for the AI to execute
      const stepMessage: ChatCompletionMessageParam = {
        role: 'user',
        content: `Execute this step from the plan: "${step}". 

Execute the actual command or action described in the step directly.`
      };
      
      // Add step message to session
      sessionManager.addMessage(session.id, stepMessage);
      
      // Generate system message for step execution
      const envDetails = await getEnvironmentDetails(session.workingDirectory, model);
      const systemPrompt = generateSystemPrompt(envDetails);
      
      // Create a fresh copy of messages for this step to avoid contamination
      const messages = [...sessionManager.getMessages(session.id)];
      messages.unshift({
        role: 'system',
        content: systemPrompt
      });
      
      // Get AI response for this step
      const response = await aiClient.chat(
        messages,
        allTools,
        'auto' // Let AI decide whether to use tools
      );

      const assistantMessage = response.choices[0].message;
      
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        // Add assistant message with tool calls
        sessionManager.addMessage(session.id, assistantMessage);
        
        // Execute tool calls for this step
        const toolResponses = await executeToolCalls(assistantMessage, session, allTools, mcpClient, aiClient, orchestrator, model);
        
        // Only mark step as completed if we got responses for all tool calls
        if (toolResponses && toolResponses.length === assistantMessage.tool_calls.length) {
          console.log('\n' + UIFormatter.createStatusBox('completed', `Step ${i + 1} completed successfully`));
        } else {
          console.log('\n' + UIFormatter.createStatusBox('failed', `Step ${i + 1} may have incomplete tool responses`));
        }
      } else if (assistantMessage.content) {
        // Simple response for this step
        console.log(chalk.blue('Assistant:'), assistantMessage.content);
        sessionManager.addMessage(session.id, assistantMessage);
        console.log('\n' + UIFormatter.createStatusBox('completed', `Step ${i + 1} completed successfully`));
      }
      
    } catch (error) {
      console.log('\n' + UIFormatter.createStatusBox('failed', `Step ${i + 1} failed: ${error instanceof Error ? error.message : String(error)}`));
      
      // Autonomous error handling like Cursor - try to update plan and continue
      console.log(chalk.yellow(`\n🔄 Attempting to update plan due to step failure...`));
      const planUpdated = await updatePlanAfterFailure(`Step ${i + 1}`, error instanceof Error ? error.message : String(error), session, orchestrator, model);
      
      if (planUpdated) {
        console.log(chalk.cyan(`🔄 Plan updated with alternative approach - continuing autonomously`));
        
        // Get the updated plan and continue execution autonomously
        const recentPlans = orchestrator.activePlans ? Array.from(orchestrator.activePlans.values()) as any[] : [];
        const activePlan = recentPlans.filter((p: any) => p.status === 'active').sort((a: any, b: any) => b.planId.localeCompare(a.planId))[0];
        
        if (activePlan && activePlan.steps && activePlan.steps.length > 0) {
          // Continue with the updated plan steps autonomously
          await executePlan(activePlan, session, allTools, mcpClient, aiClient, orchestrator, model);
          return; // Exit current execution since we're continuing with updated plan
        }
      } else {
        // If plan update fails, continue to next step autonomously
        console.log(chalk.yellow(`⚠️ Continuing to next step autonomously...`));
      }
    }
  }
  
  console.log('\n' + UIFormatter.createStatusBox('completed', `Plan execution completed: ${planResult.title || 'Execution Plan'}`));
  
  // Mark plan as completed
  orchestrator.completePlan(planResult.planId, true);
}




// Autonomous execution helper function
async function executeToolCalls(
  message: any,
  session: any,
  allTools: any[],
  mcpClient: any,
  aiClient: any,
  orchestrator?: any,
  model?: string
) {
  if (!message.tool_calls || message.tool_calls.length === 0) return [];

  // Track all tool responses to ensure we have responses for all tool calls
  const toolResponses: ChatCompletionMessageParam[] = [];
    
  // Execute all tool calls in sequence
  for (const toolCall of message.tool_calls) {
    const toolName = toolCall.function.name;
    let toolArgs;
    
    try {
      toolArgs = JSON.parse(toolCall.function.arguments);
    } catch (error) {
      console.log(chalk.red(`❌ Failed to parse tool arguments: ${error instanceof Error ? error.message : String(error)}`));
      console.log(chalk.gray(`   Raw arguments: ${toolCall.function.arguments}`));
      // Create empty args to continue
      toolArgs = {};
    }
    
    console.log('\n' + UIFormatter.createToolBox(toolName, toolArgs));
    
    const startTime = Date.now();
    let result;
    
    // Prioritize MCP tools - check MCP first
    if (mcpClient.hasTool(toolName)) {
      // Ensure absolute paths for MCP tools
      const processedArgs = { ...toolArgs };
      if (processedArgs.directory && !path.isAbsolute(processedArgs.directory)) {
        processedArgs.directory = path.resolve(session.workingDirectory, processedArgs.directory);
      }
      if (processedArgs.workingDirectory && !path.isAbsolute(processedArgs.workingDirectory)) {
        processedArgs.workingDirectory = path.resolve(session.workingDirectory, processedArgs.workingDirectory);
      }
      
      console.log(chalk.blue(`🔌 Using MCP tool: ${toolName}`));
      result = await mcpClient.executeTool(toolName, processedArgs, {
        sessionId: session.id,
        workingDirectory: session.workingDirectory
      });
    } else {
      // Built-in tool
      const tool = toolRegistry.get(toolName);
      if (tool) {
        result = await tool.execute(toolArgs, {
          sessionId: session.id,
          workingDirectory: session.workingDirectory
        });
      } else {
        result = {
          success: false,
          output: '',
          error: `Unknown tool: ${toolName}`
        };
      }
    }

    const duration = Date.now() - startTime;

    // Show results immediately
    if (!result.success) {
      if (toolName === 'bash') {
        console.log('\n' + UIFormatter.createCommandBox(toolArgs.command || 'Unknown command', 'error'));
        if (result.output && result.output.trim()) {
          // Check if scrollable mode was requested
          if (toolArgs.scrollable) {
            console.log(chalk.gray(`📤 Output (scrollable):`));
            // Use the displayScrollableOutput utility
            await displayScrollableOutput(result.output);
          } else {
            console.log('\n' + UIFormatter.createOutputBox(result.output, 'Error Output'));
          }
        }
      } else {
        console.log('\n' + UIFormatter.createStatusBox('failed', result.error));
      }
      
      // For tool failures, don't automatically update plans - let the user decide
      console.log(chalk.yellow(`\n⚠️ Tool failed. You can ask me to update the plan or try a different approach.`));
    } else if (result.output) {
      // Show success message and output based on tool type
      if (toolName.includes('plan') || toolName.includes('memory') || toolName.includes('system')) {
        console.log('\n' + UIFormatter.createStatusBox('completed', 'Success'));
        console.log('\n' + UIFormatter.createOutputBox(result.output, 'Result'));
      } else if (toolName === 'bash') {
        // For bash commands, show output with better formatting
        console.log('\n' + UIFormatter.createCommandBox(toolArgs.command || 'Unknown command', 'success'));
        
        if (result.output.trim()) {
          // Check if scrollable mode was requested
          if (toolArgs.scrollable) {
            console.log(chalk.gray(`📤 Output (scrollable):`));
            // Use the displayScrollableOutput utility
            await displayScrollableOutput(result.output);
          } else {
            console.log('\n' + UIFormatter.createOutputBox(result.output, 'Command Output'));
          }
        }
      } else if (toolName === 'todo_write') {
        // Show todo_write output
        console.log('\n' + UIFormatter.createStatusBox('completed', result.output));
      } else {
        // For other simple tools, just show the output
        console.log('\n' + UIFormatter.createOutputBox(result.output, 'Tool Output'));
      }
    }

    // Track tool execution in memory
    const toolExecution: ToolExecution = {
      toolName,
      args: toolArgs,
      result,
      timestamp: new Date(),
      duration
    };
    memoryManager.addToolExecution(toolExecution);

    // Create tool response message
    const toolMessage: ChatCompletionMessageParam = {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: result.success ? result.output : `Error: ${result.error}`
    };
    
    // Add tool response to session and to our tracking array
    sessionManager.addMessage(session.id, toolMessage);
    
    // Preserve metadata for step executor responses
    const toolResponseWithMetadata = {
      ...toolMessage,
      metadata: result.metadata
    };
    
    toolResponses.push(toolResponseWithMetadata as any);
  }
  
  return toolResponses;
}


const program = new Command();

async function main() {
  // Load configuration
  await config.load();
  const cfg = config.get();

  if (!cfg.apiKey) {
    console.error(chalk.red('Error: No API key found. Please set OPENAI_API_KEY or CORPORATE_API_KEY environment variable.'));
    process.exit(1);
  }

  // Initialize clients
  const aiClient = new AIClient();
  const mcpClient = new MCPClient();
  const orchestrator = new AIOrchestrator(aiClient);

  // Connect to MCP servers
  const mcpSpinner = ora('Connecting to MCP servers...').start();
  try {
    for (const [name, mcpConfig] of Object.entries(cfg.mcp)) {
      await mcpClient.connect(name, mcpConfig);
    }
    mcpSpinner.succeed(`Connected to ${Object.keys(cfg.mcp).length} MCP servers`);
  } catch (error) {
    mcpSpinner.warn('Some MCP servers failed to connect');
  }

  // Create or get current session
  let session = sessionManager.getCurrentSession();
  if (!session) {
    session = sessionManager.createSession(cfg.workingDirectory);
  }

  // Create memory session for tracking
  const memorySession = memoryManager.createSession(
    'Interactive Session',
    cfg.workingDirectory,
    'Interactive PodCode session'
  );

displayLogo();
  console.log(UIFormatter.createWelcomeBox());
  console.log(chalk.gray(`Session: ${session.id} | Working Directory: ${session.workingDirectory} | Model: ${cfg.model}`));

  // Get all available tools
  const builtInTools = toolRegistry.getOpenAITools();
  const mcpTools = mcpClient.getTools();
  const allTools = [...builtInTools, ...mcpTools];

  // Chat loop
  while (true) {
    try {
      const { userInput } = await prompt<{ userInput: string }>({
        type: 'input',
        name: 'userInput',
        message: chalk.green('You:'),
      });

      if (userInput.toLowerCase() === 'exit') {
        break;
      }

      if (userInput.toLowerCase() === 'clear') {
        session = sessionManager.createSession(cfg.workingDirectory);
        console.log(chalk.yellow('Started new session\n'));
        continue;
      }

      if (userInput.toLowerCase() === 'clear-memory') {
        session = sessionManager.createSession(cfg.workingDirectory);
        memoryManager.clearAllSessions();
        console.log(chalk.yellow('Cleared all memory and started fresh session\n'));
        continue;
      }

      if (userInput.toLowerCase() === 'help') {
        const helpContent = [
          'Available Commands:',
          '  exit         - Quit PodCode',
          '  clear        - Start a new session',
          '  clear-memory - Clear all memory and start fresh',
          '  help         - Show this help message',
          '  status       - Show session status',
          '',
          'Available Tools:',
          `  Built-in: ${builtInTools.map(t => t.function.name).join(', ')}`,
          ...(mcpTools.length > 0 ? [`  MCP: ${mcpTools.map(t => t.function.name).join(', ')}`] : [])
        ].join('\n');
        
        console.log('\n' + UIFormatter.createBox(helpContent, 'PodCode Help', 'cyan'));
        continue;
      }

      if (userInput.toLowerCase() === 'status') {
        const statusContent = [
          `Session ID: ${session.id}`,
          `Working Directory: ${session.workingDirectory}`,
          `Model: ${cfg.model}`,
          `Messages: ${sessionManager.getMessages(session.id).length}`,
          `Available Tools: ${builtInTools.length + mcpTools.length}`
        ].join('\n');
        
        console.log('\n' + UIFormatter.createBox(statusContent, 'Session Status', 'cyan'));
        continue;
      }

      // Use AI orchestrator to decide what to do
      const decision = await orchestrator.decideAction(
        userInput,
        allTools.map(t => t.function.name),
        session.workingDirectory
      );
      
      console.log('\n' + UIFormatter.createDecisionBox(decision.action, decision.reason));
      
      // Handle simple responses without AI call
      if (decision.action === 'respond') {
        // For simple greetings, respond directly without AI
        if (userInput.toLowerCase().match(/^(hi|hey|hello|howdy)/)) {
          const responses = [
            "Hello! How can I help you with your software engineering tasks?",
            "Hi! What would you like to work on today?",
            "Hey! Ready to tackle some coding challenges?",
            "Hello there! How can I assist you?"
          ];
          const response = responses[Math.floor(Math.random() * responses.length)];
          console.log(chalk.blue('Assistant:'), response);
          console.log();
          continue;
        }
        // For capability questions, respond directly
        if (userInput.toLowerCase().match(/what can you do|what are your capabilities|how can you help/)) {
          console.log(chalk.blue('Assistant:'), "I can help with coding, debugging, file operations, system tasks, and more. I use tools to get things done and track progress with todos.");
          console.log();
          continue;
        }
        // For other responses, continue to AI processing
      }
      
      // Handle direct execution for simple tasks
      if (decision.action === 'execute') {
        console.log(chalk.yellow(`⚡ Executing directly...`));
        // Continue to AI processing which will handle tool calling
        // Don't create plans for execute actions - let AI handle it directly
      }
      
      // Handle planning
      if (decision.action === 'plan') {
        console.log(chalk.yellow(`🧠 Creating execution plan...`));
        try {
          const planResult = await orchestrator.generatePlan(
            userInput,
            `Working in ${session.workingDirectory}`,
            allTools.map(t => t.function.name),
            session.workingDirectory
          );
          
          console.log('\n' + UIFormatter.createPlanBox(planResult.title || 'Execution Plan', planResult.planId, planResult.steps));
          
          // Execute plan autonomously like Cursor (no user approval needed)
          console.log(chalk.cyan(`🚀 Starting autonomous plan execution...`));
          await executePlan(planResult, session, allTools, mcpClient, aiClient, orchestrator, cfg.model);
          continue; // Skip normal AI processing since we handled it
        } catch (error) {
          console.log(chalk.red(`❌ Failed to create plan: ${error instanceof Error ? error.message : String(error)}`));
        }
      }

      // Add user message to session
      const userMessage: ChatCompletionMessageParam = {
        role: 'user',
        content: userInput
      };
      sessionManager.addMessage(session.id, userMessage);

      // Store user message in memory
      const memoryUserMessage: SessionMessage = {
        ...userMessage,
        timestamp: new Date(),
        context: {
          workingDirectory: session.workingDirectory,
          environment: Object.fromEntries(
            Object.entries(process.env).filter(([_, value]) => value !== undefined)
          ) as Record<string, string>
        }
      };
      memoryManager.addMessage(memoryUserMessage);

  // Debug: Log available tools (removed for cleaner output)

      // Call AI with tools
      const spinner = ora('Thinking...').start();
      
      try {
        // Add system message for autonomous agent behavior
        const messages = sessionManager.getMessages(session.id);
        
        // Generate system message using dynamic prompt system
        const envDetails = await getEnvironmentDetails(session.workingDirectory, cfg.model);
        const systemPrompt = generateSystemPrompt(envDetails);
        
        messages.unshift({
          role: 'system',
          content: systemPrompt
        });
        
        const response = await aiClient.chat(
          messages,
          allTools,
          'required'
        );

        spinner.stop();

        const assistantMessage = response.choices[0].message;
        
        // Handle tool calls with conversational execution
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          // Add assistant message with tool calls
          sessionManager.addMessage(session.id, assistantMessage);
          
          // Store assistant message in memory
          const memoryAssistantMessage: SessionMessage = {
            ...assistantMessage,
            timestamp: new Date(),
            context: {
              workingDirectory: session.workingDirectory,
              environment: Object.fromEntries(
                Object.entries(process.env).filter(([_, value]) => value !== undefined)
              ) as Record<string, string>
            }
          };
          memoryManager.addMessage(memoryAssistantMessage);
          
          // Execute tool calls conversationally
          await executeToolCalls(assistantMessage, session, allTools, mcpClient, aiClient, orchestrator, cfg.model);
        } else {
          // Simple text response
          if (assistantMessage.content) {
            console.log(chalk.blue('Assistant:'), assistantMessage.content);
          }
          sessionManager.addMessage(session.id, assistantMessage);
          
          // Store assistant message in memory
          const memoryAssistantMessage: SessionMessage = {
            ...assistantMessage,
            timestamp: new Date(),
            context: {
              workingDirectory: session.workingDirectory,
              environment: Object.fromEntries(
                Object.entries(process.env).filter(([_, value]) => value !== undefined)
              ) as Record<string, string>
            }
          };
          memoryManager.addMessage(memoryAssistantMessage);
        }
      } catch (error) {
        spinner.stop();
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      }

      console.log(); // Empty line for readability
    } catch (error) {
      if (error instanceof Error && error.message.includes('canceled')) {
        break;
      }
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    }
  }

  // Cleanup
  await mcpClient.disconnect();
  
  // Complete memory session
  if (memorySession) {
    memoryManager.completeSession(true); // Assume success for interactive sessions
  }
  
  console.log(chalk.yellow('Goodbye! 👋'));
}

program
  .name('podcode')
  .description('Lite AI coding assistant using OpenAI-compatible APIs')
  .version('0.1.0')
  .option('--autonomous', 'Force autonomous execution mode (default: true)')
  .action(main);

program.parse();
