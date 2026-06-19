import { BlockMeta, CodeBlockError, CodeBlockType } from "./block-types";
import { parseBlocks } from "./block-parser";
import { IncludeBlockGuard } from "./include-block-guard";

interface BlockAttrs {
  featureKey: string;
  type: CodeBlockType;
  ownerAgent: string;
}

interface FileState {
  path: string;
  content: string;
  revision: number;
  attrsByName: Map<string, BlockAttrs>;
}

interface CreateBlockParams {
  path: string;
  name: string;
  featureKey: string;
  type: CodeBlockType;
  ownerAgent: string;
  initialContent: string;
  position: "file_top" | "file_end" | `after_block:${string}`;
  expectedRevision: number;
}

interface UpdateBlockParams {
  blockId: string;
  newContent: string;
  expectedRevision: number;
  actor?: string;
}

function makeBlockId(path: string, name: string): string {
  return `${path}#${name}`;
}

function normalizeEol(input: string): string {
  return input.replace(/\r\n/g, "\n");
}

function ensureAllowedPath(path: string): CodeBlockError | null {
  const normalized = path.replace(/\\/g, "/");
  if (!normalized.startsWith("src/game/")) {
    return { code: "PERMISSION_DENIED", message: "Only src/game/** is writable." };
  }

  if (!normalized.endsWith(".cpp") && !normalized.endsWith(".hpp")) {
    return { code: "INVALID_INPUT", message: "Only .cpp/.hpp files are supported." };
  }

  return null;
}

function defaultAttrs(name: string): BlockAttrs {
  return {
    featureKey: name,
    type: name === "INCLUDE" ? "include" : "other",
    ownerAgent: name === "INCLUDE" ? "Orchestrator" : "Programmer",
  };
}

function toMeta(path: string, content: string, attrsByName: Map<string, BlockAttrs>): BlockMeta[] {
  return parseBlocks(content).map((block) => {
    const attrs = attrsByName.get(block.name) ?? defaultAttrs(block.name);
    return {
      blockId: makeBlockId(path, block.name),
      path,
      name: block.name,
      featureKey: attrs.featureKey,
      type: attrs.type,
      ownerAgent: attrs.ownerAgent,
      range: block.range,
    };
  });
}

export class BlockRegistry {
  private files = new Map<string, FileState>();
  private includeGuard = new IncludeBlockGuard();

  seedFile(path: string, content: string, revision = 0): CodeBlockError | null {
    const pathError = ensureAllowedPath(path);
    if (pathError) {
      return pathError;
    }

    const normalized = normalizeEol(content);
    const attrsByName = new Map<string, BlockAttrs>();
    for (const parsed of parseBlocks(normalized)) {
      attrsByName.set(parsed.name, defaultAttrs(parsed.name));
    }

    this.files.set(path, {
      path,
      content: normalized,
      revision,
      attrsByName,
    });

    return null;
  }

  listBlocks(path: string): { revision: number; blocks: BlockMeta[] } | { error: CodeBlockError } {
    const state = this.files.get(path);
    if (!state) {
      return { error: { code: "NOT_FOUND", message: `File not found: ${path}` } };
    }

    return {
      revision: state.revision,
      blocks: toMeta(path, state.content, state.attrsByName),
    };
  }

  readBlock(blockId: string): { revision: number; block: BlockMeta; content: string } | { error: CodeBlockError } {
    const [path, name] = this.parseBlockId(blockId);
    const state = this.files.get(path);
    if (!state) {
      return { error: { code: "NOT_FOUND", message: `File not found: ${path}` } };
    }

    const parsed = parseBlocks(state.content).find((b) => b.name === name);
    if (!parsed) {
      return { error: { code: "NOT_FOUND", message: `Block not found: ${blockId}` } };
    }

    const attrs = state.attrsByName.get(name) ?? defaultAttrs(name);
    return {
      revision: state.revision,
      block: {
        blockId,
        path,
        name,
        featureKey: attrs.featureKey,
        type: attrs.type,
        ownerAgent: attrs.ownerAgent,
        range: parsed.range,
      },
      content: parsed.content,
    };
  }

  createBlock(params: CreateBlockParams): { applied: boolean; blockId?: string; newRevision: number; error?: CodeBlockError } {
    const pathError = ensureAllowedPath(params.path);
    if (pathError) {
      return { applied: false, newRevision: -1, error: pathError };
    }

    const state = this.files.get(params.path) ?? {
      path: params.path,
      content: "",
      revision: 0,
      attrsByName: new Map<string, BlockAttrs>(),
    };

    if (state.revision !== params.expectedRevision) {
      return {
        applied: false,
        newRevision: state.revision,
        error: { code: "REVISION_CONFLICT", message: "Revision mismatch." },
      };
    }

    const existing = toMeta(params.path, state.content, state.attrsByName);
    if (existing.some((b) => b.featureKey === params.featureKey)) {
      return {
        applied: false,
        newRevision: state.revision,
        error: { code: "CONSTRAINT_VIOLATION", message: `Duplicate featureKey: ${params.featureKey}` },
      };
    }

    if (state.attrsByName.has(params.name)) {
      return {
        applied: false,
        newRevision: state.revision,
        error: { code: "CONSTRAINT_VIOLATION", message: `Duplicate block name: ${params.name}` },
      };
    }

    const blockText = this.renderBlock(params.name, params.initialContent);
    const nextContent = this.insertBlock(state.content, blockText, params.position, existing);

    const nextAttrs = new Map(state.attrsByName);
    nextAttrs.set(params.name, {
      featureKey: params.featureKey,
      type: params.type,
      ownerAgent: params.ownerAgent,
    });

    const guarded = this.validateIncludeGuard(params.path, nextContent, nextAttrs);
    if (guarded) {
      return { applied: false, newRevision: state.revision, error: guarded };
    }

    const nextState: FileState = {
      ...state,
      content: nextContent,
      revision: state.revision + 1,
      attrsByName: nextAttrs,
    };

    this.files.set(params.path, nextState);
    return {
      applied: true,
      blockId: makeBlockId(params.path, params.name),
      newRevision: nextState.revision,
    };
  }

  updateBlock(params: UpdateBlockParams): { applied: boolean; newRevision: number; error?: CodeBlockError } {
    const [path, name] = this.parseBlockId(params.blockId);
    const state = this.files.get(path);
    if (!state) {
      return { applied: false, newRevision: -1, error: { code: "NOT_FOUND", message: `File not found: ${path}` } };
    }

    if (state.revision !== params.expectedRevision) {
      return {
        applied: false,
        newRevision: state.revision,
        error: { code: "REVISION_CONFLICT", message: "Revision mismatch." },
      };
    }

    if (name === "INCLUDE" && params.actor && params.actor !== "Orchestrator") {
      return {
        applied: false,
        newRevision: state.revision,
        error: { code: "PERMISSION_DENIED", message: "Only Orchestrator can update INCLUDE block." },
      };
    }

    const parsed = parseBlocks(state.content);
    const target = parsed.find((b) => b.name === name);
    if (!target) {
      return { applied: false, newRevision: state.revision, error: { code: "NOT_FOUND", message: "Block not found." } };
    }

    const lines = normalizeEol(state.content).split("\n");
    const startIdx = target.range.startLine - 1;
    const endIdx = target.range.endLine - 1;
    const replacement = this.renderBlock(name, params.newContent).split("\n");
    const nextLines = [...lines.slice(0, startIdx), ...replacement, ...lines.slice(endIdx + 1)];
    const nextContent = nextLines.join("\n");

    const guarded = this.validateIncludeGuard(path, nextContent, state.attrsByName);
    if (guarded) {
      return { applied: false, newRevision: state.revision, error: guarded };
    }

    this.files.set(path, {
      ...state,
      content: nextContent,
      revision: state.revision + 1,
    });

    return {
      applied: true,
      newRevision: state.revision + 1,
    };
  }

  getFileContent(path: string): string | null {
    return this.files.get(path)?.content ?? null;
  }

  private validateIncludeGuard(path: string, content: string, attrsByName: Map<string, BlockAttrs>): CodeBlockError | null {
    const blocks = toMeta(path, content, attrsByName);
    return this.includeGuard.validate(blocks);
  }

  private parseBlockId(blockId: string): [string, string] {
    const idx = blockId.lastIndexOf("#");
    if (idx < 0) {
      throw new Error(`Invalid block id: ${blockId}`);
    }

    return [blockId.slice(0, idx), blockId.slice(idx + 1)];
  }

  private renderBlock(name: string, body: string): string {
    return `//{${name}}_BEGIN\n${normalizeEol(body)}\n//{${name}}_END`;
  }

  private insertBlock(
    current: string,
    blockText: string,
    position: CreateBlockParams["position"],
    existing: BlockMeta[]
  ): string {
    const normalized = normalizeEol(current);
    if (!normalized.trim()) {
      return blockText;
    }

    if (position === "file_top") {
      return `${blockText}\n\n${normalized}`;
    }

    if (position === "file_end") {
      return `${normalized}\n\n${blockText}`;
    }

    if (position.startsWith("after_block:")) {
      const anchorId = position.slice("after_block:".length);
      const anchor = existing.find((b) => b.blockId === anchorId);
      if (!anchor) {
        throw new Error(`Anchor block not found: ${anchorId}`);
      }

      const lines = normalized.split("\n");
      const before = lines.slice(0, anchor.range.endLine).join("\n");
      const after = lines.slice(anchor.range.endLine).join("\n");
      return `${before}\n\n${blockText}${after ? `\n${after}` : ""}`;
    }

    return `${normalized}\n\n${blockText}`;
  }
}
