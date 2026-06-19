import { createAppShell } from "../app-shell/app-shell";
import { AgentRequestGateway, AgentExecutor } from "../agent-system/agent-request-gateway";
import { AgentSessionManager } from "../agent-system/agent-session-manager";
import { ContextPackBuilder } from "../agent-system/context-pack-builder";
import { StructuredResponseRenderer } from "../agent-system/structured-response-renderer";
import { ConsoleHostController } from "../agent-console-host/console-host-controller";
import { ApplyResultService } from "../apply-pipeline/apply-result-service";
import { InspectorConflictStore } from "../apply-pipeline/inspector-conflict-store";
import { BlockRegistry } from "../code-block/block-registry";
import { BlockToolAdapter } from "../code-block/block-tool-adapter";
import { GraphAuditService } from "../graph-domain/graph-audit-service";
import { GraphOperationService } from "../graph-domain/graph-operation-service";
import { GraphStore } from "../graph-domain/graph-store";
import { BuildRunner } from "../integration/build-runner";
import { DowncastService } from "../integration/downcast-service";
import { GitSnapshotService } from "../integration/git-snapshot-service";
import { TopBarStatusService } from "../integration/topbar-status-service";
import { AppPersistence } from "../infra/app-persistence";
import { BrowserPersistenceFactory, PersistenceFactory } from "../infra/persistence-factory";
import { AgentModelSettingsService } from "../agent-system/agent-model-settings";
import { DefaultModelExecutor } from "../agent-system/default-model-executor";

export interface AppServices {
  appShell: ReturnType<typeof createAppShell>;
  graphStore: GraphStore;
  graphAudit: GraphAuditService;
  graphOps: GraphOperationService;
  blockRegistry: BlockRegistry;
  blockTools: BlockToolAdapter;
  sessions: AgentSessionManager;
  contextBuilder: ContextPackBuilder;
  requestGateway: AgentRequestGateway;
  responseRenderer: StructuredResponseRenderer;
  applyService: ApplyResultService;
  conflictStore: InspectorConflictStore;
  consoleHost: ConsoleHostController;
  downcast: DowncastService;
  buildRunner: BuildRunner;
  gitSnapshots: GitSnapshotService;
  topbarStatus: TopBarStatusService;
  persistenceFactory: PersistenceFactory;
}

class FakeExecutor implements AgentExecutor {
  async execute(input: { prompt: string; modelContextText: string }): Promise<{
    summary: string;
    actions: string[];
    affectedTargets: string[];
    result: "ok";
    risks: string[];
    nextStep: string;
  }> {
    return {
      summary: `Received: ${input.prompt.slice(0, 120)}\n\n[context-size=${input.modelContextText.length}]`,
      actions: ["Inspect context", "Propose change"],
      affectedTargets: [],
      result: "ok",
      risks: [],
      nextStep: "User confirms apply.",
    };
  }
}

export function createCompositionRoot(options?: {
  persistenceFactory?: PersistenceFactory;
  sessionExecutor?: AgentExecutor;
}): AppServices {
  const persistenceFactory = options?.persistenceFactory ?? new BrowserPersistenceFactory();

  const graphStore = new GraphStore();
  const graphAudit = new GraphAuditService();
  const graphOps = new GraphOperationService(graphStore, graphAudit);

  const blockRegistry = new BlockRegistry();
  const blockTools = new BlockToolAdapter(blockRegistry);

  const sessions = new AgentSessionManager();
  const contextBuilder = new ContextPackBuilder();
  const responseRenderer = new StructuredResponseRenderer();

  const modelSettingsPersistence: AppPersistence = persistenceFactory.create("angel.agent-model-settings.v1");
  const modelSettings = new AgentModelSettingsService(modelSettingsPersistence);
  const defaultExecutor = new DefaultModelExecutor(modelSettings);

  const requestGateway = new AgentRequestGateway(
    sessions,
    options?.sessionExecutor ?? defaultExecutor ?? new FakeExecutor()
  );

  const applyService = new ApplyResultService(graphOps, graphAudit, blockTools);
  const conflictStore = new InspectorConflictStore();

  const downcast = new DowncastService(graphStore);
  const buildRunner = new BuildRunner();
  const gitSnapshots = new GitSnapshotService();
  const topbarStatus = new TopBarStatusService();

  const appShellPersistence: AppPersistence = persistenceFactory.create("angel.client.global-state.v1");
  const consoleHostPersistence: AppPersistence = persistenceFactory.create("angel.console-host.v1");

  const appShell = createAppShell({ persistence: appShellPersistence });
  const consoleHost = new ConsoleHostController(sessions, consoleHostPersistence);

  return {
    appShell,
    graphStore,
    graphAudit,
    graphOps,
    blockRegistry,
    blockTools,
    sessions,
    contextBuilder,
    requestGateway,
    responseRenderer,
    applyService,
    conflictStore,
    consoleHost,
    downcast,
    buildRunner,
    gitSnapshots,
    topbarStatus,
    persistenceFactory,
  };
}
