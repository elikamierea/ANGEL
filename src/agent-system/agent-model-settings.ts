import { AppPersistence } from "../infra/app-persistence";
import { ModelProviderId } from "./model-catalog";

export interface AgentModelSettings {
  defaultProviderId: ModelProviderId;
  defaultModel: string;
  // Per-model reasoning selection. Each value is a provider-native payload
  // fragment that is deep-merged into the outgoing request as-is.
  reasoning: Record<string, Record<string, unknown>>;
  // Output token cap (0 = use the built-in default). Currently consumed by the
  // Anthropic request path.
  maxOutputTokens: number;
  providers: {
    openai: {
      apiKey: string;
    };
  };
}

export const DEFAULT_AGENT_MODEL_SETTINGS: AgentModelSettings = {
  defaultProviderId: "openai",
  defaultModel: "gpt-4o",
  reasoning: {},
  maxOutputTokens: 0,
  providers: {
    openai: {
      apiKey: "",
    },
  },
};

export class AgentModelSettingsService {
  constructor(private readonly persistence: AppPersistence) {}

  load(): AgentModelSettings {
    const stored = this.persistence.load<Partial<AgentModelSettings>>();
    if (!stored) return { ...DEFAULT_AGENT_MODEL_SETTINGS };

    return {
      defaultProviderId: stored.defaultProviderId ?? DEFAULT_AGENT_MODEL_SETTINGS.defaultProviderId,
      defaultModel: stored.defaultModel ?? DEFAULT_AGENT_MODEL_SETTINGS.defaultModel,
      reasoning:
        stored.reasoning && typeof stored.reasoning === "object" && !Array.isArray(stored.reasoning)
          ? { ...stored.reasoning }
          : {},
      maxOutputTokens: Math.max(0, Math.floor(Number(stored.maxOutputTokens) || 0)),
      providers: {
        openai: {
          apiKey: stored.providers?.openai?.apiKey ?? "",
        },
      },
    };
  }

  save(next: AgentModelSettings): void {
    this.persistence.save(next);
  }
}
