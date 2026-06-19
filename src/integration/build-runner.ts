export interface BuildRunResult {
  ok: boolean;
  command: string[];
  startedAt: string;
  endedAt: string;
  summary: string;
  logs: string[];
}

export class BuildRunner {
  async run(command: string[] = ["cmake", "--build", "build"]): Promise<BuildRunResult> {
    const startedAt = new Date().toISOString();

    // Scaffold behavior: do not execute shell here yet.
    // Return structured placeholder so top-bar/status integration can proceed.
    const logs = [
      "[build] start",
      `[build] command: ${command.join(" ")}`,
      "[build] scaffold runner - execution backend pending",
    ];

    const endedAt = new Date().toISOString();
    return {
      ok: true,
      command,
      startedAt,
      endedAt,
      summary: "Build runner scaffold completed.",
      logs,
    };
  }
}
