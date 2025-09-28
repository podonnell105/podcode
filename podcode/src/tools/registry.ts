import { Tool } from './types.js';
import { BashTool } from './bash.js';
import { ReadTool } from './read.js';
import { WriteTool } from './write.js';
import { EditTool } from './edit.js';
import { SystemCheckTool } from './system.js';
import { CLIDiscoveryTool } from './cli-discovery.js';
import { MemorySearchTool, MemoryStatsTool, MemoryListTool } from './memory.js';
import { CommandChainTool } from './command-chain.js';
import { TodoWriteTool } from './todowrite.js';
import { WebFetchTool } from './webfetch.js';
import { TaskTool } from './task.js';
import { GitTool } from './git.js';
import { CodeAnalysisTool } from './code-analysis.js';
import { GrepTool } from './grep.js';
import { FileSearchTool } from './file-search.js';
import { WebSearchTool } from './web-search.js';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  constructor() {
    // Register built-in tools
    this.register(new BashTool());
    this.register(new ReadTool());
    this.register(new WriteTool());
    this.register(new EditTool());
    this.register(new SystemCheckTool());
    this.register(new CLIDiscoveryTool());
    
    // Register memory tools
    this.register(new MemorySearchTool());
    this.register(new MemoryStatsTool());
    this.register(new MemoryListTool());
    
    // Register command chain tool
    this.register(new CommandChainTool());
    
    // Register Claude Code-style tools
    this.register(new TodoWriteTool());
    this.register(new WebFetchTool());
    this.register(new TaskTool());
    this.register(new GitTool());
    this.register(new CodeAnalysisTool());
    this.register(new GrepTool());
    this.register(new FileSearchTool());
    this.register(new WebSearchTool());
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  getOpenAITools(): ChatCompletionTool[] {
    return this.getAll().map(tool => tool.toOpenAITool());
  }

  getNames(): string[] {
    return Array.from(this.tools.keys());
  }
}

export const toolRegistry = new ToolRegistry();
