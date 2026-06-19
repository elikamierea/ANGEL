import { BlockMeta, CodeBlockError } from "./block-types";

function constraint(message: string): CodeBlockError {
  return { code: "CONSTRAINT_VIOLATION", message };
}

export class IncludeBlockGuard {
  validate(blocks: BlockMeta[]): CodeBlockError | null {
    const includeBlocks = blocks.filter((b) => b.name === "INCLUDE");

    if (includeBlocks.length > 1) {
      return constraint("Each file can contain only one INCLUDE block.");
    }

    if (includeBlocks.length === 1) {
      const firstByStart = [...blocks].sort((a, b) => a.range.startLine - b.range.startLine)[0];
      if (firstByStart.blockId !== includeBlocks[0].blockId) {
        return constraint("INCLUDE block must be the first block-marked segment in the file.");
      }
    }

    return null;
  }
}
