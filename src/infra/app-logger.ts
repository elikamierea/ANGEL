export interface AppLogger {
  info(message: string, payload?: unknown): void;
  warn(message: string, payload?: unknown): void;
  error(message: string, payload?: unknown): void;
}

export class ConsoleAppLogger implements AppLogger {
  constructor(private readonly namespace = "app") {}

  info(message: string, payload?: unknown): void {
    this.log("info", message, payload);
  }

  warn(message: string, payload?: unknown): void {
    this.log("warn", message, payload);
  }

  error(message: string, payload?: unknown): void {
    this.log("error", message, payload);
  }

  private log(level: "info" | "warn" | "error", message: string, payload?: unknown): void {
    const prefix = `[${this.namespace}]`;
    if (payload === undefined) {
      console[level](`${prefix} ${message}`);
      return;
    }

    console[level](`${prefix} ${message}`, payload);
  }
}

export function createNoopLogger(): AppLogger {
  return {
    info() {
      // noop
    },
    warn() {
      // noop
    },
    error() {
      // noop
    },
  };
}
