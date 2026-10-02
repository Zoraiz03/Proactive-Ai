import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, opendir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { deflateSync } from 'node:zlib';
import { DEFAULT_MEMORY_SETTINGS, type MemorySettings, type MemoryStatus, type ScanReport,
  type MemoryExclusion, type PurgeScope } from '../../shared/observer-engine.ts';
import { redactContextSecrets } from '../../shared/context-tray.ts';
import { isExcludedFromAiContext, isMandatorySecretFile } from '../../shared/settings.ts';
import { monacoLanguageForFile } from '../../shared/languages.ts';
import { prepareWorkspaceRoot, resolveWorkspacePath, normalizeWorkspaceRelativePath } from '../workspace-files.ts';
import { shouldIgnoreWorkspaceWatchPath } from '../workspace-watcher.ts';
import { recentProjectId } from '../recent-projects.ts';
import { openMemoryDatabase, type MemoryDatabase } from './database.ts';

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
 * TODO(spec §4.4): E1b adds chunks/symbols and IPC; E2 adds journals/watcher/retention.
 * This class is deliberately not connected to startup, renderer or a provider yet.
 */
export class ProjectMemoryService {
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
      return this.status();
    } catch (error) { await this.close(); throw error; }
    finally { this.lifecycle = false; }
  }

  async close(): Promise<void> {
    this.generation++;
    await this.scanning;
    if (this.memory) { this.memory.db.pragma('wal_checkpoint(TRUNCATE)'); this.memory.db.close(); }
    this.memory = null; this.root = ''; this.file = ''; this.workspaceId = null; this.lastScanAt = null;
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
  }

  setPaused(paused: boolean) {
    if (typeof paused !== 'boolean') throw new Error('invalid_memory_pause');
    this.paused = paused; this.generation++;
    this.memory?.db.prepare("INSERT OR REPLACE INTO meta(key,value) VALUES('memory_paused',?)").run(paused ? '1' : '0');
    this.emit();
  }

  private exclusion(path: string): MemoryExclusion | null {
    if (isMandatorySecretFile(path)) return 'secret_file';
    if (isExcludedFromAiContext(path, this.settings.exclusions)) return 'user_rule';
    if (path.split('/').some(part => GENERATED.has(part.toLowerCase())) || LOCKFILES.test(path) ||
      shouldIgnoreWorkspaceWatchPath(this.root, join(this.root, path))) return 'generated';
    return null;
  }

  private removeContent(path: string, journal = true) {
    const db = this.memory!.db;
    for (const table of ['baselines', 'chunks', 'symbols', ...(journal ? ['edit_journal'] : [])]) db.prepare(`DELETE FROM ${table} WHERE path=?`).run(path);
  }

  private exclude(path: string, size: number, mtime: number, reason: MemoryExclusion) {
    this.removeContent(path);
    this.memory!.db.prepare(`INSERT INTO files(path,language,size_bytes,mtime_ms,excluded,secret_flagged,exclusion,first_seen_at,updated_at)
      VALUES(?,?,?,?,1,?,?,?,?) ON CONFLICT(path) DO UPDATE SET size_bytes=excluded.size_bytes,mtime_ms=excluded.mtime_ms,
      content_hash=NULL,baseline_ver=0,excluded=1,secret_flagged=excluded.secret_flagged,exclusion=excluded.exclusion,deleted=0,updated_at=excluded.updated_at`)
      .run(path, monacoLanguageForFile(path), size, mtime, reason === 'secret_flagged' ? 1 : 0, reason, this.timestamp(), this.timestamp());
  }

  private scrub() {
    if (!this.memory) return;
    if (this.memory.searchMode === 'fts5') this.memory.db.exec("INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild'); INSERT INTO web_fts(web_fts) VALUES('rebuild');");
    this.memory.db.pragma('wal_checkpoint(TRUNCATE)');
  }

  scan(options: { full?: boolean } = {}): Promise<ScanReport> {
    if (this.scanning) return this.scanning;
    const epoch = this.generation;
    this.scanning = this.performScan(epoch, options.full === true).finally(() => {
      this.scanning = null; this.emit();
    });
    return this.scanning;
  }

  private async performScan(epoch: number, full: boolean): Promise<ScanReport> {
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
          if (excluded || info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) {
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
          if (!full && old && !old.excluded && !old.deleted && old.size_bytes === info.size && old.mtime_ms === info.mtimeMs) {
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
              db.prepare('UPDATE files SET mtime_ms=?,size_bytes=?,updated_at=? WHERE path=?').run(info.mtimeMs, info.size, this.timestamp(), path);
              report.unchanged++; return;
            }
            this.removeContent(path);
            const version = (old?.baseline_ver ?? 0) + 1;
            db.prepare(`INSERT INTO files(path,language,size_bytes,content_hash,mtime_ms,baseline_ver,first_seen_at,updated_at)
              VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET language=excluded.language,size_bytes=excluded.size_bytes,
              content_hash=excluded.content_hash,mtime_ms=excluded.mtime_ms,baseline_ver=excluded.baseline_ver,
              excluded=0,secret_flagged=0,exclusion=NULL,deleted=0,updated_at=excluded.updated_at`)
              .run(path, monacoLanguageForFile(path), info.size, contentHash, info.mtimeMs, version, this.timestamp(), this.timestamp());
            db.prepare('INSERT INTO baselines VALUES(?,?,?,?,?)').run(path, version, deflateSync(text), contentHash, this.timestamp());
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
    const path = typeof scope === 'object' && scope !== null ? normalizeWorkspaceRelativePath(scope.path).relativePath : null;
    if (!path && !['all', 'web', 'journal'].includes(scope as string)) throw new Error('invalid_memory_purge');
    db.transaction(() => {
      if (path) { this.removeContent(path); db.prepare('DELETE FROM files WHERE path=?').run(path); }
      else if (scope === 'web') db.exec('DELETE FROM web_captures');
      else if (scope === 'journal') db.exec('DELETE FROM edit_journal');
      else {
        for (const table of ['baselines', 'edit_journal', 'symbols', 'chunks', 'web_captures', 'suggestions', 'governance_events', 'project_brief', 'files']) db.exec(`DELETE FROM ${table}`);
        db.prepare("DELETE FROM meta WHERE key='last_scan_at'").run(); this.lastScanAt = null;
      }
    })();
    this.scrub();
    db.exec('VACUUM');
    this.scrub(); this.emit();
  }

  status(): MemoryStatus {
    const db = this.memory?.db;
    const count = (table: string, condition = '1') => db ? (db.prepare(`SELECT count(*) n FROM ${table} WHERE ${condition}`).get() as { n: number }).n : 0;
    const databaseBytes = db ? Number(db.pragma('page_count', { simple: true })) * Number(db.pragma('page_size', { simple: true })) : 0;
    return { workspaceId: this.workspaceId, open: !!db, paused: this.paused || !this.settings.memoryEnabled,
      scanning: !!this.scanning, files: count('files', 'deleted=0'), indexedFiles: count('files', 'deleted=0 AND excluded=0'),
      excludedFiles: count('files', 'deleted=0 AND excluded=1'), journalRows: count('edit_journal'), webCaptures: count('web_captures'),
      databaseBytes, overSizeCap: databaseBytes >= this.settings.maxDatabaseBytes, lastScanAt: this.lastScanAt,
      searchMode: this.memory?.searchMode ?? 'fallback' };
  }
}
