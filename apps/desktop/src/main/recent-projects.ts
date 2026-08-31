import { lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { RecentWorkspace } from "../shared/workspace";
import { prepareWorkspaceRoot } from "./workspace-files.ts";

export const RECENT_PROJECT_LIMIT = 10;
const STORAGE_VERSION = 1;
const MAX_PATH_LENGTH = 4_096;

export interface StoredRecentWorkspace {
  path: string;
  displayName: string;
  lastOpenedAt: number;
}

interface StoredRecentProjects {
  version: number;
  projects: StoredRecentWorkspace[];
}

function validProject(value: unknown): value is StoredRecentWorkspace {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<StoredRecentWorkspace>;
  return Boolean(
    typeof project.path === "string" &&
      project.path.length > 0 &&
      project.path.length <= MAX_PATH_LENGTH &&
      isAbsolute(project.path) &&
      !project.path.includes("\0") &&
      typeof project.displayName === "string" &&
      project.displayName.length > 0 &&
      project.displayName.length <= 255 &&
      !project.displayName.includes("\0") &&
      typeof project.lastOpenedAt === "number" &&
      Number.isFinite(project.lastOpenedAt) &&
      project.lastOpenedAt > 0
  );
}

function pathKey(path: string): string {
  return process.platform === "win32" ? path.toLocaleLowerCase("en-US") : path;
}

export function normalizeRecentProjects(value: unknown): StoredRecentWorkspace[] {
  if (!value || typeof value !== "object") return [];
  const projects = (value as Partial<StoredRecentProjects>).projects;
  if (!Array.isArray(projects)) return [];
  const unique = new Map<string, StoredRecentWorkspace>();
  for (const project of projects) {
    if (!validProject(project)) continue;
    const key = pathKey(project.path);
    const existing = unique.get(key);
    if (!existing || project.lastOpenedAt > existing.lastOpenedAt) unique.set(key, project);
  }
  return Array.from(unique.values())
    .sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)
    .slice(0, RECENT_PROJECT_LIMIT);
}

export function recentProjectId(path: string): string {
  return createHash("sha256").update(pathKey(path)).digest("hex");
}

export function safeRecentDisplayPath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length === 0 ? "…" : `…/${parts.slice(-2).join("/")}`;
}

export function validateRecentId(value: unknown): string | null {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export class RecentProjectsStore {
  readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, "recent-projects.json");
  }

  async list(): Promise<StoredRecentWorkspace[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return normalizeRecentProjects(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return [];
      throw error;
    }
  }

  async listPublic(): Promise<RecentWorkspace[]> {
    return (await this.list()).map((project) => ({
      id: recentProjectId(project.path),
      displayName: project.displayName,
      displayPath: safeRecentDisplayPath(project.path),
      lastOpenedAt: project.lastOpenedAt,
    }));
  }

  async add(path: string, displayName: string, lastOpenedAt = Date.now()): Promise<StoredRecentWorkspace[]> {
    const existing = await this.list();
    const project: StoredRecentWorkspace = { path, displayName, lastOpenedAt };
    const projects = normalizeRecentProjects({
      projects: [project, ...existing.filter((item) => pathKey(item.path) !== pathKey(path))],
    });
    await this.write(projects);
    return projects;
  }

  async remove(id: string): Promise<RecentWorkspace[]> {
    const projects = (await this.list()).filter((item) => recentProjectId(item.path) !== id);
    await this.write(projects);
    return this.listPublic();
  }

  async clear(): Promise<void> {
    await this.write([]);
  }

  async find(id: string): Promise<StoredRecentWorkspace | null> {
    return (await this.list()).find((item) => recentProjectId(item.path) === id) ?? null;
  }

  private async write(projects: StoredRecentWorkspace[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify({ version: STORAGE_VERSION, projects }, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 }
    );
    try {
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }
}

export async function prepareRecentWorkspace(
  store: RecentProjectsStore,
  value: unknown
): Promise<{ name: string; rootPath: string }> {
  const id = validateRecentId(value);
  const project = id ? await store.find(id) : null;
  if (!project) {
    throw new Error("Recent workspace is not authorized.");
  }
  const path = project.path;
  const pathStats = await lstat(path);
  if (pathStats.isSymbolicLink() || !pathStats.isDirectory()) {
    throw new Error("Recent workspace is unavailable.");
  }
  const selected = await prepareWorkspaceRoot(path);
  if (pathKey(selected.rootPath) !== pathKey(resolve(path))) {
    throw new Error("Recent workspace path changed.");
  }
  return selected;
}
