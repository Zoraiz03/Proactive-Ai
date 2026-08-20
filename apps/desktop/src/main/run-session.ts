import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { extname } from "node:path";
import type {
  RunCompleteEvent,
  RunLanguage,
  RunOutputEvent,
  RunStartRequest,
  RunStarted,
} from "../shared/runner";
import type { IpcResult } from "../shared/workspace";
import { createTerminalEnvironment } from "./terminal-environment.ts";
import { parseRunDiagnostics } from "./run-diagnostics.ts";
import { readWorkspaceTextFile, resolveWorkspacePath } from "./workspace-files.ts";

const MAX_REQUEST_PATH = 4_096;
const MAX_OUTPUT_CHUNK = 64 * 1024;
const MAX_CAPTURE = 2 * 1024 * 1024;

interface RunCommand {
  language: RunLanguage;
  command: string;
  args: string[];
}

interface ActiveRun {
  runId: string;
  webContentsId: number;
  relativePath: string;
  language: RunLanguage;
  startedAt: number;
  process: ChildProcessWithoutNullStreams;
  stdout: string;
  stderr: string;
  stopped: boolean;
}

interface RunSink {
  output: (webContentsId: number, event: RunOutputEvent) => void;
  complete: (webContentsId: number, event: RunCompleteEvent) => void;
}

export function commandForRunFile(
  platform: NodeJS.Platform,
  absolutePath: string
): RunCommand | { error: string } {
  const extension = extname(absolutePath).toLowerCase();
  if (extension === ".py") {
    return {
      language: "python",
      command: platform === "win32" ? "python" : "python3",
      args: [absolutePath],
    };
  }
  if (extension === ".js" || extension === ".mjs") {
    return { language: "javascript", command: "node", args: [absolutePath] };
  }
  if (extension === ".ts") return { error: "TypeScript runner not configured." };
  return { error: "This file type is not supported by Run Current File." };
}

function appendBounded(current: string, addition: string): string {
  const combined = current + addition;
  return combined.length <= MAX_CAPTURE ? combined : combined.slice(-MAX_CAPTURE);
}

function publicStartError(error: unknown): string {
  if (error instanceof Error && error.message === "TypeScript runner not configured.") {
    return error.message;
  }
  if (error instanceof Error && error.message === "This file type is not supported by Run Current File.") {
    return error.message;
  }
  return "The file could not be started. Check that its runtime is installed and available on PATH.";
}

export class RunSessionController {
  private workspace: { rootPath: string; webContentsId: number } | null = null;
  private active: ActiveRun | null = null;
  private readonly sink: RunSink;

  constructor(sink: RunSink) {
    this.sink = sink;
  }

  setWorkspace(rootPath: string, webContentsId: number): void {
    this.stopActive(false);
    this.workspace = { rootPath, webContentsId };
  }

  clearWorkspace(webContentsId?: number): void {
    if (webContentsId !== undefined && this.workspace?.webContentsId !== webContentsId) return;
    this.stopActive(true);
    this.workspace = null;
  }

  async start(webContentsId: number, request: unknown): Promise<IpcResult<RunStarted>> {
    if (!this.workspace || this.workspace.webContentsId !== webContentsId) {
      return { ok: false, error: "Open a workspace before running a file." };
    }
    if (this.active) return { ok: false, error: "A file is already running." };
    if (
      typeof request !== "object" || request === null ||
      typeof (request as RunStartRequest).runId !== "string" ||
      !/^[a-f0-9-]{16,64}$/i.test((request as RunStartRequest).runId) ||
      typeof (request as RunStartRequest).relativePath !== "string" ||
      (request as RunStartRequest).relativePath.length > MAX_REQUEST_PATH
    ) return { ok: false, error: "The run request was rejected." };

    const rootPath = this.workspace.rootPath;
    const relativePath = (request as RunStartRequest).relativePath;
    try {
      await readWorkspaceTextFile(rootPath, relativePath);
      const resolved = await resolveWorkspacePath(rootPath, relativePath);
      const command = commandForRunFile(process.platform, resolved.realPath);
      if ("error" in command) throw new Error(command.error);
      const environment: NodeJS.ProcessEnv = {
        ...createTerminalEnvironment(process.env),
        NODE_ENV: process.env.NODE_ENV ?? "development",
      };
      environment.NO_COLOR = "1";
      environment.FORCE_COLOR = "0";
      environment.PYTHONIOENCODING = "utf-8";
      const child = spawn(command.command, command.args, {
        cwd: rootPath,
        env: environment,
        shell: false,
        windowsHide: true,
      });
      const active: ActiveRun = {
        runId: (request as RunStartRequest).runId, webContentsId, relativePath: resolved.relativePath,
        language: command.language, startedAt: Date.now(), process: child,
        stdout: "", stderr: "", stopped: false,
      };
      this.active = active;
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (data: string) => this.handleOutput(active, "stdout", data));
      child.stderr.on("data", (data: string) => this.handleOutput(active, "stderr", data));
      child.once("error", (error) => {
        this.handleOutput(active, "stderr", `${error.message}\n`);
      });
      child.once("close", (exitCode) => this.finish(active, exitCode));
      return {
        ok: true,
        value: { runId: active.runId, language: active.language, relativePath: active.relativePath },
      };
    } catch (error) {
      return { ok: false, error: publicStartError(error) };
    }
  }

  stop(webContentsId: number, request: unknown): IpcResult<void> {
    const runId = typeof request === "object" && request !== null && "runId" in request
      ? request.runId : null;
    if (typeof runId !== "string" || runId.length > 100) {
      return { ok: false, error: "The stop request was rejected." };
    }
    if (!this.active || this.active.webContentsId !== webContentsId || this.active.runId !== runId) {
      return { ok: false, error: "The running file is no longer available." };
    }
    this.active.stopped = true;
    try {
      this.active.process.kill();
      return { ok: true, value: undefined };
    } catch {
      return { ok: false, error: "The running file could not be stopped." };
    }
  }

  rendererClosed(webContentsId: number): void {
    if (this.active?.webContentsId === webContentsId) this.stopActive(false);
    if (this.workspace?.webContentsId === webContentsId) this.workspace = null;
  }

  dispose(): void {
    this.stopActive(false);
    this.workspace = null;
  }

  private handleOutput(active: ActiveRun, stream: "stdout" | "stderr", data: string): void {
    if (this.active !== active) return;
    const safeData = data.slice(0, MAX_OUTPUT_CHUNK);
    active[stream] = appendBounded(active[stream], safeData);
    this.sink.output(active.webContentsId, { runId: active.runId, stream, data: safeData });
  }

  private finish(active: ActiveRun, exitCode: number | null): void {
    if (this.active !== active) return;
    this.active = null;
    const status = active.stopped ? "stopped" : exitCode === 0 ? "succeeded" : "failed";
    this.sink.complete(active.webContentsId, {
      runId: active.runId,
      status,
      exitCode,
      durationMs: Math.max(0, Date.now() - active.startedAt),
      diagnostics: parseRunDiagnostics(this.workspace?.rootPath ?? "", active.language, active.stderr),
    });
  }

  private stopActive(notify: boolean): void {
    const active = this.active;
    if (!active) return;
    this.active = null;
    active.stopped = true;
    try { active.process.kill(); } catch { /* It may already have exited. */ }
    if (notify) {
      this.sink.complete(active.webContentsId, {
        runId: active.runId,
        status: "stopped",
        exitCode: null,
        durationMs: Math.max(0, Date.now() - active.startedAt),
        diagnostics: [],
      });
    }
  }
}
