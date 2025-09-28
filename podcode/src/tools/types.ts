import { z } from 'zod';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export interface ToolContext {
  sessionId: string;
  workingDirectory: string;
  signal?: AbortSignal;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: any;
}

export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute(args: any, context: ToolContext): Promise<ToolResult>;
  toOpenAITool(): ChatCompletionTool;
}

