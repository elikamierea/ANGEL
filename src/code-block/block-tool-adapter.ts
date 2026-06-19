import { BlockRegistry } from "./block-registry";
import { CodeBlockError, CodeBlockType } from "./block-types";
import { rejectWholeFileWrite } from "./blind-write-guard";

export interface ListBlocksInput {
  path: string;
}

export interface CreateBlockInput {
  path: string;
  name: string;
  featureKey: string;
  type: CodeBlockType;
  ownerAgent: string;
  initialContent: string;
  position: "file_top" | "file_end" | `after_block:${string}`;
  expectedRevision: number;
}

export interface ReadBlockInput {
  blockId: string;
}

export interface UpdateBlockInput {
  blockId: string;
  newContent: string;
  expectedRevision: number;
  actor?: string;
}

export interface BindBlockInput {
  nodeId: string;
  blockId: string;
  expectedRevision: number;
}

interface BindingState {
  revision: number;
  nodeToBlocks: Map<string, Set<string>>;
  blockToNodes: Map<string, Set<string>>;
}

function ok<T extends object>(payload: T): T & { applied: true } {
  return { applied: true, ...payload };
}

function fail(error: CodeBlockError, newRevision: number) {
  return { applied: false as const, error, newRevision };
}

export class BlockToolAdapter {
  private bindings: BindingState = {
    revision: 0,
    nodeToBlocks: new Map(),
    blockToNodes: new Map(),
  };

  constructor(private readonly registry: BlockRegistry) {}

  code_list_blocks(input: ListBlocksInput) {
    const result = this.registry.listBlocks(input.path);
    if ("error" in result) {
      return fail(result.error, -1);
    }

    return ok({
      revision: result.revision,
      blocks: result.blocks,
    });
  }

  code_create_block(input: CreateBlockInput) {
    const result = this.registry.createBlock(input);
    if (!result.applied) {
      return fail(result.error!, result.newRevision);
    }

    return ok({
      blockId: result.blockId!,
      newRevision: result.newRevision,
    });
  }

  code_read_block(input: ReadBlockInput) {
    const result = this.registry.readBlock(input.blockId);
    if ("error" in result) {
      return fail(result.error, -1);
    }

    return ok({
      revision: result.revision,
      blockMeta: result.block,
      content: result.content,
    });
  }

  code_update_block(input: UpdateBlockInput) {
    const result = this.registry.updateBlock(input);
    if (!result.applied) {
      return fail(result.error!, result.newRevision);
    }

    return ok({
      newRevision: result.newRevision,
    });
  }

  code_bind_block_to_node(input: BindBlockInput) {
    if (this.bindings.revision !== input.expectedRevision) {
      return fail({ code: "REVISION_CONFLICT", message: "Binding revision mismatch." }, this.bindings.revision);
    }

    const read = this.registry.readBlock(input.blockId);
    if ("error" in read) {
      return fail(read.error, this.bindings.revision);
    }

    const nextNodeSet = new Set(this.bindings.nodeToBlocks.get(input.nodeId) ?? []);
    nextNodeSet.add(input.blockId);
    this.bindings.nodeToBlocks.set(input.nodeId, nextNodeSet);

    const nextBlockSet = new Set(this.bindings.blockToNodes.get(input.blockId) ?? []);
    nextBlockSet.add(input.nodeId);
    this.bindings.blockToNodes.set(input.blockId, nextBlockSet);

    this.bindings.revision += 1;

    return ok({
      newRevision: this.bindings.revision,
      nodeId: input.nodeId,
      blockId: input.blockId,
    });
  }

  // Explicitly reject non-block-scoped write path in normal operation flow.
  code_write_entire_file() {
    return fail(rejectWholeFileWrite(), -1);
  }

  listBindingsByNode(nodeId: string): string[] {
    return [...(this.bindings.nodeToBlocks.get(nodeId) ?? new Set<string>())];
  }

  listBindingsByBlock(blockId: string): string[] {
    return [...(this.bindings.blockToNodes.get(blockId) ?? new Set<string>())];
  }

  getBindingRevision(): number {
    return this.bindings.revision;
  }
}
