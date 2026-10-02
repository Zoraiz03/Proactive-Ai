import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEditCapture } from '../../renderer/src/engine/edit-capture.ts';
import { applyDelta } from '../../shared/edit-journal.ts';
import type { EditBatch } from '../../shared/observer-engine';

test('typing coalesces and idle/save/blur flushes preserve sequence, base hash and whole-second time', () => {
  const batches: EditBatch[] = []; const starts: string[] = []; let idle = () => {};
  const capture = createEditCapture({ begin: (_path,text) => starts.push(text), send: b => batches.push(b), now:()=>1234,
    schedule: fn => { idle=fn; return 1 as unknown as ReturnType<typeof setTimeout>; }, cancel:()=>{} });
  capture.change('a','',{changes:[{rangeOffset:0,rangeLength:0,text:'a'}]});
  capture.change('a','a',{changes:[{rangeOffset:1,rangeLength:0,text:'b'}]});
  assert.equal(batches.length,0); idle();
  assert.deepEqual(starts,['']); assert.equal(batches[0].deltas.length,1); assert.equal(batches[0].deltas[0].inserted,'ab');
  assert.equal(batches[0].deltas[0].ts,1000); assert.equal(batches[0].clientSeq,1);
  capture.change('a','ab',{changes:[{rangeOffset:0,rangeLength:1,text:''}],isUndoing:true}); capture.flush();
  assert.equal(batches[1].deltas[0].origin,'undo_redo'); capture.reset();
});
test('multi-cursor edits apply in descending offset order; large pastes split without losing text', () => {
  const batches: EditBatch[] = []; const capture = createEditCapture({begin:()=>{},send:b=>batches.push(b)});
  capture.change('a','abcd',{changes:[{rangeOffset:0,rangeLength:1,text:'A'},{rangeOffset:3,rangeLength:1,text:'D'}]},'ai_apply');
  capture.flush(); let text='abcd'; for(const d of batches.flatMap(b=>b.deltas)) text=applyDelta(text,d);
  assert.equal(text,'AbcD'); assert.ok(batches[0].deltas.every(d=>d.origin==='ai_apply'));
  batches.length=0; const paste='x'.repeat(240000);
  capture.change('a',text,{changes:[{rangeOffset:4,rangeLength:0,text:paste}]}); capture.flush();
  for(const b of batches) { assert.ok(new TextEncoder().encode(JSON.stringify(b)).length<256*1024); for(const d of b.deltas) text=applyDelta(text,d); }
  assert.equal(text,'AbcD'+paste); capture.reset();
});
