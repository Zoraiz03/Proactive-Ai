import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openMemoryDatabase } from './database.ts';
import { retrieveChunks, retrieveWeb } from './retrieval.ts';
import { journalHash } from '../../shared/edit-journal.ts';
import { retrievalTerms } from '../../shared/context-ranking.ts';
for (const disableFts of [false,true]) test(`retrieval excludes private files, ranks web with recency/diversity/pins and filters unsafe captures (${disableFts?'fallback':'FTS5'})`, () => {
  const memory = openMemoryDatabase(':memory:',()=>{}, { disableFts }), db = memory.db, now = 100000000;
  try {
    for (const path of ['active.ts','related.ts','excluded.ts']) {
      db.prepare('INSERT INTO files(path,excluded,first_seen_at,updated_at) VALUES(?,?,0,0)').run(path,Number(path==='excluded.ts'));
      db.prepare('INSERT INTO chunks(path,chunk_idx,line_start,line_end,text,hash) VALUES(?,0,1,1,?,?)').run(path,'widget matching code',journalHash('widget matching code'));
    }
    assert.deepEqual(retrieveChunks(memory,['widget'],10,'active.ts').map(hit=>hit.path),['related.ts']);
    const insert = db.prepare('INSERT INTO web_captures(id,captured_at,expires_at,source,url,hostname,title,text,content_hash,pinned) VALUES(?,?,?,\'selection\',?,?,?,?,?,?)');
    for (const [id,host,age,pin,text] of [['old','a.example',86400000,0,'widget one'],['new','a.example',0,0,'widget two'],['third','a.example',1000,0,'widget six'],['diverse','b.example',1000,0,'widget four'],['pinned','c.example',0,1,'unrelated content'],['expired','d.example',0,1,'widget stale'],['secret','e.example',0,1,'api_key="sk-'+ 'x'.repeat(40)+'"']] as const) {
      insert.run(id,now-age,id==='expired'?now-1:now+10000,`https://${host}/doc?q=private#fragment`,host,'reference',text,journalHash(text),pin);
    }
    const web = retrieveWeb(memory,['widget'],now,3);
    assert.equal(web.length,3); assert.equal(web[0].id,'pinned'); assert.ok(web.some(hit=>hit.id==='new'));
    assert.ok(!web.some(hit=>['expired','secret'].includes(hit.id)));
    assert.ok(web.every(hit=>!hit.url.includes('?')&&!hit.url.includes('#')));
    db.prepare("UPDATE web_captures SET pinned=0 WHERE id='pinned'").run();
    assert.ok(retrieveWeb(memory,['widget'],now,3).some(hit=>hit.hostname==='b.example'));
    assert.equal((db.prepare('SELECT sum(use_count) n FROM web_captures').get() as { n:number }).n,0);
  } finally { db.close(); }
});
test('retrieval query removes stop words, FTS syntax and duplicates, with a 24-term cap',()=>{
  const terms = retrievalTerms(['the AND widget widget " OR * return',...Array.from({length:40},(_,i)=>`identifier${i}`)]);
  assert.equal(terms.length,24); assert.equal(terms[0],'widget'); assert.ok(!terms.includes('the')); assert.ok(!terms.includes('return'));
});
