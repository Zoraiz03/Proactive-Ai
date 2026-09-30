import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildExplainContext, explainFunction } from './explain-context.ts';
import { ProjectContextEngine } from './project-context.ts';
import { ExplanationSession, type ExplanationPolicy } from './explanation-session.ts';
import { explanationBudget, estimateExplainTokens, EXPLAIN_MODELS } from '../shared/explanation-budget.ts';
import { normalizeLocalSettings } from '../shared/settings.ts';
import { validateObserverPrepareRequest, validateObserverRequest, type ObserverRequest } from '../shared/observer.ts';
import type { ProjectContextSeed } from '../shared/project-context.ts';
import { getSuggestion, type SuggestContext } from '../../../../src/lib/server/providers.ts';
const fixture=(size:number)=>{
 const lines=['def calculate(value):',...Array.from({length:451},(_,i)=>`    value += ${i%7}`),'    return value'];
 const base=lines.join('\n');return base+' #'+ 'x'.repeat(size-base.length-2);
};
const seed=(content:string,extra:Partial<ProjectContextSeed>={}):ProjectContextSeed=>({mode:'explain',kind:'code',activeRelativePath:'main.py',fileName:'main.py',language:'python',content,cursorLine:400,cursorColumn:5,explainScope:'file',exclusions:[],maximumTotalCharacters:30000,maximumCharactersPerFile:8000,maximumRelatedFiles:4,...extra});
const request=(value:ProjectContextSeed):ObserverRequest=>({provider:'demo',mode:'explain',kind:'code',fileName:value.fileName,language:value.language,source:'cursor',cursorLine:value.cursorLine,cursorColumn:value.cursorColumn,storeHistory:false,contextPackage:buildExplainContext(value)});
const policy:ExplanationPolicy={enabled:true,exclusions:[],maximumCharacters:30000,maximumFileCharacters:8000,explainMaximumCodeCharacters:8000,confirmCompleteFile:true};
test('7999/8000/8001/12000/20001: preparation, session and provider agree without truncation',async()=>{
 for(const maximum of [8000,20000])for(const size of [7999,8000,8001,12000,19999,20000,20001]){
  const content=fixture(size);assert.equal(content.length,size);assert.equal(content.split('\n').length,453);
  for(const scope of ['file','function','selection'] as const){
   const value=seed(content,{explainScope:scope,maximumCharactersPerFile:maximum,...(scope==='selection'?{selectedCode:content}:{})});
   if(size>maximum){assert.throws(()=>request(value),new RegExp(`${size.toLocaleString()} characters`));continue;}
   const prepared=request(value),code=prepared.contextPackage!.items[1];
   assert.equal(code.content,content);assert.equal(code.source.lineStart,1);assert.equal(code.source.lineEnd,453);assert.equal(code.truncated,false);
   assert.ok(validateObserverRequest(prepared));
   let calls=0,consents=0;
   const session=new ExplanationSession({policy:async()=>({...policy,explainMaximumCodeCharacters:maximum}),confirm:async()=>{consents++;return true;},ask:async(sent)=>{
    calls++;assert.deepEqual(sent.contextPackage,prepared.contextPackage);assert.ok(validateObserverRequest(sent));
    const ctx:SuggestContext={fileName:sent.fileName,kind:'code',content:'',context:{mode:'explain'},projectContext:sent.contextPackage,explanation:sent.explanation};
    const suggestion=await getSuggestion('demo',null,ctx);return {ok:true,value:{provider:'demo',suggestion}};
   }});
   const result=await session.start('boundary',prepared);assert.equal(result.ok,true,JSON.stringify(result));assert.equal(calls,1);assert.equal(consents,1);
  }
 }
});
test('cursor400 and end resolve whole453linefunction; nested functions choose enclosing inner then outer',()=>{
 const content=fixture(12000);
 for(const cursorLine of [400,453])assert.equal(buildExplainContext(seed(content,{explainScope:'function',cursorLine,maximumCharactersPerFile:20000})).items[1].content,content);
 const nested='def outer(a):\n    def inner(b):\n        return b + 1\n    return inner(a)\n';
 const inner=buildExplainContext(seed(nested,{explainScope:'function',cursorLine:3}));assert.equal(inner.items[1].source.lineStart,2);assert.equal(inner.items[1].source.lineEnd,3);
 const outer=buildExplainContext(seed(nested,{explainScope:'function',cursorLine:4}));assert.equal(outer.items[1].source.lineStart,1);assert.equal(outer.items[1].source.lineEnd,4);
 assert.equal(explainFunction(seed('print(1)',{cursorLine:1})).range,null);
 assert.throws(()=>buildExplainContext(seed('def f():\n    """doc"""\n    return 1',{cursorLine:3,explainScope:'function'})),/identified reliably/);
 assert.throws(()=>buildExplainContext(seed(content,{explainScope:'selection'})),/select code/);
});
test('exact JS function and selection columns; large source allows small unsaved selection',()=>{
 const js='const fn = (x) => { return x + 1; };';
 const context=buildExplainContext(seed(js,{fileName:'main.js',activeRelativePath:'main.js',language:'javascript',cursorLine:1,cursorColumn:25,explainScope:'function'}));
 assert.equal(context.items[1].content,'(x) => { return x + 1; }');
 const content='#'+'x'.repeat(60000)+'\nvalue = 42';
 const value=seed(content,{cursorLine:2,explainScope:'selection',selectedCode:'42',selectionRange:{start:{line:2,column:9},end:{line:2,column:11}}});
 assert.ok(validateObserverPrepareRequest({provider:'demo',seed:value}));assert.equal(buildExplainContext(value).items[1].content,'42');
 assert.throws(()=>buildExplainContext({...value,selectedCode:'41'}),/Selection changed/);
});
test('engine uses unsaved buffer, screens secrets and exclusions, and refuses oversized full files',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'explain-budget-'));
 try{
  await writeFile(join(directory,'main.py'),'print("saved")');const engine=new ProjectContextEngine();engine.setWorkspace(directory);
  const context=await engine.build(seed('print("unsaved")',{cursorLine:1}));assert.equal(context.items[1].content,'print("unsaved")');
  await assert.rejects(()=>engine.build(seed('print(1)',{exclusions:['main.py']})),/excluded/);
  await assert.rejects(()=>engine.build(seed('password="synthetic-secret-value"')),/suspected secrets/);
  await assert.rejects(()=>engine.build(seed(fixture(8001))),/8,001.*8,000/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('budgets count instructions/history, UTF8, response reserve; settings inherit rather than increase',()=>{
 const context=request(seed(fixture(7999))).contextPackage!;
 const budget=explanationBudget(context);assert.equal(budget.characters,8035);assert.ok(budget.totalTokens>7999+6000);assert.equal(estimateExplainTokens('é🙂'),6);
 assert.equal(normalizeLocalSettings({contextMaximumFileCharacters:1000}).explainMaximumCodeCharacters,1000);
 assert.equal(normalizeLocalSettings({contextMaximumFileCharacters:1000,explainMaximumCodeCharacters:12000}).explainMaximumCodeCharacters,12000);
 assert.equal(normalizeLocalSettings({explainMaximumCodeCharacters:999999}).explainMaximumCodeCharacters,8000);
 assert.match(explanationBudget({...context,limits:{...context.limits,maximumTotalCharacters:8000}}).error!,/total context limit/);
 assert.match(explanationBudget(context,undefined,'openai','unknown').error!,/not configured/);
 const unicode=buildExplainContext(seed('#'+'🙂'.repeat(6000),{maximumCharactersPerFile:20000}));
 assert.ok(explanationBudget(unicode).totalTokens>unicode.totalCharacters);
 for(const provider of Object.keys(EXPLAIN_MODELS) as (keyof typeof EXPLAIN_MODELS)[])assert.equal(Boolean(explanationBudget(context,undefined,provider).error),provider==='deepseek');
});
test('lowered privacy settings and complete-file consent cancel before dispatch',async()=>{
 const prepared=request(seed(fixture(7999)));let calls=0;
 const make=(p:ExplanationPolicy,consent:boolean)=>new ExplanationSession({policy:async()=>p,confirm:async()=>consent,ask:async()=>{calls++;throw Error('must not dispatch');}});
 assert.equal((await make(policy,false).start('cancel',prepared)).ok,false);
 assert.equal((await make({...policy,explainMaximumCodeCharacters:500},true).start('lower',prepared)).ok,false);
 assert.equal(calls,0);
});
test('actual mocked provider payload equals preview code, metadata and ranges for all providers',async()=>{
 const prepared=request(seed(fixture(12000),{maximumCharactersPerFile:20000}));const context=prepared.contextPackage!;
 const original=globalThis.fetch;
 try{
  for(const provider of ['openai','gemini','anthropic'] as const){
   globalThis.fetch=async(_url,init)=>{
    const body=JSON.parse(String(init?.body));const prompt=body.messages?.[0]?.content ?? body.contents[0].parts[0].text;
    const data=JSON.parse(prompt.split('BEGIN UNTRUSTED SNAPSHOT AND CONVERSATION\n')[1].split('\nEND UNTRUSTED SNAPSHOT AND CONVERSATION')[0]);
    assert.deepEqual(data.items,context.items);assert.deepEqual(data.cursor,context.cursor);
    const answer=JSON.stringify({explanation:'Mock explanation.',snippet:'',reason:'Read-only.'});
    return Response.json(provider==='gemini'?{candidates:[{content:{parts:[{text:answer}]},finishReason:'STOP'}]}:provider==='anthropic'?{content:[{type:'text',text:answer}],stop_reason:'end_turn'}:{choices:[{message:{content:answer},finish_reason:'stop'}]});
   };
   await getSuggestion(provider,'synthetic-test-key',{kind:'code',fileName:'main.py',content:'',context:{mode:'explain'},projectContext:context,explanation:{question:context.intent.instruction,messages:[]}});
  }
 }finally{globalThis.fetch=original;}
});

test('retired configured alias is rejected before a provider call; no silent model migration',async()=>{
 const context=request(seed(fixture(7999))).contextPackage!;
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No calls');};
 try{await assert.rejects(()=>getSuggestion('deepseek','synthetic',{kind:'code',fileName:'main.py',content:'',context:{mode:'explain'},projectContext:context,explanation:{question:'Explain.',messages:[]}}),/support ended/);assert.equal(calls,0);}finally{globalThis.fetch=original;}
});

test('history is bounded by shared token reserve as well as character and message limits',async()=>{
 const prepared=request(seed(fixture(12000),{maximumCharactersPerFile:20000,maximumTotalCharacters:50000}));
 const sent:ObserverRequest[]=[];
 const session=new ExplanationSession({policy:async()=>({...policy,maximumCharacters:50000,explainMaximumCodeCharacters:20000,confirmCompleteFile:false}),confirm:async()=>true,ask:async(value)=>{sent.push(value);return {ok:true,value:{provider:'demo',suggestion:{explanation:sent.length===1?'中'.repeat(20000):'Mock answer.',snippet:'',reason:'Mock'}}};}});
 assert.equal((await session.start('history',prepared)).ok,true);
 const result=await session.send('history','Why?');assert.equal(result.ok,true);
 assert.equal(sent[1].explanation!.messages.length,0);assert.ok(result.ok && result.value.omitted===2);
 assert.throws(()=>buildExplainContext(seed('#'+'中'.repeat(19999),{maximumCharactersPerFile:20000})),/estimated.*tokens.*reserved response tokens/);
});
