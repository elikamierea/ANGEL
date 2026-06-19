export type AgentId = "Designer" | "Orchestrator" | "Programmer" | "ResourceProvider";

export type AgentMessageRole = "user" | "assistant" | "system";

export interface AgentMessage {
  id: string;
  role: AgentMessageRole;
  timestamp: string;
  text: string;
  status?: "pending" | "streaming" | "done" | "error";
  meta?: Record<string, unknown>;
}

export interface AgentSession {
  id: string;
  agentId: AgentId;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AgentMessage[];
  draft?: string;
}

export interface ContextPackInput {
  sessionId: string;
  activeLayer: "L0" | "L1" | "L2" | "L3";
  selectedNodeIds: string[];
  constraints: string[];
  fileSnippets: Array<{ path: string; snippet: string }>;
}

export interface ContextPackPreview {
  sessionId: string;
  summary: string;
  payload: {
    activeLayer: "L0" | "L1" | "L2" | "L3";
    selectedNodeIds: string[];
    constraints: string[];
    fileSnippets: Array<{ path: string; snippet: string }>;
  };
  estimatedChars: number;
}

export interface AgentStructuredResponse {
  summary: string;
  actions: string[];
  affectedTargets: string[];
  result: "ok" | "error" | "partial";
  risks: string[];
  nextStep: string;
}
