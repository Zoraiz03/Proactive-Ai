import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { inflateSync } from 'node:zlib';
import { MIGRATIONS } from './schema.ts';
import { JournalStore } from './journal-store.ts';
import { journalHash, replayJournal } from '../../shared/edit-journal.ts';
import type { JournalRow } from '../../shared/observer-engine.ts';

function fixture(run: (db: Database.Database, store: JournalStore, clock: (time: number) => void) => void) {
  const db = new Database(':memory:'); db.exec(MIGRATIONS[0]); let now = 1000;
  const store = new JournalStore(db, () => now);
  try { run(db, store, time => { now = time; }); } finally { db.close(); }
}
function seed(db: Database.Database, store: JournalStore, path = 'a.ts', text = '') {
  db.prepare('INSERT INTO files(path,first_seen_at,updated_at) VALUES(?,0,0)').run(path); store.baseline(path, text);
}
function append(store: JournalStore, text: string, inserted: string, seq: number, path = 'a.ts') {
  return store.apply({ path, clientSeq: seq, expectedBaseHash: journalHash(text), deltas: [
    { path, offset: text.length, removedLen: 0, inserted, origin: 'typing', ts: 0 },
  ] }, 512 * 1024)!;
}
test('501 rows compact to a new baseline while retained history replays from its original version', () => fixture((db, store) => {
  seed(db, store); let text = '';
  for (let i = 0; i < 501; i++) text = append(store, text, 'x', i + 1);
  store.compact('a.ts'); assert.equal(store.read('a.ts'), text);
  const baseline = db.prepare('SELECT content FROM baselines WHERE version=1').get() as { content: Buffer };
  const rows = db.prepare('SELECT * FROM edit_journal ORDER BY seq').all() as JournalRow[];
  assert.equal(replayJournal(inflateSync(baseline.content).toString(), rows).text, text);
  assert.equal((db.prepare('SELECT baseline_ver n FROM files').get() as { n: number }).n, 2);
  store.retain(2000); assert.equal(store.read('a.ts'), text);
  assert.equal((db.prepare('SELECT count(*) n FROM baselines').get() as { n: number }).n, 1);
}));
test('retention rebases a partially expired group and size eviction preserves current text', () => fixture((db, store, clock) => {
  seed(db, store, 'a.ts', 'base');
  let text = append(store, 'base', ' old', 1); clock(3000); text = append(store, text, ' retained', 2);
  store.retain(2000); store.clear(); assert.equal(store.read('a.ts'), text);
  const rows = db.prepare('SELECT * FROM edit_journal').all() as JournalRow[];
  const baseline = db.prepare('SELECT content FROM baselines').get() as { content: Buffer };
  assert.equal(rows.length, 1); assert.equal(replayJournal(inflateSync(baseline.content).toString(), rows).text, text);
  assert.equal(store.evictOldest(), true); store.clear(); assert.equal(store.read('a.ts'), text);
  assert.equal(store.evictOldest(), false);
}));
test('64 KB inserted compacts, large rows split, and LRU eviction reconstructs all 21 files', () => fixture((db, store) => {
  seed(db, store); const text = append(store, '', 'a'.repeat(70000), 1);
  assert.equal((db.prepare('SELECT max(length(inserted)) n FROM edit_journal').get() as { n: number }).n, 20000);
  store.compact('a.ts'); assert.equal(store.read('a.ts'), text);
  for (let i = 0; i < 21; i++) { const path = `${i}.ts`; seed(db, store, path, 'base'); append(store, 'base', `-${i}`, 1, path); }
  for (let i = 0; i < 21; i++) assert.equal(store.read(`${i}.ts`), `base-${i}`);
}));
test('SQLite replay preserves emoji at large paste boundaries and external replacement offsets', () => fixture((db, store) => {
  seed(db, store); const text = append(store, '', 'x'.repeat(19999) + '😀' + 'z'.repeat(30000), 1);
  store.clear(); assert.equal(store.read('a.ts'), text);
  const next = text.replace('😀', '😁'); store.external('a.ts', next, 512 * 1024);
  store.clear(); assert.equal(store.read('a.ts'), next);
}));
