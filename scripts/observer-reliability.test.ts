import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {ProjectContextEngine} from '../apps/desktop/src/main/project-context.ts';
import {createObserverRequest, validateObserverPrepareRequest} from '../apps/desktop/src/shared/observer.ts';
import {ProjectContextSchema} from '../src/lib/server/project-context.ts';
import {createContextTrayItem} from '../apps/desktop/src/shared/context-tray.ts';
import {student253, studentFixtures, behavioralAssertions} from './fixtures/observer-students.ts';
import {validateAndBuildProposedEdit} from '../apps/desktop/src/shared/ai-edit.ts';
import {parseLiveResponse, getSuggestion} from '../src/lib/server/providers.ts';
import {observerInputBudget, assertObserverPromptBudget} from '../apps/desktop/src/shared/observer-budget.ts';

test('full active selection survives Explain and Fix with smaller related-file budget, imports and requirements', async()=>{
 const root=await mkdtemp(join(tmpdir(),'observer-reliability-'));
 try {
  await writeFile(join(root,'main.py'),'# old saved code\n');
  await writeFile(join(root,'helpers.py'),'def normalize(value):\n    return int(value)\n');
  const content='from helpers import normalize\n'+student253;
  const engine=new ProjectContextEngine(); engine.setWorkspace(root);
  const requirement=await createContextTrayItem({type:'selected_markdown',title:'Requirement',content:'Calculate the arithmetic mean of all subject marks.',reason:'Explicit requirement.'});
  for(const mode of ['explain','fix_error'] as const){
   const seed={mode,kind:'code' as const,activeRelativePath:'main.py',fileName:'main.py',language:'python',content,selectedCode:content,cursorLine:7,cursorColumn:1,exclusions:[],maximumTotalCharacters:50000,maximumRelatedFiles:4,maximumCharactersPerFile:500,trayItems:[requirement]};
   assert.ok(validateObserverPrepareRequest({provider:'gemini',seed}));
   const context=await engine.build(seed);
   assert.equal(context.items.find(i=>i.type==='selected_code')?.content,content);
   assert.ok(context.items.some(i=>i.source.relativePath==='helpers.py'));
   assert.ok(context.items.some(i=>i.content===requirement.content));
   assert.ok(ProjectContextSchema.safeParse(context).success);
   await assert.rejects(engine.build({...seed,maximumTotalCharacters:1000}),/exceeds|budget/);
  }
  const large=student253.padEnd(30000,'\n');
  const ctx=await engine.build({mode:'explain',kind:'code',activeRelativePath:'main.py',fileName:'main.py',language:'python',content:large,selectedCode:large,cursorLine:7,cursorColumn:1,exclusions:[],maximumTotalCharacters:50000,maximumRelatedFiles:4,maximumCharactersPerFile:500});
  assert.equal(ctx.items.find(i=>i.type==='selected_code')?.content.length,30000);
  const base={mode:'explain' as const,provider:'gemini' as const,kind:'code' as const,fileName:'main.py',language:'python',content:large,selectedCode:large,cursorLine:1,cursorColumn:1,maximumContextChars:50000};
  assert.equal(createObserverRequest(base)?.selectedCode,large);
  assert.equal(createObserverRequest({...base,maximumContextChars:1000}),null);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('mocked corrections are exact targeted edits and pass Python behavioral assertions; stale and cut-off edits fail',()=>{
 for(const fixture of studentFixtures){
  if(fixture.expected==='no_suggestion')continue;
  const original=fixture.content;
  const before=fixture.name==='random-text'?'    random text inserted here\n':fixture.name==='unfinished'?'return total_marks /':'return total_marks * number_of_subjects';
  const replacement=fixture.name==='random-text'?'':'return total_marks / number_of_subjects';
  const offset=original.indexOf(before);assert.ok(offset>=0);
  const position=(at:number)=>({line:original.slice(0,at).split('\n').length,column:at-original.lastIndexOf('\n',at-1)});
  const base={targetRelativePath:'main.py',originalContentHash:createHash('sha256').update(original).digest('hex'),contentLength:original.length,basedOnUnsavedContent:true};
  const edit={...base,editType:replacement?'replace' as const:'delete' as const,range:{start:position(offset),end:position(offset+before.length)},expectedOriginalText:before,replacementText:replacement};
  // Transport fixture only: this does not measure AI quality.
  const {contentLength,basedOnUnsavedContent,...wireEdit}=edit;
  const ctx={fileName:'main.py',kind:'code' as const,content:original,context:{mode:'improve_code' as const},editBase:base,liveObserver:true};
  const json=JSON.stringify({explanation:'Correct local arithmetic/syntax.',snippet:'',reason:'Concrete local defect.',edit:wireEdit});
  const suggestion=parseLiveResponse(json,'fixture',ctx,'STOP');
  const checked=validateAndBuildProposedEdit(suggestion.edit!,base,original,base.originalContentHash);assert.ok(checked.ok);
  const python=spawnSync('python3',['-c',checked.value.proposedContent+behavioralAssertions],{encoding:'utf8',timeout:5000});assert.equal(python.status,0,python.stderr);
  assert.equal(validateAndBuildProposedEdit(suggestion.edit!,base,original+'\n','0'.repeat(64)).ok,false);
  assert.throws(()=>parseLiveResponse(json,'fixture',ctx,'MAX_TOKENS'));
 }
});

test('provider budgets reject unsupported models/oversized prompts and cancellation propagates (mock transport)',async()=>{
 assert.ok(observerInputBudget('gemini',50000)>=30000);
 assert.throws(()=>assertObserverPromptBudget('deepseek','x'.repeat(64000)),/budget/);
 const transport=globalThis.fetch;
 const abort=new AbortController();
 globalThis.fetch=async(_url,init)=>{assert.ok(init?.signal);abort.abort();init.signal!.throwIfAborted();throw Error('unreachable');};
 try{
  const ctx={fileName:'main.py',kind:'code' as const,content:'x=1',context:{mode:'explain' as const},signal:abort.signal};
  await assert.rejects(getSuggestion('gemini','mock-only',ctx),/abort/i);
  await assert.rejects(getSuggestion('gemini','mock-only',ctx,'unavailable-model'),/unsupported/);
 }finally{globalThis.fetch=transport;}
});

test('actual student file: local-only full Explain/Fix context and existing grade behavior', {skip:!process.env.OBSERVER_STUDENT_FILE}, async()=>{
 const {readFile}=await import('node:fs/promises');
 const content=await readFile(process.env.OBSERVER_STUDENT_FILE!,'utf8');
 const root=await mkdtemp(join(tmpdir(),'actual-student-local-'));
 try{
  await writeFile(join(root,'main.py'),content);
  const engine=new ProjectContextEngine();engine.setWorkspace(root);
  for(const mode of ['explain','fix_error'] as const){
   const started=performance.now();
   const context=await engine.build({mode,kind:'code',activeRelativePath:'main.py',fileName:'main.py',language:'python',content,selectedCode:content,cursorLine:1,cursorColumn:1,exclusions:[],maximumTotalCharacters:50000,maximumRelatedFiles:4,maximumCharactersPerFile:8000});
   assert.equal(context.items.find(i=>i.type==='selected_code')?.content,content);
   assert.ok(ProjectContextSchema.safeParse(context).success);
   console.log(JSON.stringify({fixture:'actual-student-local-only',mode,characters:content.length,lines:content.split('\n').length,contextMs:Math.round(performance.now()-started)}));
  }
  const result=spawnSync('python3',['-I','-c',content+behavioralAssertions],{cwd:root,encoding:'utf8',timeout:5000});
  assert.equal(result.status,0,result.stderr);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('provider quota, overload and invalid edits remain distinct with no retry or provider switch (mock transport)',async()=>{
 const fetchOriginal=globalThis.fetch;
 const context={fileName:'main.py',kind:'code' as const,content:'def total(x): return sum(x)',context:{mode:'explain' as const}};
 try{
  for(const [status,pattern] of [[429,/quota or rate limit/],[503,/overloaded/],[529,/overloaded/],[404,/configured model/]] as const){
   let calls=0;
   globalThis.fetch=async(url)=>{calls++;assert.match(String(url),/generativelanguage.googleapis.com/);return new Response('{}',{status});};
   await assert.rejects(getSuggestion('gemini','mock-only',context),(error:unknown)=>{
    assert.match((error as {userMessage:string}).userMessage,pattern);return true;
   });
   assert.equal(calls,1);
  }
 }finally{globalThis.fetch=fetchOriginal;}
});

test('telemetry contains only sizes/categories and trace identity, never code or omission source text',async()=>{
 const {observerTelemetry}=await import('../apps/desktop/src/shared/observer-budget.ts');
 const log=console.info, records:unknown[][]=[];
 console.info=(...values:unknown[])=>{records.push(values);};
 try{observerTelemetry('context_preparation',12,{totalCharacters:12,items:[{type:'selected_code',content:'PRIVATE_CODE'}],omitted:[{reason:'PRIVATE_CODE exceeds budget'}]},'12345678-1234-1234-1234-123456789012');}
 finally{console.info=log;}
 const serialized=JSON.stringify(records);assert.doesNotMatch(serialized,/PRIVATE_CODE/);assert.match(serialized,/budget/);assert.match(serialized,/traceId/);
});
