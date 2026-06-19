import { AgentModelSettingsService } from "./agent-model-settings";
import { AgentExecutor } from "./agent-request-gateway";
import { AgentStructuredResponse } from "./agent-types";

const PLACEHOLDER_SYSTEM_PROMPT =
  "You are an ANGEL agent. Placeholder phase: keep answers short and practical.";

function coerceText(value: unknown): string {
  if (typeof value === "string") return value;
  return "";
}

async function callOpenAI(params: {
  apiKey: string;
  model: string;
  userPrompt: string;
  contextText: string;
}): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: PLACEHOLDER_SYSTEM_PROMPT }],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Context:\n${params.contextText}\n\nUser:\n${params.userPrompt}`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as { output_text?: unknown };
  const output = coerceText(data.output_text).trim();
  return output || "(empty model response)";
}

export class DefaultModelExecutor implements AgentExecutor {
  constructor(private readonly settingsService: AgentModelSettingsService) {}

  async execute(input: {
    prompt: string;
    modelContextText: string;
  }): Promise<AgentStructuredResponse> {
    const settings = this.settingsService.load();

    if (settings.defaultProviderId !== "openai") {
      return {
        summary: `Provider ${settings.defaultProviderId} is reserved for a later phase.`,
        actions: ["Switch provider to OpenAI in settings"],
        affectedTargets: [],
        result: "partial",
        risks: [],
        nextStep: "Configure OpenAI API key and retry.",
      };
    }

    const apiKey = settings.providers.openai.apiKey.trim();
    if (!apiKey) {
      return {
        summary: "OpenAI API key not configured yet.",
        actions: ["Add OpenAI API key in settings"],
        affectedTargets: [],
        result: "partial",
        risks: ["No live model call was made"],
        nextStep: "Save API key and retry.",
      };
    }

    const text = await callOpenAI({
      apiKey,
      model: settings.defaultModel,
      userPrompt: input.prompt,
      contextText: input.modelContextText,
    });

    return {
      summary: text,
      actions: ["Model response received"],
      affectedTargets: [],
      result: "ok",
      risks: [],
      nextStep: "User confirms next action.",
    };
  }
}
