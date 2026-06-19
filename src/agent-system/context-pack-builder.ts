import { ContextPackInput, ContextPackPreview } from "./agent-types";

function estimateChars(input: ContextPackInput): number {
  const snippetsChars = input.fileSnippets.reduce((sum, it) => sum + it.path.length + it.snippet.length, 0);
  const constraintsChars = input.constraints.join("\n").length;
  const selectedChars = input.selectedNodeIds.join(",").length;
  return snippetsChars + constraintsChars + selectedChars + 120;
}

export class ContextPackBuilder {
  buildPreview(input: ContextPackInput): ContextPackPreview {
    const estimatedChars = estimateChars(input);
    const summary = [
      `layer=${input.activeLayer}`,
      `selection=${input.selectedNodeIds.length}`,
      `constraints=${input.constraints.length}`,
      `snippets=${input.fileSnippets.length}`,
      `chars~${estimatedChars}`,
    ].join(" | ");

    return {
      sessionId: input.sessionId,
      summary,
      payload: {
        activeLayer: input.activeLayer,
        selectedNodeIds: [...input.selectedNodeIds],
        constraints: [...input.constraints],
        fileSnippets: input.fileSnippets.map((s) => ({ ...s })),
      },
      estimatedChars,
    };
  }
}
