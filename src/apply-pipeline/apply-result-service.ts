import { GraphOperation, GraphSnapshot } from "../shared/types";
import { GraphAuditService } from "../graph-domain/graph-audit-service";
import { GraphOperationService } from "../graph-domain/graph-operation-service";
import { BlockToolAdapter } from "../code-block/block-tool-adapter";
import { ApplyConflict, ApplyRequest, ApplyResult } from "./apply-types";

interface CodeUpdatePayload {
  blockId: string;
  newContent: string;
  actor?: string;
}

interface GraphUpdatePayload {
  operations: GraphOperation[];
}

function conflict(message: string, remediation: string): ApplyConflict {
  return {
    code: "REVISION_CONFLICT",
    message,
    remediation,
  };
}

export class ApplyResultService {
  constructor(
    private readonly graphOps: GraphOperationService,
    private readonly graphAudit: GraphAuditService,
    private readonly blockTools: BlockToolAdapter
  ) {}

  apply(request: ApplyRequest): ApplyResult {
    if (request.target === "graph") {
      return this.applyGraph(request);
    }

    return this.applyCode(request);
  }

  retryWithLatest(request: ApplyRequest): ApplyResult {
    if (request.target === "graph") {
      const latestRevision = this.inferLatestGraphRevision();
      return this.apply({ ...request, expectedRevision: latestRevision });
    }

    const latestRevision = this.inferLatestCodeRevision(request.payload as CodeUpdatePayload);
    return this.apply({ ...request, expectedRevision: latestRevision });
  }

  private applyGraph(request: ApplyRequest): ApplyResult {
    const payload = request.payload as GraphUpdatePayload;
    const result = this.graphOps.runTransaction({
      actor: request.actor,
      expectedRevision: request.expectedRevision,
      operations: payload.operations,
    });

    if (!result.applied) {
      return {
        applied: false,
        target: "graph",
        newRevision: result.newRevision,
        conflicts: [
          conflict(
            result.errors?.[0]?.message ?? "Graph apply failed due to conflict.",
            "Refresh graph revision and retry with latest snapshot."
          ),
        ],
      };
    }

    return {
      applied: true,
      target: "graph",
      newRevision: result.newRevision,
      conflicts: [],
    };
  }

  private applyCode(request: ApplyRequest): ApplyResult {
    const payload = request.payload as CodeUpdatePayload;
    const result = this.blockTools.code_update_block({
      blockId: payload.blockId,
      newContent: payload.newContent,
      expectedRevision: request.expectedRevision,
      actor: payload.actor ?? request.actor,
    });

    if (!result.applied) {
      return {
        applied: false,
        target: "code",
        newRevision: result.newRevision,
        conflicts: [
          conflict(
            result.error?.message ?? "Code apply failed due to conflict.",
            "Reload block revision via code_read_block, then retry update."
          ),
        ],
      };
    }

    return {
      applied: true,
      target: "code",
      newRevision: result.newRevision,
      conflicts: [],
    };
  }

  private inferLatestGraphRevision(): number {
    const latest = this.graphAudit.latest();
    const after = latest?.afterDiff as GraphSnapshot | undefined;
    return after?.revision ?? 0;
  }

  private inferLatestCodeRevision(payload: CodeUpdatePayload): number {
    const read = this.blockTools.code_read_block({ blockId: payload.blockId });
    if (!read.applied) {
      return 0;
    }

    return read.revision;
  }
}
