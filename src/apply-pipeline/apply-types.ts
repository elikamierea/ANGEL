export type ApplyTargetKind = "graph" | "code";

export interface ApplyRequest {
  actor: string;
  target: ApplyTargetKind;
  expectedRevision: number;
  payload: unknown;
}

export interface ApplyConflict {
  code: "REVISION_CONFLICT" | "VALIDATION_ERROR" | "PERMISSION_DENIED";
  message: string;
  remediation: string;
}

export interface ApplyResult {
  applied: boolean;
  target: ApplyTargetKind;
  newRevision: number;
  conflicts: ApplyConflict[];
}

export interface ConflictPanelItem {
  id: string;
  target: ApplyTargetKind;
  message: string;
  remediation: string;
  createdAt: string;
  resolved: boolean;
}
