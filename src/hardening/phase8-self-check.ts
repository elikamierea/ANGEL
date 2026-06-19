import { runApplyRegressionSuite } from "./apply-regression";
import { runBlockRegressionSuite } from "./block-regression";
import { runGraphRegressionSuite } from "./graph-regression";
import { runPerformanceSanityCheck } from "./performance-sanity-check";
import { runRecoverySafetyCheck } from "./recovery-safety-check";

export function runPhase8SelfCheck(): void {
  runGraphRegressionSuite();
  runBlockRegressionSuite();
  runApplyRegressionSuite();
  runRecoverySafetyCheck();
  runPerformanceSanityCheck();
}
