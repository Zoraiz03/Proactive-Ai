import type { IpcResult } from "./workspace";

export const RUNNER_CHANNELS = {
  start: "runner:start",
  stop: "runner:stop",
  output: "runner:output",
  complete: "runner:complete",
} as const;

export type RunLanguage = "python" | "javascript";
export type RunStatus = "running" | "succeeded" | "failed" | "stopped";

export interface RunStartRequest {
  expectedContentHash?: string;
  runId: string;
  relativePath: string;
}

export interface RunStopRequest {
  runId: string;
}

export interface RunOutputEvent {
  runId: string;
  stream: "stdout" | "stderr";
  data: string;
}

export interface RunDiagnostic {
  relativePath: string;
  line: number;
  column: number;
  message: string;
  source: RunLanguage;
}

export interface RunCompleteEvent {
  sourceHash?: string;
  sourceUnchanged?: boolean;
  snapshotVerified?: boolean;
  runId: string;
  status: Exclude<RunStatus, "running">;
  exitCode: number | null;
  durationMs: number;
  diagnostics: RunDiagnostic[];
}

export interface RunStarted {
  sourceHash?: string;
  runId: string;
  language: RunLanguage;
  relativePath: string;
}

export interface RunnerBridge {
  start: (request: RunStartRequest) => Promise<IpcResult<RunStarted>>;
  stop: (request: RunStopRequest) => Promise<IpcResult<void>>;
  onOutput: (listener: (event: RunOutputEvent) => void) => () => void;
  onComplete: (listener: (event: RunCompleteEvent) => void) => () => void;
}
