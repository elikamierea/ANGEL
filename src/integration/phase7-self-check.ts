import { GraphAuditService } from "../graph-domain/graph-audit-service";
import { GraphOperationService } from "../graph-domain/graph-operation-service";
import { GraphStore } from "../graph-domain/graph-store";
import { BuildRunner } from "./build-runner";
import { DowncastService } from "./downcast-service";
import { GitSnapshotService } from "./git-snapshot-service";
import { TopBarStatusService } from "./topbar-status-service";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`Phase7SelfCheck failed: ${message}`);
  }
}

export async function runPhase7SelfCheck(): Promise<void> {
  const store = new GraphStore();
  const audit = new GraphAuditService();
  const ops = new GraphOperationService(store, audit);

  ops.runTransaction({
    actor: "self-check",
    expectedRevision: 0,
    operations: [
      {
        type: "createNode",
        node: { id: "n1", layer: "L1", name: "Macro", rect: { x: 0, y: 0, w: 100, h: 60 } },
      },
    ],
  });

  const downcast = new DowncastService(store);
  const downcastResult = downcast.downcast("L1");
  assert(downcastResult.applied, "downcast should apply to next layer");

  const snaps = new GitSnapshotService();
  const snap = snaps.createDowncastSnapshot(downcastResult.from, downcastResult.to);
  assert(snap.tag.startsWith("downcast/"), "snapshot tag should follow convention");

  const build = new BuildRunner();
  const buildResult = await build.run();
  assert(buildResult.ok, "build runner scaffold should return ok");

  const topbar = new TopBarStatusService();
  topbar.patch({ unsaved: true, buildRunning: true });
  topbar.patch({ buildRunning: false, agentBusy: true });
  const state = topbar.get();
  assert(state.unsaved, "topbar unsaved should be true");
  assert(!state.buildRunning, "topbar buildRunning should be false");
  assert(state.agentBusy, "topbar agentBusy should be true");
}
