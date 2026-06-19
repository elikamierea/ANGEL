import { ParsedBlock } from "./block-types";

const START_RE = /^\/\/\{([A-Za-z0-9_]+)\}_BEGIN\s*$/;
const END_RE = /^\/\/\{([A-Za-z0-9_]+)\}_END\s*$/;

function normalizeEol(input: string): string {
  return input.replace(/\r\n/g, "\n");
}

export function parseBlocks(content: string): ParsedBlock[] {
  const normalized = normalizeEol(content);
  const lines = normalized.split("\n");
  const blocks: ParsedBlock[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const startMatch = lines[i].trim().match(START_RE);
    if (!startMatch) {
      continue;
    }

    const name = startMatch[1];
    const startLine = i + 1;

    let endLine = -1;
    for (let j = i + 1; j < lines.length; j += 1) {
      const endMatch = lines[j].trim().match(END_RE);
      if (endMatch && endMatch[1] === name) {
        endLine = j + 1;
        break;
      }
    }

    if (endLine < 0) {
      throw new Error(`Unclosed block: ${name}`);
    }

    const contentStartIdx = i + 1;
    const contentEndIdx = endLine - 1;
    const blockContent = lines.slice(contentStartIdx, contentEndIdx).join("\n");

    blocks.push({
      name,
      range: { startLine, endLine },
      content: blockContent,
    });

    i = endLine - 1;
  }

  return blocks;
}
