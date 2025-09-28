import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { Tool, ToolContext, ToolResult } from '../tools/types.js';
import { z } from 'zod';

interface MCPConfig {
  enabled: boolean;
  type: 'local' | 'remote';
  command?: string[];
  url?: string;
  headers?: Record<string, string>;
  environment?: Record<string, string>;
}

export class MCPClient {
  private clients: Map<string, Client> = new Map();
  private tools: Map<string, any> = new Map();

  async connect(name: string, config: MCPConfig): Promise<void> {
    if (!config.enabled) return;

    try {
      if (config.type === 'local' && config.command) {
        const client = new Client({
          name: 'podcode',
          version: '0.1.0',
        });

        // Create transport with command parameters
        const env: Record<string, string> = {};
        // Filter out undefined values from process.env
        for (const [key, value] of Object.entries(process.env)) {
          if (value !== undefined) {
            env[key] = value;
          }
        }
        // Add config environment variables
        Object.assign(env, config.environment);

        const transport = new StdioClientTransport({
          command: config.command[0],
          args: config.command.slice(1),
          env
        });

        await client.connect(transport);
        this.clients.set(name, client);

        // Get available tools
        const { tools } = await client.listTools();
        for (const tool of tools) {
          this.tools.set(tool.name, {
            mcpClient: client,
            tool,
            serverName: name
          });
        }
        
        console.log(`Connected to MCP server ${name} with ${tools.length} tools`);
      }
    } catch (error) {
      console.warn(`Failed to connect to MCP server ${name}:`, error);
    }
  }

  getTools(): ChatCompletionTool[] {
    const tools: ChatCompletionTool[] = [];
    
    for (const [toolName, { tool }] of this.tools) {
      tools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || `MCP tool: ${tool.name}`,
          parameters: tool.inputSchema || { type: 'object', properties: {} }
        }
      });
    }
    
    return tools;
  }

  async executeTool(toolName: string, args: any, context: ToolContext): Promise<ToolResult> {
    const toolInfo = this.tools.get(toolName);
    
    if (!toolInfo) {
      return {
        success: false,
        output: '',
        error: `MCP tool not found: ${toolName}`
      };
    }

    try {
      const { mcpClient, tool } = toolInfo;
      const result = await mcpClient.callTool({
        name: tool.name,
        arguments: args
      });

      return {
        success: !result.isError,
        output: Array.isArray(result.content) 
          ? result.content.map((c: any) => c.type === 'text' ? c.text : JSON.stringify(c)).join('\n')
          : JSON.stringify(result.content),
        error: result.isError ? 'MCP tool execution failed' : undefined
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `MCP tool execution error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  hasTool(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  async disconnect(): Promise<void> {
    for (const client of this.clients.values()) {
      try {
        await client.close();
      } catch (error) {
        console.warn('Error closing MCP client:', error);
      }
    }
    this.clients.clear();
    this.tools.clear();
  }
}
