import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildLiveProjectRequest, buildLiveRequest, LiveObserverController, type LivePolicy } from '../apps/desktop/src/main/live-observer.ts';
import { ProjectContextEngine } from '../apps/desktop/src/main/project-context.ts';
import { createContextTrayItem } from '../apps/desktop/src/shared/context-tray.ts';
import { ProjectContextSchema } from '../src/lib/server/project-context.ts';
import { buildPrompt, getSuggestion, parseLiveResponse, ProviderError, type SuggestContext } from '../src/lib/server/providers.ts';
import { validateAndBuildProposedEdit } from '../apps/desktop/src/shared/ai-edit.ts';
import type { LiveEdit } from '../apps/desktop/src/shared/live-observer.ts';
const policy: LivePolicy = { observerEnabled:true, includeDiagnostics:true, confirmCompleteFile:false, exclusions:[], maximumCharacters:50000, maximumFileCharacters:8000, maximumRelatedFiles:4 };
const edit: LiveEdit = { relativePath:'main.py', content:'def is_prime(n):\n    if n < 2:\n        return False\n    for divisor in range(2, n):\n        ', previousContent:'', line:5, column:9, diagnostics:[] };
test('30k current buffer, Python dependency and attached task reach backend together', async () => {
 const root = await mkdtemp(join(tmpdir(),'observer-context-'));
 try {
  const content = 'from helpers import check\n' + '# original context\n'.repeat(1550) + edit.content;
  const e = {...edit, content, line:content.split('\n').length};
  await writeFile(join(root,'main.py'), '# disk copy is older');
  await writeFile(join(root,'helpers.py'), 'def check(n):\n    return n > 1\n');
  e.trayItems = [await createContextTrayItem({type:'selected_output',title:'Assignment',content:'List primes up to an inclusive upper bound.',reason:'Assignment requirements.'})];
  const engine = new ProjectContextEngine(); engine.setWorkspace(root);
  const request = await buildLiveProjectRequest(e,'gemini',policy,engine);
  const context = request.contextPackage!;
  assert.equal(context.items[0].content,content);
  assert.ok(content.length > 29000);
  assert.ok(context.items.some(i=>i.source.relativePath==='helpers.py'));
  assert.ok(context.items.some(i=>i.content.includes('inclusive upper bound')));
  const parsed=ProjectContextSchema.safeParse(context); assert.equal(parsed.success,true,JSON.stringify(parsed.error));
  assert.ok(context.totalCharacters<=50000);
  const prompt=buildPrompt({liveObserver:true,fileName:request.fileName,kind:'code',content:'',context:{mode:'improve_code'},projectContext:parsed.data,editBase:request.editBase});
  assert.match(prompt,/unfinished code is NOT a reason/); assert.match(prompt,/def check/); assert.match(prompt,/inclusive upper bound/);
  assert.match(prompt,/block header.*indented body/i);
 } finally { await rm(root,{recursive:true,force:true}); }
});
test('C header and TypeScript local imports are automatically supplied', async()=>{
 const root=await mkdtemp(join(tmpdir(),'observer-imports-'));
 try {
  const engine=new ProjectContextEngine();engine.setWorkspace(root);
  for(const [path,content,dependency,dependencyContent] of [['main.c','#include "maths.h"\nint main() {\n','maths.h','int is_prime(int n);'],['main.ts','import { check } from "./helper.js";\ncheck(','helper.ts','export const check = (n: number) => n > 1;']]) {
   await writeFile(join(root,path),content); await writeFile(join(root,dependency),dependencyContent);
   const request=await buildLiveProjectRequest({...edit,relativePath:path,content,line:2,column:1},'gemini',policy,engine);
   assert.ok(request.contextPackage!.items.some(i=>i.source.relativePath===dependency));
   assert.ok(ProjectContextSchema.safeParse(request.contextPackage).success);
  }
 } finally {await rm(root,{recursive:true,force:true});}
});
test('small budgets preserve cursor region and never exceed configured budget',()=>{
 const content=Array.from({length:2000},(_,i)=>`value_${i} = ${i}`).join('\n');
 const request=buildLiveRequest({...edit,content,line:1800,column:1},'gemini',{...policy,maximumCharacters:9000});
 const context=request.contextPackage!;
 assert.ok(context.items[0].content.includes('value_1799 = 1799'));
 assert.ok(context.items[0].source.lineStart!>1);
 assert.ok(context.totalCharacters<=9000);
 assert.equal(context.containsCompleteFile,false);
});
test('default trigger is 2.5 seconds and resumed typing aborts stale work',async()=>{
 let now=0,calls=0,signal:AbortSignal|undefined;
 const controller=new LiveObserverController({now:()=>now,policy:async()=>policy,publish:()=>{},ask:async(_r,s)=>{calls++;signal=s;return new Promise(()=>{});}});
 controller.configure(true,'gemini');
 const activity=()=>controller.observeActivity({relativePath:'main.py',focused:true,blocked:false});
 activity();controller.edit(edit);now=2499;activity();await controller.tick();assert.equal(calls,0);
 now=2500;activity();void controller.tick();await Promise.resolve();await Promise.resolve();assert.equal(calls,1);
 controller.edit({...edit,previousContent:edit.content,content:edit.content+'if n % divisor == 0:'});assert.equal(signal?.aborted,true);
});
test('invalid exact edit is rejected before a suggestion is displayed',async()=>{
 let now=0;
 const controller=new LiveObserverController({now:()=>now,policy:async()=>policy,publish:()=>{},ask:async(r)=>({ok:true,value:{provider:'gemini',suggestion:{explanation:'Correction',snippet:'',reason:'Evidence',edit:{targetRelativePath:'main.py',originalContentHash:r.editBase!.originalContentHash,editType:'replace',range:{start:{line:1,column:1},end:{line:1,column:4}},expectedOriginalText:'WRONG',replacementText:'def'}}}})});
 controller.configure(true,'gemini');controller.observeActivity({relativePath:'main.py',focused:true,blocked:false});controller.edit(edit);now=2500;await controller.tick();assert.notEqual(controller.getState().status,'ready');assert.match(controller.getState().message,/could not be matched/);
});
test('all real provider adapters reserve sufficient output for a coherent completion',async()=>{
 const original=globalThis.fetch;
 const request=buildLiveRequest(edit,'gemini',policy);
 const ctx:SuggestContext={liveObserver:true,fileName:'main.py',kind:'code',content:'',context:{mode:'improve_code'},projectContext:ProjectContextSchema.parse(request.contextPackage),editBase:request.editBase};
 const answer=JSON.stringify({explanation:'NO_SUGGESTION',snippet:'',reason:'',edit:null});
 try{
  for(const provider of ['gemini','openai','deepseek','anthropic'] as const){
   globalThis.fetch=async(_url,init)=>{
    const body=JSON.parse(String(init?.body));assert.equal(body.max_tokens??body.max_completion_tokens??body.generationConfig?.maxOutputTokens,8192);
    if(provider==='openai'||provider==='deepseek') assert.equal(body.temperature,0);
    return Response.json(provider==='gemini'?{candidates:[{content:{parts:[{text:answer}]}}]}:provider==='anthropic'?{content:[{type:'text',text:answer}]}:{choices:[{message:{content:answer}}]});
   };
   assert.equal((await getSuggestion(provider,'mock-never-sent',ctx)).explanation,'NO_SUGGESTION');
  }
 }finally{globalThis.fetch=original;}
});

test('repairs an out-of-range Live Observer column from one unique exact match',()=>{
 const content = 'def factorial(n):\n    result = 1\n\n    for i in range(1, n + 1):\n        result *= i\n\n    return result\n\nnumber = int(input("Enter a number: "))\n\nprint("Factorial is:",vdkfdvf';
 const liveEdit: LiveEdit = { relativePath:'hello.py', previousContent:content.slice(0,-1), content, line:11, column:30, diagnostics:[] };
 const request = buildLiveRequest(liveEdit,'openai',policy);
 const ctx: SuggestContext = { liveObserver:true, fileName:'hello.py', kind:'code', content:'', context:{mode:'improve_code'}, projectContext:ProjectContextSchema.parse(request.contextPackage), editBase:request.editBase };
 const response = JSON.stringify({ explanation:'Complete the unfinished call.', snippet:'', reason:'The final argument is not defined.', edit:{ targetRelativePath:'hello.py', originalContentHash:request.editBase!.originalContentHash, editType:'replace', range:{start:{line:11,column:99},end:{line:11,column:106}}, expectedOriginalText:'vdkfdvf', replacementText:'factorial(number))', warnings:[] } });

 const suggestion = parseLiveResponse(response,'Live',ctx);

 assert.deepEqual(suggestion.edit?.range,{start:{line:11,column:23},end:{line:11,column:30}});
 const checked = validateAndBuildProposedEdit(suggestion.edit!,request.editBase!,content,request.editBase!.originalContentHash);
 assert.equal(checked.ok,true);
 if(checked.ok) assert.equal(checked.value.proposedContent.endsWith('print("Factorial is:",factorial(number))'),true);
});

test('repairs wrong code when the provider edit metadata is malformed but its exact text is unique',()=>{
 const content = 'def add(a, b):\n    return a - b\n';
 const liveEdit: LiveEdit = { relativePath:'maths.py', previousContent:'def add(a, b):\n', content, line:2, column:17, diagnostics:[] };
 const request = buildLiveRequest(liveEdit,'openai',policy);
 const ctx: SuggestContext = { liveObserver:true, fileName:'maths.py', kind:'code', content:'', context:{mode:'improve_code'}, projectContext:ProjectContextSchema.parse(request.contextPackage), editBase:request.editBase };
 const response = JSON.stringify({ explanation:'Use addition to match the function name.', snippet:'', reason:'The add function currently subtracts.', edit:{ targetRelativePath:'wrong.py', originalContentHash:'0'.repeat(64), editType:'insert', range:{start:{line:99,column:99},end:{line:1,column:1}}, expectedOriginalText:'return a - b', replacementText:'return a + b', unsupportedField:true } });

 const suggestion = parseLiveResponse(response,'Live',ctx);

 assert.equal(suggestion.edit?.targetRelativePath,'maths.py');
 assert.equal(suggestion.edit?.originalContentHash,request.editBase!.originalContentHash);
 assert.equal(suggestion.edit?.editType,'replace');
 assert.deepEqual(suggestion.edit?.range,{start:{line:2,column:5},end:{line:2,column:17}});
 const checked = validateAndBuildProposedEdit(suggestion.edit!,request.editBase!,content,request.editBase!.originalContentHash);
 assert.equal(checked.ok,true);
 if(checked.ok) assert.equal(checked.value.proposedContent,'def add(a, b):\n    return a + b\n');
});

test('completes half-written code at the trusted cursor despite omitted edit metadata',()=>{
 const content = 'def factorial(n):\n    result = 1\n    for i in range(1, n + 1):';
 const liveEdit: LiveEdit = { relativePath:'hello.py', previousContent:'def factorial(n):\n    result = 1\n', content, line:3, column:30, diagnostics:[] };
 const request = buildLiveRequest(liveEdit,'openai',policy);
 const ctx: SuggestContext = { liveObserver:true, fileName:'hello.py', kind:'code', content:'', context:{mode:'continue_code'}, projectContext:ProjectContextSchema.parse(request.contextPackage), editBase:request.editBase };
 const response = JSON.stringify({ explanation:'Finish the loop and return the result.', snippet:'', reason:'The for block has no body.', edit:{ editType:'insert', range:{ start:{line:3,column:31}, end:{line:3,column:31}, expectedOriginalText:'', replacementText:'        result *= i\n    return result' } } });

 const suggestion = parseLiveResponse(response,'Live',ctx);
 const checked = validateAndBuildProposedEdit(suggestion.edit!,request.editBase!,content,request.editBase!.originalContentHash);

 assert.equal(checked.ok,true);
 if(checked.ok) assert.equal(checked.value.proposedContent,'def factorial(n):\n    result = 1\n    for i in range(1, n + 1):\n        result *= i\n    return result');
});

test('rejects an invalid Live Observer range when exact text is ambiguous',()=>{
 const content = 'value = value + 1';
 const liveEdit: LiveEdit = { relativePath:'main.py', previousContent:'value = 1', content, line:1, column:18, diagnostics:[] };
 const request = buildLiveRequest(liveEdit,'openai',policy);
 const ctx: SuggestContext = { liveObserver:true, fileName:'main.py', kind:'code', content:'', context:{mode:'improve_code'}, projectContext:ProjectContextSchema.parse(request.contextPackage), editBase:request.editBase };
 const response = JSON.stringify({ explanation:'Rename the value.', snippet:'', reason:'The identifier is repeated.', edit:{ targetRelativePath:'main.py', originalContentHash:request.editBase!.originalContentHash, editType:'replace', range:{start:{line:1,column:99},end:{line:1,column:104}}, expectedOriginalText:'value', replacementText:'total', warnings:[] } });

 assert.throws(
  () => parseLiveResponse(response,'Live',ctx),
 (error:unknown) => error instanceof ProviderError && /could not be matched safely/i.test(error.userMessage)
 );
});

test('hides generic Live Observer commentary when no edit was proposed',()=>{
 const request = buildLiveRequest(edit,'openai',policy);
 const ctx: SuggestContext = { liveObserver:true, fileName:'main.py', kind:'code', content:'', context:{mode:'improve_code'}, projectContext:ProjectContextSchema.parse(request.contextPackage), editBase:request.editBase };
 const response = JSON.stringify({ explanation:'The function appears complete and correctly implemented without any evident issues.', snippet:'', reason:'The code is complete.', edit:null });

 assert.equal(parseLiveResponse(response,'Live',ctx).explanation,'NO_SUGGESTION');
});

test('preserves one focused Live Observer question when intent is ambiguous',()=>{
 const request = buildLiveRequest(edit,'openai',policy);
 const ctx: SuggestContext = { liveObserver:true, fileName:'main.py', kind:'code', content:'', context:{mode:'improve_code'}, projectContext:ProjectContextSchema.parse(request.contextPackage), editBase:request.editBase };
 const question = 'Should this function return a boolean or print the result?';
 const response = JSON.stringify({ explanation:question, snippet:'', reason:'The intended output is ambiguous.', edit:null });

 const suggestion = parseLiveResponse(response,'Live',ctx);
 assert.equal(suggestion.explanation,question);
 assert.equal(suggestion.edit,undefined);
});

test('configured TypeScript aliases supply the implementation rather than guessing paths',async()=>{
 const root=await mkdtemp(join(tmpdir(),'observer-alias-'));
 try{
  await mkdir(join(root,'src'),{recursive:true});
  await writeFile(join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{paths:{'@/*':['./src/*']}}}));
  await writeFile(join(root,'src/helper.ts'),'export const check = (n: number) => n > 1;');
  const content='import { check } from "@/helper";\ncheck(';
  await writeFile(join(root,'main.ts'),content);
  const engine=new ProjectContextEngine();engine.setWorkspace(root);
  const request=await buildLiveProjectRequest({...edit,relativePath:'main.ts',content,line:2,column:7},'gemini',policy,engine);
  assert.ok(request.contextPackage!.items.some(i=>i.source.relativePath==='src/helper.ts'));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('cut-off provider output never becomes a partial edit; fenced JSON is accepted',async()=>{
 const request=buildLiveRequest(edit,'gemini',policy);
 const ctx:SuggestContext={liveObserver:true,fileName:'main.py',kind:'code',content:'',context:{mode:'improve_code'},editBase:request.editBase};
 const json=JSON.stringify({explanation:'NO_SUGGESTION',snippet:'',reason:'',edit:null});
 for(const stop of ['length','MAX_TOKENS','max_tokens'])assert.throws(()=>parseLiveResponse(json,'Live',ctx,stop),/output limit/);
 assert.equal(parseLiveResponse('```json\n'+json+'\n```','Live',ctx).explanation,'NO_SUGGESTION');
});
