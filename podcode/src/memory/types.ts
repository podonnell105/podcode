import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export interface ToolExecution {
  toolName: string;
  args: any;
  result: {
    success: boolean;
    output: string;
    error?: string;
  };
  timestamp: Date;
  duration?: number;
}

export interface SessionMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null | any[];
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
  timestamp: Date;
  toolExecutions?: ToolExecution[];
  context?: {
    workingDirectory: string;
    environment?: Record<string, string>;
  };
}

export interface Session {
  id: string;
  title: string;
  description?: string;
  messages: SessionMessage[];
  workingDirectory: string;
  createdAt: Date;
  updatedAt: Date;
  completed: boolean;
  success: boolean;
  tags: string[];
  metadata: {
    totalToolCalls: number;
    successfulToolCalls: number;
    failedToolCalls: number;
    averageExecutionTime: number;
    lastError?: string;
  };
}

export interface MemorySearchResult {
  session: Session;
  relevanceScore: number;
  matchingMessages: SessionMessage[];
  matchingToolExecutions: ToolExecution[];
}

export interface MemoryQuery {
  task?: string;
  toolName?: string;
  success?: boolean;
  tags?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  limit?: number;
}

export interface PlanningContext {
  currentTask: string;
  previousAttempts: MemorySearchResult[];
  successfulPatterns: ToolExecution[];
  failedPatterns: ToolExecution[];
  recommendations: string[];
}
