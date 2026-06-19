export type ModelProviderId = "openai" | "anthropic" | "google" | "deepseek" | "qwen" | "doubao" | "moonshot" | "zai";

export interface ProviderModelCatalogItem {
  providerId: ModelProviderId;
  providerLabel: string;
  models: string[];
}

export const MODEL_CATALOG: ProviderModelCatalogItem[] = [
  {
    providerId: "openai",
    providerLabel: "OpenAI",
    models: [
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.4-nano",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-4.1",
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4",
    ],
  },
  {
    providerId: "anthropic",
    providerLabel: "Anthropic",
    models: ["claude-3-5-sonnet", "claude-sonnet-4-6"],
  },
  {
    providerId: "google",
    providerLabel: "Google",
    models: ["gemini-1.5-pro", "gemini-2.0-flash"],
  },
  {
    providerId: "deepseek",
    providerLabel: "DeepSeek",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    providerId: "qwen",
    providerLabel: "Qwen (Alibaba)",
    models: ["qwen-max", "qwen-plus"],
  },
  {
    providerId: "doubao",
    providerLabel: "Doubao (ByteDance)",
    models: ["doubao-pro-32k", "doubao-lite-32k"],
  },
  {
    providerId: "moonshot",
    providerLabel: "Moonshot (Kimi)",
    models: ["moonshot-v1-32k", "moonshot-v1-128k"],
  },
  {
    providerId: "zai",
    providerLabel: "Z.ai (GLM)",
    models: ["glm-4.6", "glm-4.5", "glm-4.5-air", "glm-4.5-flash"],
  },
];
