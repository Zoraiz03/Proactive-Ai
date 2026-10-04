// Optional real-provider evaluation. Uses synthetic fixtures only; never logs credentials.
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildLiveProjectRequest } from '../apps/desktop/src/main/live-observer.ts';
import { ProjectContextEngine } from '../apps/desktop/src/main/project-context.ts';
import { validateAndBuildProposedEdit } from '../apps/desktop/src/shared/ai-edit.ts';
import { ProjectContextSchema } from '../src/lib/server/project-context.ts';
import { getSuggestion } from '../src/lib/server/providers.ts';
if (process.env.OBSERVER_ENV_FILE) process.loadEnvFile(process.env.OBSERVER_ENV_FILE);
if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required for this optional evaluation.');
const fixtures = [
 {name:'prime.py',content:'def is_prime(n):\n    if n < 2:\n        return False\n    for divisor in range(2, int(n ** 0.5) + 1):\n        ',line:5,column:9},
 {name:'prime.c',content:'#include <stdio.h>\n\nint is_prime(int n) {\n    if (n < 2) return 0;\n    for (int divisor = 2; divisor * divisor <= n; divisor++) {\n        \n    }\n}\n',line:6,column:9},
 {name:'large.py',content:'from helpers import normalize_limit\n'+'# Project context: return primes up to an inclusive upper bound.\n'.repeat(460)+'\ndef primes_up_to(limit):\n    limit = normalize_limit(limit)\n    primes = []\n    for candidate in range(2, limit + 1):\n        ',line:467,column:9},
];
const root=await mkdtemp(join(tmpdir(),'live-real-eval-'));
try{
 await writeFile(join(root,'helpers.py'),'def normalize_limit(value):\n    return max(0, int(value))\n');
 const engine=new ProjectContextEngine();engine.setWorkspace(root);
 for(const fixture of fixtures.filter(f => !process.env.OBSERVER_EVAL_FIXTURE || f.name === process.env.OBSERVER_EVAL_FIXTURE)){
  await writeFile(join(root,fixture.name),fixture.content);
  const request=await buildLiveProjectRequest({relativePath:fixture.name,content:fixture.content,previousContent:'',line:fixture.content.split('\n').length-(fixture.name.endsWith('.c')?3:0),column:fixture.column,diagnostics:[]},'gemini',{observerEnabled:true,includeDiagnostics:true,confirmCompleteFile:false,exclusions:[],maximumCharacters:50000,maximumFileCharacters:8000,maximumRelatedFiles:4},engine);
  const started=Date.now();
  const transport=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
   const response=await transport(input,{...init,signal:AbortSignal.timeout(60000)});
   if(process.env.OBSERVER_EVAL_OUTPUT) {
    const data=await response.clone().json();
    await writeFile(join(process.env.OBSERVER_EVAL_OUTPUT,fixture.name+'.response.json'),JSON.stringify(data));
   }
   return response;
  };
  try{
   const suggestion=await getSuggestion('gemini',process.env.GEMINI_API_KEY,{liveObserver:true,fileName:request.fileName,kind:'code',content:'',context:{mode:'improve_code'},projectContext:ProjectContextSchema.parse(request.contextPackage),editBase:request.editBase});
   const result=suggestion.edit?validateAndBuildProposedEdit(suggestion.edit,request.editBase!,fixture.content,request.editBase!.originalContentHash):null;
   console.log(JSON.stringify({fixture:fixture.name,characters:fixture.content.length,contextCharacters:request.contextPackage!.totalCharacters,elapsedMs:Date.now()-started,validEdit:result?.ok??false,explanation:suggestion.explanation,validation:result&&!result.ok?result.message:undefined,replacement:suggestion.edit?.replacementText}));
   if(result?.ok&&process.env.OBSERVER_EVAL_OUTPUT) await writeFile(join(process.env.OBSERVER_EVAL_OUTPUT,fixture.name),result.value.proposedContent);
  }catch(error){console.log(JSON.stringify({fixture:fixture.name,error:error instanceof Error?error.message:'Provider failed'}));}finally{globalThis.fetch=transport;}
 }
}finally{await rm(root,{recursive:true,force:true});}
