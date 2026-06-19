import { GlobalState, GlobalStore, initialGlobalState } from "../state/global-store";
import {
  AppLogger,
  ConsoleAppLogger,
  createNoopLogger,
} from "../infra/app-logger";
import {
  AppPersistence,
  InMemoryPersistence,
  LocalStoragePersistence,
} from "../infra/app-persistence";

export interface AppShell {
  readonly state: GlobalStore;
  mount(): void;
  unmount(): void;
}

export interface CreateAppShellOptions {
  logger?: AppLogger;
  persistence?: AppPersistence;
  persistenceKey?: string;
}

const DEFAULT_PERSISTENCE_KEY = "angel.client.global-state.v1";

function createDefaultPersistence(key: string): AppPersistence {
  if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
    return new LocalStoragePersistence(key);
  }

  return new InMemoryPersistence();
}

// Phase 0 app shell bootstrap scaffold.
// Concrete panel wiring will be layered in subsequent phases.
export function createAppShell(options: CreateAppShellOptions = {}): AppShell {
  const logger = options.logger ?? (typeof console !== "undefined" ? new ConsoleAppLogger("app-shell") : createNoopLogger());
  const persistenceKey = options.persistenceKey ?? DEFAULT_PERSISTENCE_KEY;
  const persistence = options.persistence ?? createDefaultPersistence(persistenceKey);
  const state = new GlobalStore(initialGlobalState);

  let unsubscribe: (() => void) | null = null;

  return {
    state,

    mount() {
      logger.info("mount:start");

      const restored = persistence.load<GlobalState>();
      if (restored) {
        state.hydrate(restored);
        logger.info("state:restored", { activeLayer: restored.layout.activeLayer });
      } else {
        logger.info("state:fresh");
      }

      unsubscribe = state.subscribe((nextState) => {
        persistence.save(nextState);
      });

      // TODO: wire top bar, sidebars, canvas host, and agent console host
      logger.info("mount:ready");
    },

    unmount() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }

      logger.info("unmount");
    },
  };
}
