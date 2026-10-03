import { createHash } from 'node:crypto';
import { constants, existsSync } from 'node:fs';
import { chmod, lstat, mkdir, open, opendir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { DEFAULT_MEMORY_SETTINGS, type MemorySettings, type MemoryStatus, type ScanReport,
  type MemoryExclusion, type PurgeScope } from '../../shared/observer-engine.ts';
import { redactContextSecrets } from '../../shared/context-tray.ts';
import { isExcludedFromAiContext, isMandatorySecretFile } from '../../shared/settings.ts';
import { monacoLanguageForFile } from '../../shared/languages.ts';
import { memoryChunks, memorySymbols } from '../../shared/memory-index.ts';
import { prepareWorkspaceRoot, resolveWorkspacePath, normalizeWorkspaceRelativePath } from '../workspace-files.ts';
import { shouldIgnoreWorkspaceWatchPath } from '../workspace-watcher.ts';
import { recentProjectId } from '../recent-projects.ts';
import { openMemoryDatabase, type MemoryDatabase } from './database.ts';
import { JournalStore } from './journal-store.ts';
import { safeDiskText } from './safe-disk-text.ts';
import { retrieveChunks, retrieveWeb } from './retrieval.ts';
import type { ChunkHit, WebHit } from '../../shared/engine-context.ts';
import type { WorkspaceChange } from '../../shared/workspace';
import type { EditBatch, JournalRow } from '../../shared/observer-engine.ts';
import { editBursts } from '../../shared/edit-bursts.ts';
import type { EditBurst } from '../../shared/engine-context.ts';
import { storeSuggestion, storeOutcome, readFeedback } from './feedback-store.ts';
import type { MemorySuggestion, SuggestionOutcome } from '../../shared/feedback-memory.ts';
import { assembleContext } from './context-assembler.ts';
import type { ContextSeed } from '../../shared/engine-context.ts';
import { isGitIgnored } from '../project-context.ts';

const GENERATED = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage', 'vendor', '__pycache__', '.venv']);
const LOCKFILES = /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|composer\.lock|Gemfile\.lock|.*\.lock)$/i;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const within = (root: string, path: string) => {
  const part = relative(root, path);
  return part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`));
};
interface FileRow { path: string; mtime_ms: number; size_bytes: number; content_hash: string | null;
  baseline_ver: number; excluded: number; deleted: number }

function settingsSnapshot(input: Partial<MemorySettings>): MemorySettings {
  const settings = { ...DEFAULT_MEMORY_SETTINGS, ...input };
  const ranges: [keyof MemorySettings, number, number][] = [
    ['journalRetentionDays', 1, 365], ['maxFileBytes', 64 * 1024, 2 * 1024 * 1024],
    ['maxFiles', 100, 20000], ['webTtlHours', 1, 720], ['maxWebCaptures', 20, 1000],
    ['maxDatabaseBytes', 1024 * 1024, 1024 * 1024 * 1024],
  ];
  for (const [key, min, max] of ranges) {
    const value = settings[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error('invalid_memory_settings');
  }
  if (typeof settings.memoryEnabled !== 'boolean' || !Array.isArray(settings.exclusions) ||
    settings.exclusions.length > 1000 || settings.exclusions.some(rule => typeof rule !== 'string' || rule.length > 4096)) {
    throw new Error('invalid_memory_settings');
  }
  return { ...settings, exclusions: [...settings.exclusions] };
}

/** Main-process service only. Caller supplies app.getPath('userData') and explicit consent.
 */
export class ProjectMemoryService {
  private journal: JournalStore | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private dailyTimer: ReturnType<typeof setInterval> | undefined;
  private stopMaintenance() { clearTimeout(this.idleTimer); clearInterval(this.dailyTimer); this.idleTimer = undefined; this.dailyTimer = undefined; }
  private scheduleMaintenance() {
    if (!this.active(this.generation)) { this.stopMaintenance(); return; }
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.maintain(), 30000); this.idleTimer.unref();
    if (!this.dailyTimer) { this.dailyTimer = setInterval(() => this.maintain(), 24 * 60 * 60 * 1000); this.dailyTimer.unref(); }
  }
  /** Called on idle, daily, and close. No provider calls or editor activity telemetry. */
  maintain() {
    if (!this.memory) return;
    const db = this.memory.db;
    try {
      db.transaction(() => {
        for (const row of db.prepare('SELECT path FROM files WHERE excluded=0 AND deleted=0').all() as { path: string }[]) this.journal!.compact(row.path);
      })();
      this.journal!.retain(this.timestamp() - this.settings.journalRetentionDays * 86400000);
      db.prepare('DELETE FROM web_captures WHERE expires_at<=?').run(this.timestamp());
      db.prepare('DELETE FROM suggestions WHERE ts<?').run(this.timestamp() - 90 * 86400000);
      db.prepare('DELETE FROM governance_events WHERE ts<?').run(this.timestamp() - this.settings.journalRetentionDays * 86400000);
      this.scrub();
      db.exec('VACUUM');
      while (this.status().overSizeCap && this.journal!.evictOldest()) { this.scrub(); db.exec('VACUUM'); }
      if (this.status().overSizeCap) this.warn('memory_size_cap');
    } catch { this.warn('memory_maintenance_unavailable'); }
    this.emit();
  }
  compact() { this.maintain(); }
  async onExternalChange(change: WorkspaceChange) { await this.scan({ changedPaths: [change.relativePath] }); }
  private memory: MemoryDatabase | null = null;
  private root = '';
  private workspaceId: string | null = null;
  private file = '';
  private paused = false;
  private scanning: Promise<ScanReport> | null = null;
  private generation = 0;
  private lastScanAt: number | null = null;
  private settings: MemorySettings;
  private lifecycle = false;
  private now: () => number;
  private onStatus: (status: MemoryStatus) => void;
  private warn: (category: string) => void;
  private userDataPath: string;

  constructor(userDataPath: string, options: {
    settings?: Partial<MemorySettings>; now?: () => number;
    onStatus?: (status: MemoryStatus) => void; warn?: (category: string) => void;
  } = {}) {
    this.userDataPath = userDataPath;
    this.settings = settingsSnapshot(options.settings ?? {});
    this.now = options.now ?? Date.now;
    this.onStatus = options.onStatus ?? (() => {});
    this.warn = options.warn ?? (() => {});
  }

  private timestamp() { return Math.floor(this.now() / 1000) * 1000; }
  private emit() { this.onStatus(this.status()); }
  private active(epoch: number) { return this.generation === epoch && !!this.memory && !this.paused && this.settings.memoryEnabled; }

  async open(root: string, kind: 'new' | 'existing'): Promise<MemoryStatus> {
    if (this.lifecycle) throw new Error('memory_lifecycle_busy');
    if (kind !== 'new' && kind !== 'existing') throw new Error('invalid_workspace_kind');
    this.lifecycle = true;
    try {
      await this.close();
      const prepared = await prepareWorkspaceRoot(root);
      // Validate both lexical and canonical paths before creating any DB directory.
      const userData = resolve(this.userDataPath);
      if (within(prepared.rootPath, userData)) throw new Error('memory_storage_inside_workspace');
      await mkdir(userData, { recursive: true, mode: 0o700 });
      const canonicalData = await realpath(userData);
      if (within(prepared.rootPath, canonicalData)) throw new Error('memory_storage_inside_workspace');
      const directory = join(canonicalData, 'project-memory');
      if (within(prepared.rootPath, directory)) throw new Error('memory_storage_inside_workspace');
      await mkdir(directory, { mode: 0o700 }).catch(error => {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      });
      if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== directory) throw new Error('unsafe_memory_directory');
      this.workspaceId = recentProjectId(prepared.rootPath);
      const file = join(directory, `${this.workspaceId}.db`);
      for (const target of [file, `${file}-wal`, `${file}-shm`]) {
        try { const info = await lstat(target); if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1) throw new Error('unsafe_memory_file'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      const handle = await open(file, constants.O_CREAT | constants.O_RDWR | (constants.O_NOFOLLOW ?? 0), 0o600);
      await handle.close();
      await chmod(directory, 0o700).catch(() => {});
      await chmod(file, 0o600).catch(() => {});
      this.memory = openMemoryDatabase(file, this.warn);
      this.journal = new JournalStore(this.memory.db, () => this.timestamp());
      this.root = prepared.rootPath; this.file = file;
      const db = this.memory.db;
      db.transaction(() => {
        const insert = db.prepare('INSERT OR IGNORE INTO meta(key,value) VALUES(?,?)');
        for (const [key, value] of Object.entries({ schema_version: '1', workspace_id: this.workspaceId!,
          created_at: String(this.timestamp()), kind, memory_paused: '0' })) insert.run(key, value);
      })();
      this.paused = (db.prepare("SELECT value FROM meta WHERE key='memory_paused'").get() as { value: string }).value === '1';
      this.lastScanAt = Number((db.prepare("SELECT value FROM meta WHERE key='last_scan_at'").get() as { value: string } | undefined)?.value) || null;
      await this.scan();
      if (this.active(this.generation)) this.maintain();
      this.scheduleMaintenance();
      return this.status();
    } catch (error) { await this.close(); throw error; }
    finally { this.lifecycle = false; }
  }

  async close(): Promise<void> {
    this.stopMaintenance();
    this.generation++;
    await this.scanning;
    this.maintain();
    if (this.memory) { this.memory.db.pragma('wal_checkpoint(TRUNCATE)'); this.memory.db.close(); }
    this.journal = null;
    this.memory = null; this.root = ''; this.file = ''; this.workspaceId = null; this.lastScanAt = null;
    this.emit();
  }

  configure(input: Partial<MemorySettings>) {
    this.settings = settingsSnapshot({ ...this.settings, ...input });
    this.generation++;
    if (this.memory) {
      // New exclusions must invalidate previously captured content immediately.
      const rows = this.memory.db.prepare('SELECT * FROM files').all() as FileRow[];
      this.memory.db.transaction(() => {
        for (const row of rows) { const reason = this.exclusion(row.path); if (reason) this.exclude(row.path, row.size_bytes, row.mtime_ms, reason); }
      })();
      this.scrub();
    }
    this.emit();
    this.scheduleMaintenance();
  }

  setPaused(paused: boolean) {
    if (typeof paused !== 'boolean') throw new Error('invalid_memory_pause');
    this.paused = paused; this.generation++;
    this.memory?.db.prepare("INSERT OR REPLACE INTO meta(key,value) VALUES('memory_paused',?)").run(paused ? '1' : '0');
    this.emit();
    this.scheduleMaintenance();
  }

  private exclusion(path: string): MemoryExclusion | null {
    if (isMandatorySecretFile(path)) return 'secret_file';
    if (isExcludedFromAiContext(path, this.settings.exclusions)) return 'user_rule';
    if (path.split('/').some(part => GENERATED.has(part.toLowerCase())) || LOCKFILES.test(path) ||
      shouldIgnoreWorkspaceWatchPath(this.root, join(this.root, path))) return 'generated';
    return null;
  }

  private removeContent(path: string, journal = true) {
    this.journal?.clear(path);
    const db = this.memory!.db;
    for (const table of ['baselines', 'chunks', 'symbols', ...(journal ? ['edit_journal'] : [])]) db.prepare(`DELETE FROM ${table} WHERE path=?`).run(path);
  }

  private indexContent(path: string, text: string) {
    const db = this.memory!.db;
    db.prepare('DELETE FROM chunks WHERE path=?').run(path);
    db.prepare('DELETE FROM symbols WHERE path=?').run(path);
    const insertChunk = db.prepare('INSERT INTO chunks(path,chunk_idx,line_start,line_end,text,hash) VALUES(?,?,?,?,?,?)');
    for (const chunk of memoryChunks(text)) insertChunk.run(path, chunk.index, chunk.lineStart, chunk.lineEnd, chunk.text, hash(chunk.text));
    const insertSymbol = db.prepare('INSERT INTO symbols(path,name,kind,line_start,line_end) VALUES(?,?,?,?,?)');
    for (const symbol of memorySymbols(text, monacoLanguageForFile(path))) insertSymbol.run(path, symbol.name, symbol.kind, symbol.lineStart, symbol.lineEnd);
  }

  private exclude(path: string, size: number, mtime: number, reason: MemoryExclusion) {
    this.memory!.db.transaction(() => {
    if (reason === 'secret_flagged' && !this.memory!.db.prepare('SELECT 1 FROM files WHERE path=? AND secret_flagged=1').get(path)) {
      this.memory!.db.prepare("INSERT INTO governance_events(ts,layer,path,detail) VALUES(?,'privacy_block',?,'secret_flagged')").run(this.timestamp(), path);
    }
    this.removeContent(path);
    this.memory!.db.prepare(`INSERT INTO files(path,language,size_bytes,mtime_ms,excluded,secret_flagged,exclusion,first_seen_at,updated_at)
      VALUES(?,?,?,?,1,?,?,?,?) ON CONFLICT(path) DO UPDATE SET size_bytes=excluded.size_bytes,mtime_ms=excluded.mtime_ms,
      content_hash=NULL,baseline_ver=0,excluded=1,secret_flagged=excluded.secret_flagged,exclusion=excluded.exclusion,deleted=0,updated_at=excluded.updated_at`)
      .run(path, monacoLanguageForFile(path), size, mtime, reason === 'secret_flagged' ? 1 : 0, reason, this.timestamp(), this.timestamp());
    })();
  }

  private scrub() {
    if (!this.memory) return;
    if (this.memory.searchMode === 'fts5') this.memory.db.exec("INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild'); INSERT INTO web_fts(web_fts) VALUES('rebuild');");
    this.memory.db.pragma('wal_checkpoint(TRUNCATE)');
  }

  scan(options: { full?: boolean; changedPaths?: readonly string[] } = {}): Promise<ScanReport> {
    if (this.scanning) return this.scanning;
    const epoch = this.generation;
    this.scanning = Promise.resolve().then(() => this.performScan(epoch, options.full === true, options.changedPaths ?? [])).finally(() => {
      this.scanning = null; this.emit();
    });
    return this.scanning;
  }

  private async performScan(epoch: number, full: boolean, changedPaths: readonly string[]): Promise<ScanReport> {
    const report: ScanReport = { scanned: 0, updated: 0, unchanged: 0, excluded: 0, deleted: 0, errors: 0, capped: false, cancelled: false };
    if (!this.active(epoch)) return { ...report, cancelled: true };
    const db = this.memory!.db;
    const seen = new Set<string>();
    let indexed = 0, visited = 0;
    const visit = async (directory: string): Promise<void> => {
      const stream = await opendir(directory);
      for await (const entry of stream) {
        if (!this.active(epoch)) break;
        if (++visited % 50 === 0) { this.emit(); await new Promise<void>(done => setImmediate(done)); }
        if (!this.active(epoch)) break;
        const absolute = join(directory, entry.name);
        const path = relative(this.root, absolute).replaceAll('\\', '/');
        seen.add(path);
        try {
          const info = await lstat(absolute);
          if (!this.active(epoch)) break;
          const excluded = this.exclusion(path);
          if (excluded || info.isSymbolicLink() || (info.isFile() && info.nlink > 1) || (!info.isFile() && !info.isDirectory())) {
            db.transaction(() => this.exclude(path, info.size, info.mtimeMs, excluded ?? 'unsafe_path'))(); report.excluded++; continue;
          }
          const safe = await resolveWorkspacePath(this.root, path);
          if (!this.active(epoch)) break;
          if (info.isDirectory()) { await visit(safe.realPath); continue; }
          report.scanned++;
          if (info.size > this.settings.maxFileBytes || indexed >= this.settings.maxFiles) {
            const reason = info.size > this.settings.maxFileBytes ? 'too_large' : 'file_limit';
            if (reason === 'file_limit') report.capped = true;
            db.transaction(() => this.exclude(path, info.size, info.mtimeMs, reason))(); report.excluded++; continue;
          }
          const old = db.prepare('SELECT * FROM files WHERE path=?').get(path) as FileRow | undefined;
          const needsIndex = info.size > 0 && !db.prepare('SELECT 1 FROM chunks WHERE path=? LIMIT 1').get(path);
          const changed = changedPaths.includes(path);
          if (!full && !changed && !needsIndex && old && !old.excluded && !old.deleted && old.size_bytes === info.size && old.mtime_ms === info.mtimeMs) {
            indexed++; report.unchanged++; continue;
          }
          const handle = await open(safe.realPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
          let bytes: Buffer;
          try {
            const before = await handle.stat();
            if (!before.isFile() || before.nlink > 1 || before.ino !== info.ino || before.dev !== info.dev || before.size > this.settings.maxFileBytes) throw new Error('memory_file_changed');
            // Bounded read protects against a file growing after stat.
            const buffer = Buffer.alloc(this.settings.maxFileBytes + 1);
            let count = 0;
            while (count < buffer.length) { const read = await handle.read(buffer, count, buffer.length - count, count); if (!read.bytesRead) break; count += read.bytesRead; }
            const after = await handle.stat();
            if (count > this.settings.maxFileBytes || before.mtimeMs !== after.mtimeMs || before.size !== after.size || count !== after.size) throw new Error('memory_file_changed');
            const recheck = await resolveWorkspacePath(this.root, path);
            if (recheck.realPath !== safe.realPath || (await lstat(absolute)).isSymbolicLink()) throw new Error('memory_file_changed');
            bytes = buffer.subarray(0, count);
          } finally { await handle.close(); }
          if (!this.active(epoch)) break;
          let text = '', reason: MemoryExclusion | null = null;
          if (bytes.subarray(0, 8192).includes(0)) reason = 'binary';
          else { try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { reason = 'binary'; } }
          if (!reason && redactContextSecrets(text).redacted) reason = 'secret_flagged';
          if (reason) { db.transaction(() => this.exclude(path, info.size, info.mtimeMs, reason!))(); report.excluded++; continue; }
          const contentHash = hash(text);
          db.transaction(() => {
            if (old?.content_hash === contentHash && !old.excluded && !old.deleted) {
              this.indexContent(path, text);
              db.prepare('UPDATE files SET mtime_ms=?,size_bytes=?,updated_at=? WHERE path=?').run(info.mtimeMs, info.size, this.timestamp(), path);
              report.unchanged++; return;
            }
            if (old && !old.excluded && !old.deleted) {
              try { this.journal!.external(path, text, this.settings.maxFileBytes); }
              catch { this.warn('memory_external_drift'); }
            } else this.removeContent(path);
            this.journal!.clear(path);
            const version = (old?.baseline_ver ?? 0) + 1;
            db.prepare(`INSERT INTO files(path,language,size_bytes,content_hash,mtime_ms,baseline_ver,first_seen_at,updated_at)
              VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET language=excluded.language,size_bytes=excluded.size_bytes,
              content_hash=excluded.content_hash,mtime_ms=excluded.mtime_ms,baseline_ver=excluded.baseline_ver,
              excluded=0,secret_flagged=0,exclusion=NULL,deleted=0,updated_at=excluded.updated_at`)
              .run(path, monacoLanguageForFile(path), info.size, contentHash, info.mtimeMs, version, this.timestamp(), this.timestamp());
            db.prepare('INSERT INTO baselines VALUES(?,?,?,?,?)').run(path, version, deflateSync(text), contentHash, this.timestamp());
            this.indexContent(path, text);
            report.updated++;
          })();
          indexed++;
        } catch {
          if (!this.active(epoch)) break;
          report.errors++;
          db.transaction(() => this.exclude(path, 0, 0, 'unreadable'))();
          this.warn('memory_scan_entry_unavailable');
        }
      }
    };
    this.emit();
    try {
      await visit(this.root);
      if (this.active(epoch)) {
        for (const row of db.prepare('SELECT * FROM files WHERE deleted=0').all() as FileRow[]) {
          if (!this.active(epoch)) break;
          const reason = this.exclusion(row.path);
          if (reason) { db.transaction(() => this.exclude(row.path, row.size_bytes, row.mtime_ms, reason))(); continue; }
          if (seen.has(row.path)) continue;
          try {
            await resolveWorkspacePath(this.root, row.path);
            if (!this.active(epoch)) break;
            // An unvisited descendant may now sit behind a symlink or unreadable
            // directory. Never retain old context merely because it still resolves.
            db.transaction(() => this.exclude(row.path, row.size_bytes, row.mtime_ms, 'unsafe_path'))();
          }
          catch {
            if (!this.active(epoch)) break;
            db.transaction(() => {
              this.removeContent(row.path, false);
              db.prepare('UPDATE files SET deleted=1,content_hash=NULL,updated_at=? WHERE path=?').run(this.timestamp(), row.path);
            })(); report.deleted++;
          }
        }
      }
      if (this.active(epoch)) {
        this.lastScanAt = this.timestamp();
        db.prepare("INSERT OR REPLACE INTO meta VALUES('last_scan_at',?)").run(String(this.lastScanAt));
      }
    } catch { report.errors++; this.warn('memory_scan_unavailable'); }
    report.cancelled = !this.active(epoch);
    this.scrub();
    const size = (await stat(this.file)).size;
    if (size >= this.settings.maxDatabaseBytes) this.warn('memory_size_cap');
    return report;
  }

  purge(scope: PurgeScope) {
    if (!this.memory) return;
    this.generation++; // prevents an in-flight scan repopulating purged content
    const db = this.memory.db;
    this.journal?.clear();
    const path = typeof scope === 'object' && scope !== null ? normalizeWorkspaceRelativePath(scope.path).relativePath : null;
    if (!path && !['all', 'web', 'journal'].includes(scope as string)) throw new Error('invalid_memory_purge');
    db.transaction(() => {
      if (path) { this.removeContent(path); db.prepare('DELETE FROM files WHERE path=?').run(path); }
      else if (scope === 'web') db.exec('DELETE FROM web_captures');
      else if (scope === 'journal') {
        for (const row of db.prepare('SELECT path FROM files WHERE excluded=0 AND deleted=0').all() as { path: string }[]) {
          try { this.journal!.compact(row.path, true); }
          catch {
            this.warn('memory_purge_drift');
            try { this.indexContent(row.path, this.journal!.recoverBaseline(row.path)); }
            catch { this.exclude(row.path, 0, 0, 'unreadable'); }
          }
        }
        db.exec('DELETE FROM edit_journal'); this.journal!.pruneBaselines();
      }
      else {
        for (const table of ['baselines', 'edit_journal', 'symbols', 'chunks', 'web_captures', 'suggestions', 'governance_events', 'project_brief', 'files']) db.exec(`DELETE FROM ${table}`);
        db.prepare("DELETE FROM meta WHERE key='last_scan_at'").run(); this.lastScanAt = null;
      }
    })();
    this.scrub();
    db.exec('VACUUM');
    this.scrub(); this.emit();
  }

  private async diskText(path: string): Promise<{ text: string; size: number; mtime: number }> {
    let part = this.root;
    for (const segment of normalizeWorkspaceRelativePath(path).segments) { part = join(part, segment); if ((await lstat(part)).isSymbolicLink()) throw new Error('memory_unsafe_path'); }
    const safe = await resolveWorkspacePath(this.root, path);
    const handle = await open(safe.realPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.nlink > 1 || before.size > this.settings.maxFileBytes) throw new Error('memory_unsafe_file');
      const bytes = Buffer.alloc(this.settings.maxFileBytes + 1);
      let count = 0;
      while (count < bytes.length) { const read = await handle.read(bytes, count, bytes.length - count, count); if (!read.bytesRead) break; count += read.bytesRead; }
      const after = await handle.stat();
      const check = await resolveWorkspacePath(this.root, path);
      const info = await lstat(join(this.root, path));
      if (check.realPath !== safe.realPath || info.isSymbolicLink() || info.ino !== before.ino || info.dev !== before.dev ||
        before.size !== after.size || before.mtimeMs !== after.mtimeMs || count !== after.size || count > this.settings.maxFileBytes) throw new Error('memory_file_changed');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count));
      if (text.includes('\0') || redactContextSecrets(text).redacted) throw new Error('memory_secret');
      return { text, size: count, mtime: after.mtimeMs };
    } finally { await handle.close(); }
  }

  async beginBuffer(path: string, text: string): Promise<boolean> {
    const epoch = this.generation;
    path = normalizeWorkspaceRelativePath(path).relativePath;
    if (!this.active(epoch) || this.exclusion(path)) return false;
    const row = this.memory!.db.prepare('SELECT * FROM files WHERE path=?').get(path) as FileRow | undefined;
    if (row?.excluded) return false;
    try {
      const disk = await this.diskText(path); // Validate the backing file before accepting an unsaved snapshot.
      if (!this.active(epoch)) return false;
      if (redactContextSecrets(text).redacted) throw new Error('memory_secret');
      if (Buffer.byteLength(text) > this.settings.maxFileBytes || text.includes('\0')) throw new Error('memory_content_limit');
      if (row?.content_hash !== hash(text)) this.memory!.db.transaction(() => {
        if (!row || row.deleted) {
          if (this.status().indexedFiles >= this.settings.maxFiles) throw new Error('memory_file_limit');
          this.memory!.db.prepare(`INSERT INTO files(path,language,size_bytes,mtime_ms,first_seen_at,updated_at)
            VALUES(?,?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET deleted=0,excluded=0`)
            .run(path, monacoLanguageForFile(path), disk.size, disk.mtime, this.timestamp(), this.timestamp());
        }
        this.journal!.baseline(path, text); this.indexContent(path, text);
      })();
      return true;
    } catch (error) {
      if (this.active(epoch)) { this.exclude(path, row?.size_bytes ?? 0, row?.mtime_ms ?? 0, (error as Error).message === 'memory_secret' ? 'secret_flagged' : 'unreadable'); this.scrub(); this.emit(); }
      return false;
    }
  }

  readCurrent(path: string): string | null {
    if (!this.memory || this.exclusion(path)) return null;
    try { return this.journal!.read(path); }
    catch {
      this.warn('memory_replay_drift');
      const epoch = this.generation;
      try {
        const text = safeDiskText(this.root, path, this.settings.maxFileBytes);
        if (!this.active(epoch)) return null;
        this.memory!.db.transaction(() => { this.journal!.baseline(path, text); this.indexContent(path, text); })();
        return text;
      } catch (error) { if (this.active(epoch)) { this.exclude(path, 0, 0, (error as Error).message === 'memory_secret' ? 'secret_flagged' : 'unreadable'); this.scrub(); } return null; }
    }
  }

  applyEditBatch(batch: EditBatch): { ok: true; skipped?: true; lastSeq?: number } {
    if (!this.active(this.generation) || this.exclusion(batch.path)) return { ok: true, skipped: true };
    if (!Array.isArray(batch.deltas) || !batch.deltas.length || batch.deltas.length > 20 ||
      !Number.isSafeInteger(batch.clientSeq) || batch.clientSeq < 1 || Buffer.byteLength(JSON.stringify(batch)) > 256 * 1024 ||
      normalizeWorkspaceRelativePath(batch.path).relativePath !== batch.path) throw new Error('invalid_memory_batch');
    let text: string | null;
    try { text = this.memory!.db.transaction(() => {
      const result = this.journal!.apply(batch, this.settings.maxFileBytes);
      if (result !== null) this.indexContent(batch.path, result);
      return result;
    })(); }
    catch (error) {
      if ((error as Error).message === 'memory_secret') {
        this.memory!.db.transaction(() => {
          this.exclude(batch.path, 0, 0, 'secret_flagged');
        })(); this.scrub(); this.emit();
        return { ok: true, skipped: true };
      }
      throw error;
    }
    if (text === null) return { ok: true, skipped: true };
    this.emit(); this.scheduleMaintenance();
    return { ok: true, lastSeq: (this.memory!.db.prepare('SELECT max(seq) n FROM edit_journal').get() as { n: number }).n };
  }

  async verifySave(path: string) {
    const epoch = this.generation;
    if (!this.active(epoch) || this.exclusion(path)) return;
    try {
      const disk = await this.diskText(path);
      if (!this.active(epoch)) return;
      const current = await this.readCurrent(path);
      if (!this.active(epoch) || current === null) return;
      if (hash(current) !== hash(disk.text)) {
        this.warn('memory_save_drift');
        this.memory!.db.transaction(() => { this.journal!.baseline(path, disk.text); this.indexContent(path, disk.text); })();
      }
      this.memory!.db.prepare('UPDATE files SET size_bytes=?,mtime_ms=? WHERE path=?').run(disk.size, disk.mtime, path);
    } catch (error) { if (this.active(epoch)) { this.exclude(path, 0, 0, (error as Error).message === 'memory_secret' ? 'secret_flagged' : 'unreadable'); this.scrub(); } }
    this.emit();
  }

  assemble(seed: ContextSeed) {
    if (seed.workspaceId!==this.workspaceId || !this.active(this.generation)) throw new Error('engine_context_denied');
    return assembleContext(seed,{
      workspaceId:this.workspaceId!, read:path=>this.contextFile(path), screen:(path,text)=>this.screenContext(path,text),
      outline:path=>{
        const current=this.contextFile(path).text; if (current===null) return '';
        const symbols=current===seed.content ? this.memory!.db.prepare('SELECT kind,name,line_start lineStart,line_end lineEnd FROM symbols WHERE path=? ORDER BY line_start,name').all(path) as {kind:string;name:string;lineStart:number;lineEnd:number}[] : memorySymbols(seed.content,monacoLanguageForFile(path));
        return symbols.map(symbol=>`${symbol.kind} ${symbol.name} lines ${symbol.lineStart}-${symbol.lineEnd}`).join('\n');
      },
      brief:()=>this.contextBrief(), chunks:(terms,excludePath)=>this.searchChunks(terms,{limit:20,excludePath}),
      web:terms=>this.searchWeb(terms,3), edits:path=>this.recentEdits(path,6), feedback:()=>this.feedback(),
    });
  }
  private contextBrief(): string | null {
    const path='.proactive/project.json';
    if (this.exclusion(path)) return null;
    const file=this.memory!.db.prepare('SELECT excluded,deleted FROM files WHERE path=?').get(path) as FileRow | undefined;
    if (file && (file.excluded || file.deleted)) return null;
    if (file && this.contextFile(path).text===null) return null;
    const stored=this.memory!.db.prepare('SELECT json FROM project_brief WHERE id=1').get() as {json:string} | undefined;
    const raw=stored?.json ?? this.contextFile(path).text;
    if (!raw || raw.length>20000 || redactContextSecrets(raw).redacted) return null;
    try {
      const value=JSON.parse(raw) as Record<string,unknown>;
      if (!value || typeof value!=='object' || Array.isArray(value)) return null;
      return JSON.stringify(Object.fromEntries(['goal','stack','milestones','currentPhase','current_phase','phase'].filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]])));
    } catch { return null; }
  }

  recordSuggestion(row: MemorySuggestion) {
    if (row.workspaceId!==this.workspaceId || !this.active(this.generation) || this.contextFile(row.path).text===null) throw new Error('memory_suggestion_denied');
    storeSuggestion(this.memory!.db,row,this.timestamp());
  }
  recordOutcome(workspaceId: string, id: string, outcome: SuggestionOutcome) {
    if (workspaceId!==this.workspaceId || !this.active(this.generation)) throw new Error('memory_outcome_denied');
    storeOutcome(this.memory!.db,id,outcome,this.timestamp());
  }
  feedback(): string {
    if (!this.active(this.generation)) return '';
    const checked = new Map<string,boolean>();
    return readFeedback(this.memory!.db,path=>{
      if (!checked.has(path)) checked.set(path,this.contextFile(path).text!==null);
      return checked.get(path)!;
    });
  }

  recentEdits(path: string, limit = 6): EditBurst[] {
    if (this.contextFile(path).text===null) return [];
    try {
      const rows = this.memory!.db.prepare('SELECT * FROM edit_journal WHERE path=? ORDER BY seq LIMIT 20001').all(path) as JournalRow[];
      if (rows.length>20000) { this.warn('memory_burst_limit'); return []; }
      const baselines = new Map<number,string>();
      for (const version of new Set(rows.map(row=>row.base_ver))) {
        const row = this.memory!.db.prepare('SELECT content,content_hash FROM baselines WHERE path=? AND version=?').get(path,version) as {content:Buffer;content_hash:string} | undefined;
        if (!row) return [];
        const text = inflateSync(row.content,{maxOutputLength:this.settings.maxFileBytes}).toString('utf8');
        if (hash(text)!==row.content_hash) throw new Error('memory_burst_hash');
        baselines.set(version,text);
      }
      return editBursts(path,baselines,rows,limit);
    } catch (error) {
      if ((error as Error).message==='memory_secret') { this.exclude(path,0,0,'secret_flagged'); this.scrub(); }
      this.warn('memory_burst_unavailable'); return [];
    }
  }

  contextFile(path: string): { text: string | null; reason?: 'excluded'|'secret'|'stale'|'none_found' } {
    if (!this.active(this.generation)) return { text: null, reason: 'excluded' };
    try { if (!path || normalizeWorkspaceRelativePath(path).relativePath !== path) return { text: null, reason: 'excluded' }; }
    catch { return { text: null, reason: 'excluded' }; }
    try {
      if (this.exclusion(path)) return { text: null, reason: 'excluded' };
      if (existsSync(join(this.root,'.gitignore'))) {
        try {
          const rules=safeDiskText(this.root,'.gitignore',100000).split(/\r?\n/).map(line=>line.trim()).filter(line=>line && !line.startsWith('#')).slice(0,1000);
          if (isGitIgnored(path,rules)) return {text:null,reason:'excluded'};
        } catch { return {text:null,reason:'stale'}; }
      }
      const row = this.memory!.db.prepare('SELECT * FROM files WHERE path=?').get(path) as FileRow | undefined;
      if (!row) return { text: null, reason: 'none_found' };
      if (row.excluded || row.deleted) return { text: null, reason: 'excluded' };
      safeDiskText(this.root,path,this.settings.maxFileBytes); // Catch replaced links and secrets before serving cached text.
      const text = this.readCurrent(path);
      if (text === null) return { text: null, reason: 'stale' };
      if (redactContextSecrets(text).redacted) throw new Error('memory_secret');
      return { text };
    } catch (error) {
      const secret = (error as Error).message === 'memory_secret';
      this.exclude(path,0,0,secret ? 'secret_flagged' : 'unreadable'); this.scrub();
      return { text: null, reason: secret ? 'secret' : 'stale' };
    }
  }
  screenContext(path: string, text: string): boolean {
    if (this.contextFile(path).text === null) return false;
    if (Buffer.byteLength(text)>this.settings.maxFileBytes || text.includes('\0')) return false;
    if (redactContextSecrets(text).redacted) { this.exclude(path,0,0,'secret_flagged'); this.scrub(); this.emit(); return false; }
    return true;
  }
  searchChunks(terms: string[], opts: { limit: number; excludePath?: string }): ChunkHit[] {
    if (!this.active(this.generation)) return [];
    const checked = new Map<string,string | null>();
    return retrieveChunks(this.memory!,terms,50,opts.excludePath).filter(hit=>{
      if (!checked.has(hit.path)) checked.set(hit.path,this.contextFile(hit.path).text);
      const text = checked.get(hit.path);
      return text != null && text.split('\n').slice(hit.lineStart-1,hit.lineEnd).join('\n').replaceAll('\r','')===hit.text.replaceAll('\r','');
    }).slice(0,Math.max(1,Math.min(50,opts.limit)));
  }
  searchWeb(terms: string[], limit: number): WebHit[] {
    return this.active(this.generation) ? retrieveWeb(this.memory!,terms,this.timestamp(),limit) : [];
  }
  /** E4 calls only after dispatch; local previews must not change usage counters. */
  markWebSent(ids: readonly string[]) {
    if (!this.active(this.generation)) return;
    this.memory!.db.transaction(()=>{ for (const id of new Set(ids.slice(0,3))) this.memory!.db.prepare('UPDATE web_captures SET use_count=use_count+1 WHERE id=? AND expires_at>?').run(id,this.timestamp()); })();
  }

  status(): MemoryStatus {
    const db = this.memory?.db;
    const count = (table: string, condition = '1') => db ? (db.prepare(`SELECT count(*) n FROM ${table} WHERE ${condition}`).get() as { n: number }).n : 0;
    const databaseBytes = db ? Number(db.pragma('page_count', { simple: true })) * Number(db.pragma('page_size', { simple: true })) : 0;
    return { workspaceId: this.workspaceId, open: !!db, paused: this.paused || !this.settings.memoryEnabled,
      scanning: !!this.scanning, files: count('files', 'deleted=0'), indexedFiles: count('files', 'deleted=0 AND excluded=0'),
      chunks: count('chunks'), symbols: count('symbols'),
      journalBytes: db ? (db.prepare('SELECT coalesce(sum(length(CAST(inserted AS BLOB)) + coalesce(length(CAST(removed_text AS BLOB)),0)),0) n FROM edit_journal').get() as { n: number }).n : 0,
      excludedFiles: count('files', 'deleted=0 AND excluded=1'), journalRows: count('edit_journal'), webCaptures: count('web_captures'),
      databaseBytes, overSizeCap: databaseBytes >= this.settings.maxDatabaseBytes, lastScanAt: this.lastScanAt,
      searchMode: this.memory?.searchMode ?? 'fallback' };
  }
}
