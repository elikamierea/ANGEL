import { runPhase1SelfCheck } from "../graph-domain/phase1-self-check";
import { runPhase2SelfCheck } from "../graph-rendering/phase2-self-check";

export function runGraphRegressionSuite(): void {
  runPhase1SelfCheck();
  runPhase2SelfCheck();
}
