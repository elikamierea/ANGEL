import { CodeBlockError } from "./block-types";

export function rejectWholeFileWrite(): CodeBlockError {
  return {
    code: "CONSTRAINT_VIOLATION",
    message:
      "Whole-file blind write is forbidden in normal operations. Use block-scoped APIs only (create/read/update/bind).",
  };
}
