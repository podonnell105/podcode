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
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { generateSystemPrompt, getEnvironmentDetails } from './system-prompt.js';
import { displayLogo } from './logo.js';
import { displayScrollableOutput } from './utils/terminal-output.js';

// Pure Cursor-style conversational execution:
// - Streaming responses
// - Automatic continuation after tool execution
// - No automatic CI checks
// - Persistent system prompt
// - Minimal memory tracking

interface SafePathResult {
  isValid: boolean;
  reason?: string;
}

function validateSafePath(filePath: string): SafePathResult {
  if (filePath.includes('.env')) {
    return { isValid: false, reason: '.env files are blocked for security' };
  }
  
  if (filePath.includes('/secrets/') || filePath.includes('\\secrets\\')) {
    return { isValid: false, reason: 'secrets directories are blocked for security' };
  }
  
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (homeDir && filePath.startsWith(homeDir) && !filePath.startsWith(process.cwd())) {
    return { isValid: false, reason: 'home directory access outside project is blocked' };
  }
  
  return { isValid: true };
}

function previewToolExecution(toolName: string, toolArgs: any): void {
  if (toolName === 'bash' && toolArgs.command) {
    const actualCommand = toolArgs.command.replace('set -euo pipefail; ', '');
    console.log(chalk.gray(`Running: ${actualCommand}`));
  } else if (toolName === 'write_file' && toolArgs.path) {
    console.log(chalk.gray(`Writing ${toolArgs.path}`));
  } else if (toolName === 'edit_file' && toolArgs.path) {
    console.log(chalk.gray(`Editing ${toolArgs.path}`));
  } else if (toolName === 'read_file' && toolArgs.path) {
    console.log(chalk.gray(`Reading ${toolArgs.path}`));
  }
}

async function executeToolCalls(
  message: any,
  session: any,
  allTools: any[],
  mcpClient: any
): Promise<ChatCompletionMessageParam[]> {
  if (!message.tool_calls || message.tool_calls.length === 0) return [];

  const toolResponses: ChatCompletionMessageParam[] = [];
    
  for (const toolCall of message.tool_calls) {
    let toolName = toolCall.function.name;
    let toolArgs;
    
    try {
      toolArgs = JSON.parse(toolCall.function.arguments);
    } catch (error) {
      console.log(chalk.red(`Failed to parse tool arguments: ${error instanceof Error ? error.message : String(error)}`));
      toolArgs = {};
    }
    
    if (toolArgs.path) {
      const safePath = validateSafePath(toolArgs.path);
      if (!safePath.isValid) {
        console.log(chalk.red(`Unsafe path blocked: ${safePath.reason}`));
        const toolMessage: ChatCompletionMessageParam = {
          role: 'tool',
          tool_call_id: toolCall.id,
          content: `Error: Path blocked for security: ${safePath.reason}`
        };
        sessionManager.addMessage(session.id, toolMessage);
        toolResponses.push(toolMessage);
        continue;
      }
    }
    
    if (toolName === 'bash') {
      // Only add safety wrapper for non-interactive commands
      if (!toolArgs.interactive) {
        const originalCommand = toolArgs.command || '';
        toolArgs.command = `set -euo pipefail; ${originalCommand}`;
      }
      if (!toolArgs.timeout) {
        toolArgs.timeout = 180;
      }
    }
    
    // Only show preview, bash tool will handle its own logging
    if (toolName !== 'bash') {
      previewToolExecution(toolName, toolArgs);
    }
    
    let result;
    
    if (mcpClient.hasTool(toolName)) {
      const processedArgs = { ...toolArgs };
      if (processedArgs.directory && !path.isAbsolute(processedArgs.directory)) {
        processedArgs.directory = path.resolve(session.workingDirectory, processedArgs.directory);
      }
      if (processedArgs.workingDirectory && !path.isAbsolute(processedArgs.workingDirectory)) {
        processedArgs.workingDirectory = path.resolve(session.workingDirectory, processedArgs.workingDirectory);
      }
      
      result = await mcpClient.executeTool(toolName, processedArgs, {
        sessionId: session.id,
        workingDirectory: session.workingDirectory
      });
    } else {
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

    if (!result.success) {
      if (result.output && result.output.trim()) {
        console.log(chalk.red(result.output));
      } else if (result.error) {
        console.log(chalk.red(result.error));
      }
    } else if (result.output) {
      if (toolName === 'bash') {
        if (result.output.trim()) {
          if (toolArgs.scrollable) {
            await displayScrollableOutput(result.output);
          } else {
            console.log(result.output);
          }
        } else {
          console.log(chalk.green('✓ Completed'));
        }
      } else if (result.output.trim()) {
        console.log(result.output);
      }
    }

    const toolMessage: ChatCompletionMessageParam = {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: result.success ? result.output : `Error: ${result.error}`
    };
    
    sessionManager.addMessage(session.id, toolMessage);
    toolResponses.push(toolMessage);
  }
  
  return toolResponses;
}

// Streaming assistant response with integrated tool calls
async function streamAssistantResponse(
  messages: ChatCompletionMessageParam[],
  allTools: any[],
  aiClient: AIClient,
  spinner: any
): Promise<any> {
  let accumulatedContent = '';
  let accumulatedToolCalls: any[] = [];
  let toolCallsMap = new Map<number, any>();

  try {
    const stream = aiClient.chatStream(messages, allTools, 'auto');
    
    let isFirstChunk = true;
    
    for await (const chunk of stream) {
      if (isFirstChunk) {
        spinner.stop();
        isFirstChunk = false;
      }

      const delta = chunk.choices[0]?.delta;
      
      if (delta?.content) {
        if (accumulatedContent === '') {
          process.stdout.write(chalk.blue('\nAssistant: '));
        }
        process.stdout.write(delta.content);
        accumulatedContent += delta.content;
      }
      
      if (delta?.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          const index = toolCallDelta.index;
          
          if (!toolCallsMap.has(index)) {
            toolCallsMap.set(index, {
              id: toolCallDelta.id || '',
              type: 'function',
              function: {
                name: toolCallDelta.function?.name || '',
                arguments: toolCallDelta.function?.arguments || ''
              }
            });
          } else {
            const existing = toolCallsMap.get(index);
            if (toolCallDelta.function?.name) {
              existing.function.name += toolCallDelta.function.name;
            }
            if (toolCallDelta.function?.arguments) {
              existing.function.arguments += toolCallDelta.function.arguments;
            }
            if (toolCallDelta.id) {
              existing.id = toolCallDelta.id;
            }
          }
        }
      }
    }
    
    if (accumulatedContent) {
      console.log(); // New line after streaming content
    }
    
    accumulatedToolCalls = Array.from(toolCallsMap.values());
    
    return {
      role: 'assistant',
      content: accumulatedContent || null,
      tool_calls: accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined
    };
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

// Cursor-style continuation loop: keep working until done
async function conversationLoop(
  session: any,
  allTools: any[],
  mcpClient: any,
  aiClient: AIClient,
  maxIterations: number = parseInt(process.env.PODCODE_MAX_ITERATIONS || '15')
): Promise<void> {
  let iteration = 0;
  
  while (iteration < maxIterations) {
    iteration++;
    
    const spinner = ora('Thinking...').start();
    
    try {
      const messages = sessionManager.getMessages(session.id);
      
      const assistantMessage = await streamAssistantResponse(
        messages,
        allTools,
        aiClient,
        spinner
      );
      
      sessionManager.addMessage(session.id, assistantMessage);
      
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        console.log();
        const toolResponses = await executeToolCalls(assistantMessage, session, allTools, mcpClient);
        
        if (toolResponses.length > 0) {
          continue;
        }
      }
      
      break;
      
    } catch (error) {
      spinner.stop();
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      break;
    }
  }
  
  if (iteration >= maxIterations) {
    console.log(chalk.yellow('\nReached maximum iterations. Stopping to prevent infinite loop.'));
  }
}

const program = new Command();

async function main() {
  await config.load();
  const cfg = config.get();

  if (!cfg.apiKey) {
    console.error(chalk.red('Error: No API key found. Please set OPENAI_API_KEY or CORPORATE_API_KEY environment variable.'));
    process.exit(1);
  }

  const aiClient = new AIClient();
  const mcpClient = new MCPClient();

  const mcpSpinner = ora('Connecting to MCP servers...').start();
  try {
    for (const [name, mcpConfig] of Object.entries(cfg.mcp)) {
      await mcpClient.connect(name, mcpConfig);
    }
    mcpSpinner.succeed(`Connected to ${Object.keys(cfg.mcp).length} MCP servers`);
  } catch (error) {
    mcpSpinner.warn('Some MCP servers failed to connect');
  }

  let session = sessionManager.getCurrentSession();
  if (!session) {
    session = sessionManager.createSession(cfg.workingDirectory);
    
    const envDetails = await getEnvironmentDetails(session.workingDirectory, cfg.model);
    const systemPrompt = generateSystemPrompt(envDetails);
    
    sessionManager.addMessage(session.id, {
      role: 'system',
      content: systemPrompt
    });
  }

  displayLogo();
  console.log(chalk.cyan('\n🚀 PodCode - Pure Conversational AI Assistant (Cursor-style)'));
  console.log(chalk.gray(`Session: ${session.id} | Working Directory: ${session.workingDirectory}`));
  console.log(chalk.gray(`Type 'exit' to quit, 'clear' for new session, 'help' for commands\n`));

  const builtInTools = toolRegistry.getOpenAITools();
  const mcpTools = mcpClient.getTools();
  const allTools = [...builtInTools, ...mcpTools];

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
        
        const envDetails = await getEnvironmentDetails(session.workingDirectory, cfg.model);
        const systemPrompt = generateSystemPrompt(envDetails);
        
        sessionManager.addMessage(session.id, {
          role: 'system',
          content: systemPrompt
        });
        
        console.log(chalk.yellow('Started new session\n'));
        continue;
      }

      if (userInput.toLowerCase() === 'help') {
        console.log(chalk.cyan('\nAvailable Commands:'));
        console.log('  exit   - Quit PodCode');
        console.log('  clear  - Start a new session');
        console.log('  help   - Show this help message');
        console.log('  status - Show session status');
        console.log(chalk.cyan('\nAvailable Tools:'));
        console.log(chalk.gray(`  ${allTools.map(t => t.function.name).join(', ')}`));
        console.log();
        continue;
      }

      if (userInput.toLowerCase() === 'status') {
        console.log(chalk.cyan('\nSession Status:'));
        console.log(`  Session ID: ${session.id}`);
        console.log(`  Working Directory: ${session.workingDirectory}`);
        console.log(`  Model: ${cfg.model}`);
        console.log(`  Messages: ${sessionManager.getMessages(session.id).length}`);
        console.log(`  Available Tools: ${allTools.length}`);
        console.log();
        continue;
      }

      const userMessage: ChatCompletionMessageParam = {
        role: 'user',
        content: userInput
      };
      sessionManager.addMessage(session.id, userMessage);

      await conversationLoop(session, allTools, mcpClient, aiClient);

      console.log();
    } catch (error) {
      if (error instanceof Error && error.message.includes('canceled')) {
        break;
      }
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    }
  }

  await mcpClient.disconnect();
  console.log(chalk.yellow('Goodbye! 👋'));
}

program
  .name('podcode')
  .description('Pure conversational AI coding assistant (Cursor-style)')
  .version('0.1.0')
  .action(main);

program.parse();
