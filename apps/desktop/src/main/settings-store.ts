import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DEFAULT_LOCAL_SETTINGS, normalizeLocalSettings, type LocalSettings } from "../shared/settings.ts";

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
  await unlink(join(userDataPath, "observer-context-history.json")).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}
