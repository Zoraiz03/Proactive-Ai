import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openMemoryDatabase } from './database.ts';
import { storeSuggestion, storeOutcome, readFeedback } from './feedback-store.ts';
import { finalizeContext } from '../../shared/engine-context.ts';
import { validManifest, type MemorySuggestion } from '../../shared/feedback-memory.ts';
test('feedback returns the five latest dismissals and last accepted style, with no proposed code or excluded paths',()=>{
  const memory = openMemoryDatabase(':memory:'); const db=memory.db;
  const manifest = finalizeContext('w',[{id:'A',type:'nearby_code',source:'a.ts',content:'safe'}]).manifest;
  const row = (id:string):MemorySuggestion=>({workspaceId:'w',id,path:'a.ts',kind:'continuation',triggerReason:'manual',manifest,explanation:`explanation ${id}`,reason:'reason'});
  try {
    for (let i=0;i<7;i++) { storeSuggestion(db,row(`dismiss${i}`),i*1000); storeOutcome(db,`dismiss${i}`,'dismissed',i*1000); }
    storeSuggestion(db,{...row('accept'),proposedText:"function x() {\n  return 'local-only';\n}"},8000); storeOutcome(db,'accept','accepted',9000);
    storeSuggestion(db,{...row('private'),path:'excluded.ts',explanation:'private summary'},10000); storeOutcome(db,'private','dismissed',11000);
    const feedback=readFeedback(db,path=>path==='a.ts');
    assert.equal((feedback.match(/Previously dismissed:/g)??[]).length,5);
    assert.ok(!feedback.includes('dismiss0')&&!feedback.includes('dismiss1')); assert.ok(feedback.includes('dismiss6'));
    assert.ok(feedback.includes('2-space indentation; single quotes')); assert.ok(!feedback.includes('private summary'));
    assert.ok(!JSON.stringify(db.prepare('SELECT result_json FROM suggestions').all()).includes('local-only'));
    assert.ok(feedback.length<=600);
  } finally { db.close(); }
});
test('feedback writes reject secrets and malformed manifests without persisting content',()=>{
  const {db}=openMemoryDatabase(':memory:');
  try {
    const manifest=finalizeContext('w',[{id:'A',type:'nearby_code',source:'a.ts',content:'safe'}]).manifest;
    const row:MemorySuggestion={workspaceId:'w',id:'a',path:'a.ts',kind:'correction',triggerReason:'manual',manifest,explanation:'safe',reason:'safe'};
    assert.ok(validManifest(manifest)); assert.equal(validManifest({...manifest,totalChars:999}),false);
    assert.equal(validManifest({...manifest,content:'hidden payload'}),false);
    assert.throws(()=>storeSuggestion(db,{...row,proposedText:'api_key="sk-'+ 'x'.repeat(40)+'"'},1000),/invalid/);
    assert.throws(()=>storeSuggestion(db,{...row,manifest:{...manifest,totalChars:999}},1000),/invalid/);
    assert.equal((db.prepare('SELECT count(*) n FROM suggestions').get() as {n:number}).n,0);
  } finally { db.close(); }
});
