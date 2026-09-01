import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, realpath, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isMandatorySecretFile } from "../shared/settings.ts";
import { lineDiffStats, parseMultiFilePlan, validateMultiFileChangeSet, type AppliedFileSnapshot, type MultiFileApplyRequest, type MultiFileBase, type MultiFileChange, type MultiFileLimits, type MultiFilePlan, type MultiFileUndoResult } from "../shared/multi-file-change.ts";
import { isSupportedWorkspaceTextFile, normalizeWorkspaceRelativePath, readWorkspaceTextFile } from "./workspace-files.ts";
import { redactProjectSecrets } from "./project-context.ts";

const HASH = /^[a-f0-9]{64}$/;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const isNodeError = (error: unknown, code: string) => error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
const within = (root: string, path: string) => { const value = relative(root, path); return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value)); };

interface UpdateBundleEntry { operation: "update"; relativePath: string; originalContent: string; originalHash: string; appliedContent: string; appliedHash: string; mode: number }
interface CreateBundleEntry { operation: "create"; relativePath: string; appliedContent: string; appliedHash: string }
type BundleEntry = UpdateBundleEntry | CreateBundleEntry;
interface CheckpointBundle { workspaceId: string; changeSetId: string; createdAt: number; entries: BundleEntry[] }

class ChangeSetBundleStore {
  readonly filePath: string;
  private readonly failCreate: boolean;
  constructor(userDataPath: string, failCreate = false) { this.failCreate = failCreate; this.filePath = join(userDataPath, "observer-checkpoints", "change-set-bundles.json"); }
  private async read(): Promise<CheckpointBundle[]> { try { const value = JSON.parse(await readFile(this.filePath, "utf8")); return Array.isArray(value) ? value.filter((bundle) => bundle && typeof bundle.workspaceId === "string" && HASH.test(bundle.workspaceId) && typeof bundle.changeSetId === "string" && Array.isArray(bundle.entries) && Number.isFinite(bundle.createdAt)) : []; } catch { return []; } }
  private async write(value: CheckpointBundle[]) { await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 }); const temporary = `${this.filePath}.tmp`; await writeFile(temporary, JSON.stringify(value), { encoding: "utf8", mode: 0o600 }); await rename(temporary, this.filePath); }
  async create(bundle: CheckpointBundle, retention: number) { if (this.failCreate) throw new Error("Checkpoint bundle creation failed."); const values = [bundle, ...(await this.read()).filter((item) => item.changeSetId !== bundle.changeSetId)].sort((a, b) => b.createdAt - a.createdAt).slice(0, retention); await this.write(values); }
  async latest(workspaceId: string) { return (await this.read()).find((bundle) => bundle.workspaceId === workspaceId) ?? null; }
  async remove(changeSetId: string) { await this.write((await this.read()).filter((bundle) => bundle.changeSetId !== changeSetId)); }
}

interface ResolvedTarget { relativePath: string; path: string; mode?: number }
interface MultiFileServiceOptions { failAfterWrites?: number; failCheckpoint?: boolean }

export class MultiFileChangeService {
  private readonly store: ChangeSetBundleStore;
  private readonly options: MultiFileServiceOptions;
  constructor(userDataPath: string, options: MultiFileServiceOptions = {}) { this.options = options; this.store = new ChangeSetBundleStore(userDataPath, options.failCheckpoint); }

  private async target(rootPath: string, relativePath: string, operation: "update" | "create"): Promise<ResolvedTarget> {
    const normalized = normalizeWorkspaceRelativePath(relativePath); const name = normalized.segments.at(-1) ?? "";
    if (!normalized.relativePath || !isSupportedWorkspaceTextFile(name) || isMandatorySecretFile(normalized.relativePath) || normalized.segments.some((segment) => segment === ".git")) throw new Error(`Unsafe or unsupported path: ${relativePath}`);
    const root = await realpath(rootPath); const lexical = resolve(root, ...normalized.segments); if (!within(root, lexical)) throw new Error(`Path escapes the workspace: ${relativePath}`);
    const parent = await realpath(dirname(lexical)); if (!within(root, parent) || !(await stat(parent)).isDirectory()) throw new Error(`Parent folder is unavailable: ${relativePath}`);
    if (operation === "create") { try { await lstat(lexical); throw new Error(`New-file collision: ${relativePath}`); } catch (error) { if (!isNodeError(error, "ENOENT")) throw error; } return { relativePath: normalized.relativePath, path: lexical }; }
    const lexicalStats = await lstat(lexical); if (lexicalStats.isSymbolicLink() || !lexicalStats.isFile()) throw new Error(`Symbolic links and non-files cannot be changed: ${relativePath}`);
    const canonical = await realpath(lexical); if (!within(root, canonical)) throw new Error(`Path escapes the workspace: ${relativePath}`);
    return { relativePath: normalized.relativePath, path: canonical, mode: lexicalStats.mode & 0o777 };
  }

  async prepare(rootPath: string, rawPlan: MultiFilePlan, limits: MultiFileLimits): Promise<MultiFileBase[]> {
    const plan = parseMultiFilePlan(rawPlan, limits); if (!plan) throw new Error("The multi-file plan is invalid or exceeds the configured file limit.");
    const bases: MultiFileBase[] = []; let total = 0;
    for (const file of plan.files) {
      await this.target(rootPath, file.relativePath, file.operation);
      if (file.operation === "create") { bases.push({ operation: "create", relativePath: file.relativePath, expectedAbsent: true }); continue; }
      const opened = await readWorkspaceTextFile(rootPath, file.relativePath); if (redactProjectSecrets(opened.content).redacted) throw new Error(`Potential secret material blocks multi-file context: ${file.relativePath}`);
      total += Buffer.byteLength(opened.content, "utf8"); if (total > limits.maximumGeneratedBytes) throw new Error("Approved existing-file context exceeds the configured total size limit.");
      bases.push({ operation: "update", relativePath: file.relativePath, originalContentHash: hash(opened.content), originalContent: opened.content });
    }
    return bases;
  }

  private async stage(target: ResolvedTarget, content: string, mode = 0o600) {
    const path = join(dirname(target.path), `.${basename(target.path)}.proactive-${randomUUID()}.tmp`); const handle = await open(path, "wx", mode);
    try { await handle.writeFile(content, "utf8"); await handle.sync(); } finally { await handle.close(); }
    await chmod(path, mode); return path;
  }

  private async atomicWrite(target: ResolvedTarget, content: string, mode = 0o600) { const staged = await this.stage(target, content, mode); await rename(staged, target.path); }

  async apply(rootPath: string, request: MultiFileApplyRequest): Promise<{ files: AppliedFileSnapshot[]; addedLines: number; deletedLines: number }> {
    const plan = parseMultiFilePlan(request.plan, request.limits); if (!plan) throw new Error("The approved plan is invalid.");
    const dirty = new Set(request.dirtyPaths); const conflict = request.changeSet.changes.find((change) => dirty.has(change.relativePath)); if (conflict) throw new Error(`Save or discard unsaved changes before applying: ${conflict.relativePath}`);
    const bases = await this.prepare(rootPath, plan, request.limits); const changeSet = validateMultiFileChangeSet(request.changeSet, plan, bases, request.limits); if (!changeSet) throw new Error("The change set is stale, inconsistent, or exceeds configured limits.");
    const targets = new Map<string, ResolvedTarget>(); for (const change of changeSet.changes) targets.set(change.relativePath, await this.target(rootPath, change.relativePath, change.operation));
    const entries: BundleEntry[] = changeSet.changes.map((change) => change.operation === "update" ? { operation: "update", relativePath: change.relativePath, originalContent: change.originalContent, originalHash: change.originalContentHash, appliedContent: change.proposedContent, appliedHash: hash(change.proposedContent), mode: targets.get(change.relativePath)?.mode ?? 0o600 } : { operation: "create", relativePath: change.relativePath, appliedContent: change.proposedContent, appliedHash: hash(change.proposedContent) });
    await this.store.create({ workspaceId: request.workspaceId, changeSetId: changeSet.changeSetId, createdAt: Date.now(), entries }, request.checkpointRetentionLimit);
    const staged = new Map<string, string>();
    try {
      for (const change of changeSet.changes) staged.set(change.relativePath, await this.stage(targets.get(change.relativePath)!, change.proposedContent, targets.get(change.relativePath)?.mode ?? 0o600));
      const finalBases = await this.prepare(rootPath, plan, request.limits); if (JSON.stringify(finalBases) !== JSON.stringify(bases)) throw new Error("An affected file changed during preflight.");
    } catch (error) { await Promise.all(Array.from(staged.values()).map((path) => rm(path, { force: true }))); await this.store.remove(changeSet.changeSetId); throw error; }
    const committed: MultiFileChange[] = [];
    try {
      for (const change of changeSet.changes) {
        if (this.options.failAfterWrites !== undefined && committed.length >= this.options.failAfterWrites) throw new Error("Simulated mid-apply failure.");
        await rename(staged.get(change.relativePath)!, targets.get(change.relativePath)!.path); committed.push(change);
      }
    } catch (error) {
      await Promise.all(Array.from(staged.entries()).filter(([path]) => !committed.some((item) => item.relativePath === path)).map(([, path]) => rm(path, { force: true })));
      const rollbackErrors: string[] = [];
      for (const change of [...committed].reverse()) { try { const target = targets.get(change.relativePath)!; if (change.operation === "update") await this.atomicWrite(target, change.originalContent, target.mode); else if (hash(await readFile(target.path, "utf8")) === hash(change.proposedContent)) await unlink(target.path); } catch { rollbackErrors.push(change.relativePath); } }
      await this.store.remove(changeSet.changeSetId).catch(() => undefined);
      throw new Error(rollbackErrors.length ? `Apply failed and rollback was incomplete for: ${rollbackErrors.join(", ")}` : `Apply failed; all committed files were restored. ${(error as Error).message}`);
    }
    let addedLines = 0; let deletedLines = 0; const files: AppliedFileSnapshot[] = [];
    for (const change of changeSet.changes) { const stats = change.operation === "update" ? lineDiffStats(change.originalContent, change.proposedContent) : { added: change.proposedContent.split("\n").length, deleted: 0 }; addedLines += stats.added; deletedLines += stats.deleted; files.push({ relativePath: change.relativePath, content: change.proposedContent, modifiedAtMs: (await stat(targets.get(change.relativePath)!.path)).mtimeMs, created: change.operation === "create" }); }
    return { files, addedLines, deletedLines };
  }

  async undo(rootPath: string, workspaceId: string, dirtyPaths: string[] = []): Promise<MultiFileUndoResult> {
    const bundle = await this.store.latest(workspaceId); if (!bundle) throw new Error("No multi-file Observer checkpoint is available.");
    const dirty = new Set(dirtyPaths);
    const dirtyEntry = bundle.entries.find((entry) => dirty.has(entry.relativePath));
    if (dirtyEntry) throw new Error(`Save or discard unsaved changes before rollback: ${dirtyEntry.relativePath}`);
    const targets = new Map<string, ResolvedTarget>();
    for (const entry of bundle.entries) { const target = await this.target(rootPath, entry.relativePath, "update"); const content = await readFile(target.path, "utf8"); if (hash(content) !== entry.appliedHash) throw new Error(`Rollback conflict: ${entry.relativePath} changed after the Observer change set.`); targets.set(entry.relativePath, target); }
    const staged = new Map<string, string>(); for (const entry of bundle.entries) if (entry.operation === "update") staged.set(entry.relativePath, await this.stage(targets.get(entry.relativePath)!, entry.originalContent, entry.mode));
    const completed: BundleEntry[] = [];
    try {
      for (const entry of bundle.entries) { if (entry.operation === "update") await rename(staged.get(entry.relativePath)!, targets.get(entry.relativePath)!.path); else await unlink(targets.get(entry.relativePath)!.path); completed.push(entry); }
    } catch (error) {
      for (const entry of [...completed].reverse()) { const target = targets.get(entry.relativePath)!; try { await this.atomicWrite(target, entry.appliedContent, entry.operation === "update" ? entry.mode : 0o600); } catch { /* preserve the original failure */ } }
      throw new Error(`Rollback failed and was reverted where possible: ${(error as Error).message}`);
    }
    await this.store.remove(bundle.changeSetId);
    const restoredFiles: AppliedFileSnapshot[] = []; const removedPaths: string[] = [];
    for (const entry of bundle.entries) { if (entry.operation === "create") removedPaths.push(entry.relativePath); else restoredFiles.push({ relativePath: entry.relativePath, content: entry.originalContent, modifiedAtMs: (await stat(targets.get(entry.relativePath)!.path)).mtimeMs, created: false }); }
    return { restoredFiles, removedPaths, changeSetId: bundle.changeSetId };
  }
}
