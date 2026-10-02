import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import type Database from 'better-sqlite3';
import { applyDelta, replayJournal, splitJournalText } from '../../shared/edit-journal.ts';
import type { EditBatch, JournalRow } from '../../shared/observer-engine.ts';
import { redactContextSecrets } from '../../shared/context-tray.ts';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export class JournalStore {
  private cache = new Map<string, string>();
  private db: Database.Database;
  private now: () => number;
  constructor(db: Database.Database, now: () => number) { this.db = db; this.now = now; }
  clear(path?: string) { if (path) this.cache.delete(path); else this.cache.clear(); }
  private remember(path: string, text: string) {
    this.cache.delete(path); this.cache.set(path, text);
    if (this.cache.size > 20) this.cache.delete(this.cache.keys().next().value!);
    return text;
  }
  read(path: string): string | null {
    const file = this.db.prepare('SELECT baseline_ver,content_hash FROM files WHERE path=? AND excluded=0 AND deleted=0').get(path) as { baseline_ver: number; content_hash: string } | undefined;
    if (!file) return null;
    const cached = this.cache.get(path);
    if (cached !== undefined && hash(cached) === file.content_hash) return this.remember(path, cached);
    const baseline = this.db.prepare('SELECT content,content_hash FROM baselines WHERE path=? AND version=?').get(path, file.baseline_ver) as { content: Buffer; content_hash: string } | undefined;
    if (!baseline) throw new Error('memory_missing_baseline');
    const text = inflateSync(baseline.content, { maxOutputLength: 2 * 1024 * 1024 }).toString('utf8');
    if (hash(text) !== baseline.content_hash) throw new Error('memory_baseline_hash');
    const replay = replayJournal(text, this.db.prepare('SELECT * FROM edit_journal WHERE path=? AND base_ver=? ORDER BY seq').all(path, file.baseline_ver) as JournalRow[]);
    if (replay.hash !== file.content_hash) throw new Error('memory_current_hash');
    return this.remember(path, replay.text);
  }
  baseline(path: string, text: string) {
    const version = (this.db.prepare('SELECT coalesce(max(version),0) n FROM baselines WHERE path=?').get(path) as { n: number }).n + 1;
    this.db.prepare('INSERT INTO baselines VALUES(?,?,?,?,?)').run(path, version, deflateSync(text), hash(text), this.now());
    this.db.prepare('UPDATE files SET baseline_ver=?,content_hash=?,updated_at=? WHERE path=?').run(version, hash(text), this.now(), path);
    this.clear(path);
  }
  external(path: string, next: string, maxBytes: number) {
    const previous = this.read(path);
    if (previous === null || previous === next) return;
    let start = 0, end = 0;
    while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
    if (start > 0 && /[\uD800-\uDBFF]/.test(previous[start - 1])) start--;
    while (end < previous.length - start && end < next.length - start && previous[previous.length - end - 1] === next[next.length - end - 1]) end++;
    if (end > 0 && /[\uDC00-\uDFFF]/.test(previous[previous.length - end])) end--;
    this.apply({ path, clientSeq: 1, expectedBaseHash: hash(previous), deltas: [{ path, offset: start,
      removedLen: previous.length - start - end, inserted: next.slice(start, next.length - end), origin: 'external', ts: this.now() }] }, maxBytes);
  }
  compact(path: string, force = false) {
    const count = this.db.prepare(`SELECT count(*) n,coalesce(sum(length(CAST(inserted AS BLOB))),0) bytes
      FROM edit_journal WHERE path=? AND base_ver=(SELECT baseline_ver FROM files WHERE path=?)`).get(path, path) as { n: number; bytes: number };
    if (!count.n || (!force && count.n <= 500 && count.bytes <= 64 * 1024)) return;
    const text = this.read(path);
    if (text !== null) this.baseline(path, text);
  }
  recoverBaseline(path: string): string {
    const baseline = this.db.prepare(`SELECT b.content,b.content_hash FROM baselines b JOIN files f ON f.path=b.path AND f.baseline_ver=b.version WHERE f.path=?`).get(path) as { content: Buffer; content_hash: string } | undefined;
    if (!baseline) throw new Error('memory_missing_baseline');
    const text = inflateSync(baseline.content, { maxOutputLength: 2 * 1024 * 1024 }).toString('utf8');
    if (hash(text) !== baseline.content_hash) throw new Error('memory_baseline_hash');
    this.baseline(path, text);
    return text;
  }
  pruneBaselines() {
    this.db.exec(`DELETE FROM baselines WHERE NOT EXISTS(SELECT 1 FROM edit_journal j WHERE j.path=baselines.path AND j.base_ver=baselines.version)
      AND NOT EXISTS(SELECT 1 FROM files f WHERE f.path=baselines.path AND f.baseline_ver=baselines.version AND f.deleted=0 AND f.excluded=0)`);
  }
  retain(cutoff: number) {
    this.db.transaction(() => {
      const groups = this.db.prepare('SELECT DISTINCT path,base_ver FROM edit_journal WHERE ts<?').all(cutoff) as { path: string; base_ver: number }[];
      for (const group of groups) {
        const rows = this.db.prepare('SELECT * FROM edit_journal WHERE path=? AND base_ver=? ORDER BY seq').all(group.path, group.base_ver) as JournalRow[];
        const boundary = rows.findIndex(row => row.ts >= cutoff);
        const expired = boundary === -1 ? rows : rows.slice(0, boundary);
        if (!expired.length) continue;
        const baseline = this.db.prepare('SELECT content,content_hash FROM baselines WHERE path=? AND version=?').get(group.path, group.base_ver) as { content: Buffer; content_hash: string } | undefined;
        if (baseline) {
          const text = inflateSync(baseline.content, { maxOutputLength: 2 * 1024 * 1024 }).toString('utf8');
          if (hash(text) !== baseline.content_hash) throw new Error('memory_retention_baseline_hash');
          const remainingBase = replayJournal(text, expired);
          // Move the retained group's starting point past the expired prefix. Surviving offsets and post hashes stay valid.
          this.db.prepare('UPDATE baselines SET content=?,content_hash=? WHERE path=? AND version=?')
            .run(deflateSync(remainingBase.text), remainingBase.hash, group.path, group.base_ver);
        }
        this.db.prepare('DELETE FROM edit_journal WHERE path=? AND base_ver=? AND seq<=?').run(group.path, group.base_ver, expired.at(-1)!.seq);
        this.clear(group.path);
      }
      this.pruneBaselines();
    })();
  }
  evictOldest(): boolean {
    const journal = this.db.prepare('SELECT path,base_ver,ts FROM edit_journal ORDER BY ts,seq LIMIT 1').get() as { path: string; base_ver: number; ts: number } | undefined;
    const web = this.db.prepare('SELECT id,captured_at FROM web_captures ORDER BY captured_at LIMIT 1').get() as { id: string; captured_at: number } | undefined;
    if (!journal && !web) return false;
    this.db.transaction(() => {
      if (web && (!journal || web.captured_at < journal.ts)) this.db.prepare('DELETE FROM web_captures WHERE id=?').run(web.id);
      else if (journal) {
        this.compact(journal.path, true); // Materialize current text before removing any delta it depends on.
        this.db.prepare('DELETE FROM edit_journal WHERE path=? AND base_ver=?').run(journal.path, journal.base_ver);
        this.pruneBaselines();
      }
    })();
    return true;
  }
  apply(batch: EditBatch, maxBytes: number): string | null {
    let text = this.read(batch.path);
    if (text === null) return null;
    if (batch.expectedBaseHash !== hash(text)) throw new Error('memory_edit_drift');
    const version = (this.db.prepare('SELECT baseline_ver FROM files WHERE path=?').get(batch.path) as { baseline_ver: number }).baseline_ver;
    const rows: { offset: number; removedLen: number; inserted: string; removed: string; origin: string }[] = [];
    for (const delta of batch.deltas) {
      if (delta.path !== batch.path || !['typing','paste','ai_apply','undo_redo','external'].includes(delta.origin) || typeof delta.inserted !== 'string') throw new Error('invalid_memory_delta');
      // Screen every intermediate state: a secret inserted and removed in one batch must never enter the journal.
      const next = applyDelta(text, delta);
      if (redactContextSecrets(next).redacted) throw new Error('memory_secret');
      if (Buffer.byteLength(next) > maxBytes || next.includes('\0')) throw new Error('memory_content_limit');
      let offset = 0;
      for (const inserted of splitJournalText(delta.inserted)) {
        rows.push({ offset: delta.offset + offset, removedLen: offset ? 0 : delta.removedLen,
          removed: offset ? '' : text.slice(delta.offset, delta.offset + Math.min(delta.removedLen, 2000)),
          inserted, origin: delta.origin });
        offset += inserted.length;
      }
      text = next;
    }
    const finalText = text;
    this.db.transaction(() => {
      const batchId = (this.db.prepare('SELECT coalesce(max(batch_id),0)+1 n FROM edit_journal').get() as { n: number }).n;
      const insert = this.db.prepare('INSERT INTO edit_journal(path,ts,base_ver,offset,removed_len,removed_text,inserted,origin,batch_id,post_hash) VALUES(?,?,?,?,?,?,?,?,?,?)');
      const timestamp = Math.max(this.now(), (this.db.prepare('SELECT coalesce(max(ts),0) n FROM edit_journal').get() as { n: number }).n);
      rows.forEach((row, i) => insert.run(batch.path, timestamp, version, row.offset, row.removedLen, row.removed, row.inserted, row.origin, batchId, i === rows.length - 1 ? hash(finalText) : null));
      this.db.prepare('UPDATE files SET content_hash=?,updated_at=? WHERE path=?').run(hash(finalText), this.now(), batch.path);
    })();
    return this.remember(batch.path, finalText);
  }
}
