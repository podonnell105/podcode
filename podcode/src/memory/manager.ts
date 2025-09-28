import { MemoryStorage } from './storage.js';
import type { 
  Session, 
  SessionMessage, 
  ToolExecution, 
  MemorySearchResult, 
  MemoryQuery, 
  PlanningContext 
} from './types.js';

export class MemoryManager {
  private storage: MemoryStorage;
  private currentSession: Session | null = null;

  constructor() {
    this.storage = new MemoryStorage();
  }

  createSession(title: string, workingDirectory: string, description?: string): Session {
    const sessionId = this.generateSessionId();
    const now = new Date();
    
    const session: Session = {
      id: sessionId,
      title,
      description,
      messages: [],
      workingDirectory,
      createdAt: now,
      updatedAt: now,
      completed: false,
      success: false,
      tags: this.extractTags(title, description),
      metadata: {
        totalToolCalls: 0,
        successfulToolCalls: 0,
        failedToolCalls: 0,
        averageExecutionTime: 0
      }
    };

    this.currentSession = session;
    this.storage.saveSession(session);
    return session;
  }

  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  setCurrentSession(sessionId: string): Session | null {
    const session = this.storage.loadSession(sessionId);
    if (session) {
      this.currentSession = session;
    }
    return session;
  }

  addMessage(message: SessionMessage): void {
    if (!this.currentSession) {
      throw new Error('No current session');
    }

    this.currentSession.messages.push(message);
    this.currentSession.updatedAt = new Date();
    this.storage.saveSession(this.currentSession);
  }

  addToolExecution(toolExecution: ToolExecution): void {
    if (!this.currentSession) {
      throw new Error('No current session');
    }

    const lastMessage = this.currentSession.messages[this.currentSession.messages.length - 1];
    if (lastMessage) {
      if (!lastMessage.toolExecutions) {
        lastMessage.toolExecutions = [];
      }
      lastMessage.toolExecutions.push(toolExecution);
    }

    // Update session metadata
    this.currentSession.metadata.totalToolCalls++;
    if (toolExecution.result.success) {
      this.currentSession.metadata.successfulToolCalls++;
    } else {
      this.currentSession.metadata.failedToolCalls++;
      this.currentSession.metadata.lastError = toolExecution.result.error;
    }

    // Update average execution time
    if (toolExecution.duration) {
      const totalTime = this.currentSession.metadata.averageExecutionTime * 
                       (this.currentSession.metadata.totalToolCalls - 1) + 
                       toolExecution.duration;
      this.currentSession.metadata.averageExecutionTime = 
        totalTime / this.currentSession.metadata.totalToolCalls;
    }

    this.currentSession.updatedAt = new Date();
    this.storage.saveSession(this.currentSession);
  }

  completeSession(success: boolean): void {
    if (!this.currentSession) {
      throw new Error('No current session');
    }

    this.currentSession.completed = true;
    this.currentSession.success = success;
    this.currentSession.updatedAt = new Date();
    this.storage.saveSession(this.currentSession);
  }

  searchMemory(query: MemoryQuery): MemorySearchResult[] {
    const sessions = this.storage.searchSessions(query);
    
    return sessions.map(session => {
      const matchingMessages: SessionMessage[] = [];
      const matchingToolExecutions: ToolExecution[] = [];
      let relevanceScore = 0;

      // Calculate relevance based on query
      if (query.task) {
        const taskLower = query.task.toLowerCase();
        if (session.title.toLowerCase().includes(taskLower)) {
          relevanceScore += 10;
        }
        if (session.description?.toLowerCase().includes(taskLower)) {
          relevanceScore += 5;
        }
      }

      if (query.toolName) {
        session.messages.forEach(msg => {
          if (msg.toolExecutions) {
            msg.toolExecutions.forEach(exec => {
              if (exec.toolName === query.toolName) {
                matchingToolExecutions.push(exec);
                relevanceScore += 3;
              }
            });
          }
        });
      }

      if (query.success !== undefined && session.success === query.success) {
        relevanceScore += 5;
      }

      // Add matching messages
      if (query.task) {
        const taskLower = query.task.toLowerCase();
        session.messages.forEach(msg => {
          if (typeof msg.content === 'string' && msg.content.toLowerCase().includes(taskLower)) {
            matchingMessages.push(msg);
            relevanceScore += 2;
          }
        });
      }

      return {
        session,
        relevanceScore,
        matchingMessages,
        matchingToolExecutions
      };
    }).sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  getPlanningContext(currentTask: string): PlanningContext {
    // Search for similar previous attempts
    const previousAttempts = this.searchMemory({
      task: currentTask,
      limit: 5
    });

    // Extract successful and failed patterns
    const successfulPatterns: ToolExecution[] = [];
    const failedPatterns: ToolExecution[] = [];

    previousAttempts.forEach(result => {
      result.matchingToolExecutions.forEach(exec => {
        if (exec.result.success) {
          successfulPatterns.push(exec);
        } else {
          failedPatterns.push(exec);
        }
      });
    });

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      currentTask, 
      successfulPatterns, 
      failedPatterns
    );

    return {
      currentTask,
      previousAttempts,
      successfulPatterns,
      failedPatterns,
      recommendations
    };
  }

  private generateRecommendations(
    task: string, 
    successfulPatterns: ToolExecution[], 
    failedPatterns: ToolExecution[]
  ): string[] {
    const recommendations: string[] = [];

    // Analyze successful patterns
    const successfulTools = new Map<string, number>();
    successfulPatterns.forEach(exec => {
      successfulTools.set(exec.toolName, (successfulTools.get(exec.toolName) || 0) + 1);
    });

    // Analyze failed patterns
    const failedTools = new Map<string, number>();
    failedPatterns.forEach(exec => {
      failedTools.set(exec.toolName, (failedTools.get(exec.toolName) || 0) + 1);
    });

    // Generate recommendations
    if (successfulTools.size > 0) {
      const mostSuccessful = Array.from(successfulTools.entries())
        .sort((a, b) => b[1] - a[1])[0];
      recommendations.push(`Consider using ${mostSuccessful[0]} tool - it has been successful ${mostSuccessful[1]} times in similar tasks`);
    }

    if (failedTools.size > 0) {
      const mostFailed = Array.from(failedTools.entries())
        .sort((a, b) => b[1] - a[1])[0];
      recommendations.push(`Be cautious with ${mostFailed[0]} tool - it has failed ${mostFailed[1]} times in similar tasks`);
    }

    // Task-specific recommendations
    const taskLower = task.toLowerCase();
    if (taskLower.includes('install') || taskLower.includes('setup')) {
      recommendations.push('For installation tasks, use system_check tool to verify prerequisites first');
      recommendations.push('Always verify successful installation with a test command');
    }

    if (taskLower.includes('login') || taskLower.includes('auth')) {
      recommendations.push('For authentication tasks, check current status first using cli_discovery');
      recommendations.push('Use appropriate authentication commands for the target platform');
    }

    return recommendations;
  }

  private extractTags(title: string, description?: string): string[] {
    const tags: string[] = [];
    const text = `${title} ${description || ''}`.toLowerCase();

    // Common task categories
    if (text.includes('install') || text.includes('setup')) tags.push('installation');
    if (text.includes('deploy') || text.includes('deployment')) tags.push('deployment');
    if (text.includes('login') || text.includes('auth')) tags.push('authentication');
    if (text.includes('file') || text.includes('read') || text.includes('write')) tags.push('file-operations');
    if (text.includes('bash') || text.includes('command')) tags.push('system-commands');
    if (text.includes('error') || text.includes('debug')) tags.push('troubleshooting');
    if (text.includes('build') || text.includes('compile')) tags.push('build');
    if (text.includes('test') || text.includes('testing')) tags.push('testing');

    return tags;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  listSessions(): Session[] {
    return this.storage.listSessions();
  }

  deleteSession(sessionId: string): boolean {
    return this.storage.deleteSession(sessionId);
  }

  clearAllSessions(): void {
    this.storage.clearAllSessions();
    this.currentSession = null;
  }

  getStorageStats() {
    return this.storage.getStorageStats();
  }
}

export const memoryManager = new MemoryManager();
