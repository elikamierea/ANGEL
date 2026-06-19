import { AgentId, AgentMessage, AgentMessageRole, AgentSession } from "./agent-types";

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

type Listener = (sessions: AgentSession[]) => void;

export class AgentSessionManager {
  private sessions = new Map<string, AgentSession>();
  private listeners = new Set<Listener>();

  createSession(agentId: AgentId, title?: string): AgentSession {
    const id = makeId("session");
    const ts = nowIso();
    const session: AgentSession = {
      id,
      agentId,
      title: title ?? `${agentId} Session`,
      createdAt: ts,
      updatedAt: ts,
      messages: [],
    };

    this.sessions.set(id, session);
    this.emit();
    return this.cloneSession(session);
  }

  getSession(sessionId: string): AgentSession | null {
    const session = this.sessions.get(sessionId);
    return session ? this.cloneSession(session) : null;
  }

  listSessions(): AgentSession[] {
    return [...this.sessions.values()].map((s) => this.cloneSession(s));
  }

  appendMessage(
    sessionId: string,
    role: AgentMessageRole,
    text: string,
    status?: AgentMessage["status"],
    meta?: Record<string, unknown>
  ): AgentMessage {
    const session = this.mustGet(sessionId);
    const message: AgentMessage = {
      id: makeId("msg"),
      role,
      timestamp: nowIso(),
      text,
      status,
      meta,
    };

    session.messages.push(message);
    session.updatedAt = nowIso();
    this.emit();

    return { ...message };
  }

  updateMessageStatus(sessionId: string, messageId: string, status: NonNullable<AgentMessage["status"]>): void {
    const session = this.mustGet(sessionId);
    const target = session.messages.find((m) => m.id === messageId);
    if (!target) {
      throw new Error(`Message not found: ${messageId}`);
    }

    target.status = status;
    session.updatedAt = nowIso();
    this.emit();
  }

  setDraft(sessionId: string, draft: string): void {
    const session = this.mustGet(sessionId);
    session.draft = draft;
    session.updatedAt = nowIso();
    this.emit();
  }

  exportState(): AgentSession[] {
    return this.listSessions();
  }

  importState(sessions: AgentSession[]): void {
    this.sessions.clear();
    for (const session of sessions) {
      this.sessions.set(session.id, this.cloneSession(session));
    }
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snapshot = this.exportState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private mustGet(sessionId: string): AgentSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return session;
  }

  private cloneSession(session: AgentSession): AgentSession {
    return {
      ...session,
      messages: session.messages.map((m) => ({ ...m })),
    };
  }
}
