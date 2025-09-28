import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export interface Session {
  id: string;
  messages: ChatCompletionMessageParam[];
  workingDirectory: string;
  createdAt: Date;
  updatedAt: Date;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private currentSessionId: string | null = null;

  createSession(workingDirectory: string = process.cwd()): Session {
    const id = this.generateSessionId();
    const session: Session = {
      id,
      messages: [],
      workingDirectory,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.sessions.set(id, session);
    this.currentSessionId = id;
    
    return session;
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  getCurrentSession(): Session | undefined {
    if (!this.currentSessionId) return undefined;
    return this.sessions.get(this.currentSessionId);
  }

  setCurrentSession(id: string): boolean {
    if (this.sessions.has(id)) {
      this.currentSessionId = id;
      return true;
    }
    return false;
  }

  addMessage(sessionId: string, message: ChatCompletionMessageParam): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages.push(message);
      session.updatedAt = new Date();
    }
  }

  getMessages(sessionId: string): ChatCompletionMessageParam[] {
    const session = this.sessions.get(sessionId);
    return session ? [...session.messages] : [];
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  deleteSession(id: string): boolean {
    const deleted = this.sessions.delete(id);
    if (this.currentSessionId === id) {
      this.currentSessionId = null;
    }
    return deleted;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const sessionManager = new SessionManager();

