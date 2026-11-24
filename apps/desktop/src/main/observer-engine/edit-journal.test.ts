import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { applyDelta, replayJournal, journalHash } from '../../shared/edit-journal.ts';
import type { JournalRow } from '../../shared/observer-engine';

test('random UTF-16 insert/delete/replace journals replay exactly with SHA-256 verification', () => {
  let seed = 12456;
  const random = (max: number) => { seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; return seed % max; };
  for (let round = 0; round < 40; round++) {
    let text = 'initial 😀\r\n'; const baseline = text; const rows: JournalRow[] = [];
    for (let i = 1; i <= 100; i++) {
      const offset = random(text.length + 1), removedLen = random(text.length - offset + 1);
      const inserted = ['x','😀','\n','\r\n','', 'é'][random(6)];
      text = text.slice(0,offset) + inserted + text.slice(offset+removedLen);
      const hash = createHash('sha256').update(text).digest('hex');
      rows.push({ seq:i,path:'a',ts:0,base_ver:1,offset,removed_len:removedLen,removed_text:null,inserted,origin:'typing',batch_id:i,post_hash:hash });
      assert.equal(journalHash(text), hash);
    }
    assert.deepEqual(replayJournal(baseline, rows), { text, hash: journalHash(text) });
  }
});
test('replay fails closed on invalid ranges, ordering and corruption', () => {
  assert.throws(() => applyDelta('x',{offset:2,removedLen:0,inserted:'y'}));
  assert.throws(() => applyDelta('x',{offset:0,removedLen:-1,inserted:''}));
  const row = { seq:1, offset:0, removed_len:0, inserted:'x', post_hash:'bad' } as JournalRow;
  assert.throws(() => replayJournal('',[row]), /hash/);
  assert.throws(() => replayJournal('',[{...row,post_hash:null},{...row,post_hash:null}]), /order/);
});
