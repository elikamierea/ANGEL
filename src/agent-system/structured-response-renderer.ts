import { AgentStructuredResponse } from "./agent-types";

export class StructuredResponseRenderer {
  render(response: AgentStructuredResponse): string {
    const lines: string[] = [];
    lines.push(`Summary: ${response.summary}`);
    lines.push(`Result: ${response.result}`);

    lines.push("Actions:");
    for (const action of response.actions) {
      lines.push(`- ${action}`);
    }

    lines.push("Affected Targets:");
    for (const target of response.affectedTargets) {
      lines.push(`- ${target}`);
    }

    lines.push("Risks:");
    for (const risk of response.risks) {
      lines.push(`- ${risk}`);
    }

    lines.push(`Next Step: ${response.nextStep}`);
    return lines.join("\n");
  }
}
