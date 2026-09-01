import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DEFAULT_LOCAL_SETTINGS, normalizeLocalSettings, type LocalSettings } from "../shared/settings.ts";
import type { ProactiveFeedbackRecord } from "../shared/proactive-observer.ts";

export class LocalSettingsStore {
  readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, "desktop-settings.json");
  }

  async get(): Promise<LocalSettings> {
    try {
      return normalizeLocalSettings(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) {
        return normalizeLocalSettings(DEFAULT_LOCAL_SETTINGS);
      }
      throw error;
    }
  }

  async set(value: unknown): Promise<LocalSettings> {
    const settings = normalizeLocalSettings(value);
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    try {
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
    return settings;
  }

  reset(): Promise<LocalSettings> {
    return this.set(DEFAULT_LOCAL_SETTINGS);
  }
}

export class WorkspaceTabStore {
  readonly filePath: string;
  constructor(userDataPath: string) { this.filePath = join(userDataPath, "workspace-tabs.json"); }
  private validId(value: string) { return /^[a-f0-9]{64}$/.test(value); }
  private cleanPaths(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.filter((path): path is string => typeof path === "string" && path.length > 0 && path.length <= 4096 && !path.includes("\0") && !path.startsWith("/") && !path.split(/[\\/]/).includes("..")))).slice(0, 20);
  }
  private async all(): Promise<Record<string, string[]>> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      if (!parsed || typeof parsed !== "object") return {};
      return Object.fromEntries(Object.entries(parsed).filter(([id]) => this.validId(id)).map(([id, paths]) => [id, this.cleanPaths(paths)]));
    } catch { return {}; }
  }
  async get(workspaceId: string): Promise<string[]> { return this.validId(workspaceId) ? (await this.all())[workspaceId] ?? [] : []; }
  async set(workspaceId: string, paths: unknown): Promise<void> {
    if (!this.validId(workspaceId)) throw new Error("Invalid workspace identifier.");
    const all = await this.all(); all[workspaceId] = this.cleanPaths(paths);
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(all, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  }
}

export async function clearLocalObserverHistory(userDataPath: string): Promise<void> {
  for (const name of ["observer-context-history.json", "proactive-observer-feedback.json"]) {
    await unlink(join(userDataPath, name)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

export function parseProactiveFeedback(value: unknown): ProactiveFeedbackRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<ProactiveFeedbackRecord>;
  const keys = Object.keys(item); const allowed = ["version", "detectorType", "severity", "workspaceId", "signature", "timestamp", "outcome", "resolved", "timeToResolutionMs"];
  if (keys.some((key) => !allowed.includes(key)) || item.version !== 1 || !["persistent_diagnostic", "failed_run", "failed_test", "failed_build"].includes(String(item.detectorType)) || item.severity !== "error" || typeof item.workspaceId !== "string" || !/^[a-f0-9]{64}$/.test(item.workspaceId) || typeof item.signature !== "string" || !/^[a-f0-9]{16}$/.test(item.signature) || !Number.isFinite(item.timestamp) || !["investigate", "explain", "suggest_fix", "not_now", "mute_error", "mute_file", "mute_project", "disable_assist", "shown", "resolved"].includes(String(item.outcome)) || typeof item.resolved !== "boolean" || (item.timeToResolutionMs !== undefined && (!Number.isFinite(item.timeToResolutionMs) || item.timeToResolutionMs < 0))) return null;
  return item as ProactiveFeedbackRecord;
}

export class ProactiveFeedbackStore {
  readonly filePath: string;
  constructor(userDataPath: string) { this.filePath = join(userDataPath, "proactive-observer-feedback.json"); }
  private async read(): Promise<ProactiveFeedbackRecord[]> { try { const value = JSON.parse(await readFile(this.filePath, "utf8")); return Array.isArray(value) ? value.map(parseProactiveFeedback).filter((item): item is ProactiveFeedbackRecord => Boolean(item)).slice(-999) : []; } catch { return []; } }
  async append(value: unknown): Promise<void> {
    const record = parseProactiveFeedback(value); if (!record) throw new Error("Invalid proactive feedback metadata.");
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 }); const temporary = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify([...(await this.read()), record], null, 2)}\n`, { encoding: "utf8", mode: 0o600 }); await rename(temporary, this.filePath);
  }
}
