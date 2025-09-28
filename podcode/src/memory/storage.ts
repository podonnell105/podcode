import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { Session, SessionMessage, ToolExecution } from './types.js';

export class MemoryStorage {
  private storageDir: string;
  private sessionsDir: string;

  constructor() {
    // Use home directory for persistent storage
    this.storageDir = join(homedir(), '.podcode', 'memory');
    this.sessionsDir = join(this.storageDir, 'sessions');
    
    // Ensure directories exist
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!existsSync(this.storageDir)) {
      mkdirSync(this.storageDir, { recursive: true });
    }
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  private getSessionPath(sessionId: string): string {
    return join(this.sessionsDir, `${sessionId}.json`);
  }

  private getIndexPath(): string {
    return join(this.storageDir, 'index.json');
  }

  saveSession(session: Session): void {
    try {
      const sessionPath = this.getSessionPath(session.id);
      const sessionData = {
        ...session,
        messages: session.messages.map(msg => ({
          ...msg,
          timestamp: msg.timestamp.toISOString(),
          toolExecutions: msg.toolExecutions?.map(exec => ({
            ...exec,
            timestamp: exec.timestamp.toISOString()
          }))
        })),
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString()
      };
      
      writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
      this.updateIndex(session);
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  loadSession(sessionId: string): Session | null {
    try {
      const sessionPath = this.getSessionPath(sessionId);
      if (!existsSync(sessionPath)) {
        return null;
      }

      const sessionData = JSON.parse(readFileSync(sessionPath, 'utf-8'));
      
      return {
        ...sessionData,
        messages: sessionData.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
          toolExecutions: msg.toolExecutions?.map((exec: any) => ({
            ...exec,
            timestamp: new Date(exec.timestamp)
          }))
        })),
        createdAt: new Date(sessionData.createdAt),
        updatedAt: new Date(sessionData.updatedAt)
      };
    } catch (error) {
      console.error('Failed to load session:', error);
      return null;
    }
  }

  listSessions(): Session[] {
    try {
      const indexPath = this.getIndexPath();
      if (!existsSync(indexPath)) {
        return [];
      }

      const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
      return index.sessions.map((sessionRef: any) => this.loadSession(sessionRef.id)).filter(Boolean);
    } catch (error) {
      console.error('Failed to list sessions:', error);
      return [];
    }
  }

  searchSessions(query: {
    task?: string;
    toolName?: string;
    success?: boolean;
    tags?: string[];
    limit?: number;
  }): Session[] {
    const sessions = this.listSessions();
    let results = sessions;

    // Filter by success status
    if (query.success !== undefined) {
      results = results.filter(session => session.success === query.success);
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      results = results.filter(session => 
        query.tags!.some(tag => session.tags.includes(tag))
      );
    }

    // Filter by task content
    if (query.task) {
      const taskLower = query.task.toLowerCase();
      results = results.filter(session => 
        session.title.toLowerCase().includes(taskLower) ||
        session.description?.toLowerCase().includes(taskLower) ||
        session.messages.some(msg => 
          typeof msg.content === 'string' && msg.content.toLowerCase().includes(taskLower)
        )
      );
    }

    // Filter by tool usage
    if (query.toolName) {
      results = results.filter(session =>
        session.messages.some(msg =>
          msg.toolExecutions?.some(exec => exec.toolName === query.toolName)
        )
      );
    }

    // Sort by relevance (most recent first)
    results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    // Apply limit
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  deleteSession(sessionId: string): boolean {
    try {
      const sessionPath = this.getSessionPath(sessionId);
      if (existsSync(sessionPath)) {
        require('fs').unlinkSync(sessionPath);
        this.updateIndex(null, sessionId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to delete session:', error);
      return false;
    }
  }

  private updateIndex(session: Session | null, deletedId?: string): void {
    try {
      const indexPath = this.getIndexPath();
      let index: { sessions: any[] } = { sessions: [] };

      if (existsSync(indexPath)) {
        index = JSON.parse(readFileSync(indexPath, 'utf-8'));
      }

      if (session) {
        // Add or update session in index
        const existingIndex = index.sessions.findIndex(s => s.id === session.id);
        const sessionRef = {
          id: session.id,
          title: session.title,
          createdAt: session.createdAt.toISOString(),
          updatedAt: session.updatedAt.toISOString(),
          success: session.success,
          tags: session.tags
        };

        if (existingIndex >= 0) {
          index.sessions[existingIndex] = sessionRef;
        } else {
          index.sessions.push(sessionRef);
        }
      } else if (deletedId) {
        // Remove session from index
        index.sessions = index.sessions.filter(s => s.id !== deletedId);
      }

      // Sort by updated date (most recent first)
      index.sessions.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      writeFileSync(indexPath, JSON.stringify(index, null, 2));
    } catch (error) {
      console.error('Failed to update index:', error);
    }
  }

  getStorageStats(): {
    totalSessions: number;
    totalMessages: number;
    totalToolExecutions: number;
    storageSize: number;
  } {
    const sessions = this.listSessions();
    const totalMessages = sessions.reduce((sum, session) => sum + session.messages.length, 0);
    const totalToolExecutions = sessions.reduce((sum, session) => 
      sum + session.messages.reduce((msgSum, msg) => 
        msgSum + (msg.toolExecutions?.length || 0), 0), 0);

    // Calculate storage size (approximate)
    let storageSize = 0;
    try {
      const files = readdirSync(this.sessionsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = join(this.sessionsDir, file);
          const stats = require('fs').statSync(filePath);
          storageSize += stats.size;
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return {
      totalSessions: sessions.length,
      totalMessages,
      totalToolExecutions,
      storageSize
    };
  }

  clearAllSessions(): void {
    try {
      if (existsSync(this.sessionsDir)) {
        const files = readdirSync(this.sessionsDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const filePath = join(this.sessionsDir, file);
            try {
              require('fs').unlinkSync(filePath);
            } catch (error) {
              console.error(`Failed to delete session file ${file}:`, error);
            }
          }
        }
      }
      
      // Clear the index file
      const indexPath = this.getIndexPath();
      if (existsSync(indexPath)) {
        try {
          require('fs').unlinkSync(indexPath);
        } catch (error) {
          console.error('Failed to delete index file:', error);
        }
      }
    } catch (error) {
      console.error('Failed to clear all sessions:', error);
    }
  }
}
