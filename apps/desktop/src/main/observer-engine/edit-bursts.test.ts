import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editBursts } from '../../shared/edit-bursts.ts';
import { journalHash } from '../../shared/edit-journal.ts';
import type { JournalRow } from '../../shared/observer-engine.ts';
const row = (seq:number,ts:number,offset:number,inserted:string,base_ver=1):JournalRow=>({ seq,ts,offset,inserted,base_ver,path:'a.ts',removed_len:0,removed_text:'',origin:'typing',batch_id:seq,post_hash:null });
test('edit bursts merge within 20 seconds, use replayed line positions and bound previews',()=>{
  const rows = [row(1,1999,2,'hello\n'),row(2,21001,8,'world'),row(3,42000,13,'z'.repeat(300))];
  const bursts = editBursts('a.ts',new Map([[1,'a\n']]),rows);
  assert.equal(bursts.length,2); assert.deepEqual(bursts[0].addedLines,[2,3]);
  assert.equal(bursts[0].startTs,1); assert.equal(bursts[0].endTs,21); assert.equal(bursts[0].addedChars,11);
  assert.equal(bursts[1].preview.length,200);
});
test('bursts preserve versioned replay and deletion counts, rejecting corrupt rows',()=>{
  const a = row(1,1000,1,'X'); a.removed_len=1; a.removed_text='b'; a.post_hash=journalHash('aXc');
  const b = row(2,23000,0,'next',2); b.post_hash=journalHash('nextnew');
  const result = editBursts('a.ts',new Map([[1,'abc'],[2,'new']]),[a,b]);
  assert.equal(result[0].removedChars,1); assert.equal(result[1].preview,'next');
  assert.throws(()=>editBursts('a.ts',new Map([[1,'abc']]),[{...a,post_hash:'bad'}]),/hash/);
  assert.throws(()=>editBursts('a.ts',new Map(),[a]),/baseline/);
});
