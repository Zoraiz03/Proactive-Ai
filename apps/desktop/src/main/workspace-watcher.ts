import chokidar, { type FSWatcher } from "chokidar";
import { isAbsolute, relative, sep } from "node:path";
import type { WorkspaceChange, WorkspaceChangeBatch } from "../shared/workspace";

const IGNORED_DIRECTORY_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
]);
const BATCH_DELAY_MS = 180;
const INTERNAL_EVENT_SUPPRESSION_MS = 1_000;

interface WorkspaceWatcherOptions {
  batchDelayMs?: number;
  suppressionMs?: number;
  usePolling?: boolean;
}

export function shouldIgnoreWorkspaceWatchPath(
  rootPath: string,
  candidatePath: string
): boolean {
  const relativePath = relative(rootPath, candidatePath);
  if (relativePath === "") return false;
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    return true;
  }
  return relativePath
    .split(/[\\/]/)
    .some((segment) => IGNORED_DIRECTORY_NAMES.has(segment.toLowerCase()));
}

function normalizeRelativeWatchPath(rootPath: string, absolutePath: string): string | null {
  const relativePath = relative(rootPath, absolutePath);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    return null;
  }
  return relativePath.replaceAll("\\", "/");
}

export class WorkspaceWatcher {
  private watcher: FSWatcher | null = null;
  private rootPath: string | null = null;
  private pending = new Map<string, WorkspaceChange>();
  private suppressed = new Map<string, number>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onBatch: (batch: WorkspaceChangeBatch) => void;
  private readonly options: WorkspaceWatcherOptions;

  constructor(
    onBatch: (batch: WorkspaceChangeBatch) => void,
    options: WorkspaceWatcherOptions = {}
  ) {
    this.onBatch = onBatch;
    this.options = options;
  }

  start(rootPath: string): Promise<void> {
    void this.stop();
    this.rootPath = rootPath;
    const watcher = chokidar.watch(rootPath, {
      persistent: true,
      ignoreInitial: true,
      ignored: (candidatePath) => shouldIgnoreWorkspaceWatchPath(rootPath, candidatePath),
      awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 30 },
      followSymlinks: false,
      usePolling: this.options.usePolling ?? false,
      interval: 50,
    });
    this.watcher = watcher;
    watcher
      .on("add", (path) => this.queue(path, "added", "file"))
      .on("addDir", (path) => this.queue(path, "added", "directory"))
      .on("change", (path) => this.queue(path, "changed", "file"))
      .on("unlink", (path) => this.queue(path, "deleted", "file"))
      .on("unlinkDir", (path) => this.queue(path, "deleted", "directory"));
    return new Promise((resolve, reject) => {
      watcher.once("ready", resolve);
      watcher.once("error", reject);
    });
  }

  suppress(relativePaths: string[]): void {
    const expiresAt = Date.now() + (this.options.suppressionMs ?? INTERNAL_EVENT_SUPPRESSION_MS);
    for (const relativePath of relativePaths) {
      if (relativePath) this.suppressed.set(relativePath.replaceAll("\\", "/"), expiresAt);
    }
  }

  async stop(): Promise<void> {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.pending.clear();
    this.suppressed.clear();
    this.rootPath = null;
    const watcher = this.watcher;
    this.watcher = null;
    if (watcher) await watcher.close();
  }

  private queue(
    absolutePath: string,
    type: WorkspaceChange["type"],
    kind: WorkspaceChange["kind"]
  ): void {
    if (!this.rootPath || shouldIgnoreWorkspaceWatchPath(this.rootPath, absolutePath)) return;
    const relativePath = normalizeRelativeWatchPath(this.rootPath, absolutePath);
    if (!relativePath) return;
    this.pending.set(relativePath, { relativePath, type, kind });
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), this.options.batchDelayMs ?? BATCH_DELAY_MS);
  }

  private flush(): void {
    this.flushTimer = null;
    const now = Date.now();
    this.suppressed.forEach((expiresAt, path) => {
      if (expiresAt <= now) this.suppressed.delete(path);
    });
    const suppressed = Array.from(this.suppressed.entries());
    const changes = Array.from(this.pending.values()).filter(
      (change) => !suppressed.some(
        ([path, expiresAt]) =>
          expiresAt > now &&
          (change.relativePath === path || change.relativePath.startsWith(`${path}/`))
      )
    );
    this.pending.clear();
    if (changes.length > 0) this.onBatch({ changes, timestamp: now });
  }
}
