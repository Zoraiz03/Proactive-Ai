import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openMemoryDatabase, searchMemoryChunks } from './database.ts';

test('memory migration is idempotent and enables required pragmas', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'memory-db-'));
  try {
    for (let pass = 0; pass < 2; pass++) {
      const { db, searchMode } = openMemoryDatabase(join(dir, 'memory.db'));
      try {
        assert.equal(db.pragma('user_version', { simple: true }), 1);
        assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
        assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
        assert.equal(db.pragma('synchronous', { simple: true }), 1);
        assert.equal(searchMode, 'fts5');
        assert.ok(db.prepare("SELECT name FROM pragma_table_info('files') WHERE name='secret_flagged'").get());
        if (!pass) db.prepare("INSERT INTO meta VALUES('fixture','retained')").run();
        assert.deepEqual(db.prepare("SELECT value FROM meta WHERE key='fixture'").get(), { value: 'retained' });
      } finally { db.close(); }
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

for (const disableFts of [false, true]) test(`retrieval and deletion use ${disableFts ? 'fallback' : 'FTS5'}`, () => {
  const warnings: string[] = [];
  const memory = openMemoryDatabase(':memory:', category => warnings.push(category), { disableFts });
  try {
    assert.deepEqual(warnings, disableFts ? ['memory_fts_unavailable'] : []);
    const insert = memory.db.prepare('INSERT INTO chunks(path,chunk_idx,line_start,line_end,text,hash) VALUES(?,0,1,1,?,?)');
    insert.run('a.ts', 'alpha beta', 'a'); insert.run('b.ts', 'gamma', 'b');
    assert.equal(searchMemoryChunks(memory, ['alpha']).length, 1);
    memory.db.prepare("DELETE FROM chunks WHERE path='a.ts'").run();
    assert.deepEqual(searchMemoryChunks(memory, ['alpha']), []);
    assert.deepEqual(searchMemoryChunks(memory, ['" OR * --']), []);
  } finally { memory.db.close(); }
});
