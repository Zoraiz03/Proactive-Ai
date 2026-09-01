import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { parseVerificationTaskCommand, type VerificationTaskRequest, type VerificationTaskResult } from "../shared/verification-task.ts";
import type { IpcResult } from "../shared/workspace.ts";
import { createTerminalEnvironment } from "./terminal-environment.ts";

const MAX_CAPTURE = 2 * 1024 * 1024; const TIMEOUT_MS = 10 * 60_000;
const append = (current: string, value: string) => `${current}${value}`.slice(-MAX_CAPTURE);

export class VerificationTaskController {
  private workspace: { rootPath: string; webContentsId: number } | null = null;
  private active: ChildProcessWithoutNullStreams | null = null;
  setWorkspace(rootPath: string, webContentsId: number) { this.stop(); this.workspace = { rootPath, webContentsId }; }
  clearWorkspace(webContentsId?: number) { if (webContentsId !== undefined && this.workspace?.webContentsId !== webContentsId) return; this.stop(); this.workspace = null; }
  dispose() { this.stop(); this.workspace = null; }

  async run(webContentsId: number, value: unknown): Promise<IpcResult<VerificationTaskResult>> {
    if (!this.workspace || this.workspace.webContentsId !== webContentsId) return { ok: false, error: "Open a workspace before running verification." };
    if (this.active) return { ok: false, error: "A controlled verification task is already running." };
    const request = value as Partial<VerificationTaskRequest> | null; const parsed = parseVerificationTaskCommand(request?.command);
    if (!request || typeof request.taskId !== "string" || !/^[0-9a-f-]{36}$/i.test(request.taskId) || !parsed) return { ok: false, error: "Only an approved test or build command can run." };
    const startedAt = Date.now(); let stdout = ""; let stderr = ""; let timedOut = false;
    try {
      const environment: NodeJS.ProcessEnv = { ...createTerminalEnvironment(process.env), NODE_ENV: process.env.NODE_ENV ?? "development", NO_COLOR: "1", FORCE_COLOR: "0" };
      const child = spawn(parsed.executable, parsed.args, { cwd: this.workspace.rootPath, env: environment, shell: false, windowsHide: true }); this.active = child;
      child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8"); child.stdout.on("data", (data: string) => { stdout = append(stdout, data); }); child.stderr.on("data", (data: string) => { stderr = append(stderr, data); });
      const exitCode = await new Promise<number | null>((resolve, reject) => { const timer = setTimeout(() => { timedOut = true; try { child.kill(); } catch { /* already closed */ } }, TIMEOUT_MS); child.once("error", reject); child.once("close", (code) => { clearTimeout(timer); resolve(code); }); });
      this.active = null; return { ok: true, value: { taskId: request.taskId, kind: parsed.kind, command: parsed.display, status: timedOut ? "timed_out" : exitCode === 0 ? "succeeded" : "failed", exitCode, durationMs: Math.max(0, Date.now() - startedAt), stdout, stderr } };
    } catch { this.active = null; return { ok: false, error: "The controlled verification task could not start. Check that its tool is installed." }; }
  }
  private stop() { const child = this.active; this.active = null; if (child) try { child.kill(); } catch { /* already closed */ } }
}
