export type CodeBlockType =
  | "include"
  | "guard_or_pragma"
  | "forward_decl"
  | "type_decl"
  | "public_api"
  | "private_members"
  | "class_impl"
  | "util_fn"
  | "init"
  | "other";

export type CodeBlockErrorCode =
  | "REVISION_CONFLICT"
  | "PERMISSION_DENIED"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONSTRAINT_VIOLATION";

export interface CodeBlockError {
  code: CodeBlockErrorCode;
  message: string;
}

export interface BlockRange {
  startLine: number;
  endLine: number;
}

export interface BlockMeta {
  blockId: string;
  path: string;
  name: string;
  featureKey: string;
  type: CodeBlockType;
  ownerAgent: string;
  range: BlockRange;
}

export interface ParsedBlock {
  name: string;
  range: BlockRange;
  content: string;
}

export interface CodeFileRecord {
  path: string;
  revision: number;
  content: string;
}
