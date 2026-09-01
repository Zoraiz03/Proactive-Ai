import type { IpcResult } from "./workspace.ts";

export const VERIFICATION_TASK_CHANNELS = { run: "verification-task:run" } as const;
export type VerificationTaskKind = "test" | "build";
export interface VerificationTaskRequest { taskId: string; command: string }
export interface VerificationTaskResult { taskId: string; kind: VerificationTaskKind; command: string; status: "succeeded" | "failed" | "timed_out"; exitCode: number | null; durationMs: number; stdout: string; stderr: string }
export interface VerificationTaskBridge { run: (request: VerificationTaskRequest) => Promise<IpcResult<VerificationTaskResult>> }
export interface ParsedVerificationTask { kind: VerificationTaskKind; executable: string; args: string[]; display: string }

const safeToken = /^[A-Za-z0-9_./:@%+=,-]+$/;

export function parseVerificationTaskCommand(value: unknown): ParsedVerificationTask | null {
  if (typeof value !== "string" || !value.trim() || value.length > 500 || /[;&|`$<>\n\r"']/.test(value)) return null;
  const tokens = value.trim().split(/\s+/); if (!tokens.every((token) => safeToken.test(token))) return null;
  const [tool, ...args] = tokens; let kind: VerificationTaskKind | null = null;
  if (tool === "npm" && (args[0] === "test" || (args[0] === "run" && /^test(?::[\w-]+)?$/.test(args[1] ?? "")))) kind = "test";
  else if (tool === "npm" && args[0] === "run" && /^(?:build|lint|typecheck|check)$/.test(args[1] ?? "")) kind = "build";
  else if (tool === "pnpm" && (args[0] === "test" || (args[0] === "run" && /^test(?::[\w-]+)?$/.test(args[1] ?? "")))) kind = "test";
  else if (tool === "pnpm" && args[0] === "run" && /^(?:build|lint|typecheck|check)$/.test(args[1] ?? "")) kind = "build";
  else if (tool === "yarn" && /^test(?::[\w-]+)?$/.test(args[0] ?? "")) kind = "test";
  else if (tool === "yarn" && /^(?:build|lint|typecheck)$/.test(args[0] ?? "")) kind = "build";
  else if (tool === "pytest" || ((tool === "python" || tool === "python3") && args[0] === "-m" && args[1] === "pytest")) kind = "test";
  else if (tool === "cargo" && args[0] === "test") kind = "test";
  else if (tool === "cargo" && args[0] === "check") kind = "build";
  else if (tool === "go" && args[0] === "test") kind = "test";
  else if (tool === "mvn" && args[0] === "test") kind = "test";
  else if (tool === "gradle" && args[0] === "test") kind = "test";
  else if (tool === "npx" && args[0] === "tsc" && args.includes("--noEmit")) kind = "build";
  if (!kind) return null;
  return { kind, executable: tool, args, display: tokens.join(" ") };
}
