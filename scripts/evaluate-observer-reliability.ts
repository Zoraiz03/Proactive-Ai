// Opt-in real Gemini evaluation. Sends only the selected fixtures/file to the configured
// provider, never switches providers, never logs code/keys or writes to the user's file.
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {student253,studentFixtures,behavioralAssertions} from './fixtures/observer-students.ts';
import {ProjectContextEngine} from '../apps/desktop/src/main/project-context.ts';
import {buildLiveProjectRequest} from '../apps/desktop/src/main/live-observer.ts';
import {getSuggestion,ProviderError} from '../src/lib/server/providers.ts';
import {ProjectContextSchema} from '../src/lib/server/project-context.ts';
import {validateAndBuildProposedEdit} from '../apps/desktop/src/shared/ai-edit.ts';
import {fixSelectionRange} from '../apps/desktop/src/shared/fix-code.ts';
const key=process.env.GEMINI_API_KEY;
if(!key)throw Error('GEMINI_API_KEY required; load with node --env-file=.env.local.');
const root=await mkdtemp(join(tmpdir(),'observer-real-evaluation-'));
const records:Record<string,unknown>[]=[];
const report=(record:Record<string,unknown>)=>{records.push(record);console.log(JSON.stringify(record));};
try{
 const start=performance.now();
 try{
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash',{headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(15000)});
  const data=await response.json();
  report({stage:'model_availability',provider:'gemini',model:'gemini-3.5-flash',httpStatus:response.status,elapsedMs:Math.round(performance.now()-start),inputTokenLimit:data.inputTokenLimit,outputTokenLimit:data.outputTokenLimit});
 }catch{report({stage:'model_availability',outcome:'network_or_timeout',elapsedMs:Math.round(performance.now()-start)});}
 const engine=new ProjectContextEngine();engine.setWorkspace(root);
 const cases:{name:string;content:string;line:number;mode:'live'|'explain'|'fix';expected?:string}[]=studentFixtures.map(f=>({...f,mode:'live'}));
 cases.push({name:'representative-student',content:student253,line:7,mode:'explain'});
 cases.push({name:'representative-student',content:studentFixtures[2].content,line:7,mode:'fix'});
 if(process.env.OBSERVER_STUDENT_FILE){
  const content=await readFile(process.env.OBSERVER_STUDENT_FILE,'utf8');
  for(const mode of ['explain','fix','live'] as const)cases.push({name:'actual-student-file',content,line:Math.max(1,content.split('\n').length-5),mode});
 }
 for(const fixture of cases.filter(f=>!process.env.OBSERVER_EVAL_CASE||(process.env.OBSERVER_EVAL_CASE==='manual'?f.mode!=='live':`${f.name}:${f.mode}`===process.env.OBSERVER_EVAL_CASE))){
  await writeFile(join(root,'main.py'),fixture.content);
  const prep=performance.now();
  const policy={observerEnabled:true,includeDiagnostics:true,confirmCompleteFile:false,exclusions:[],maximumCharacters:50000,maximumFileCharacters:8000,maximumRelatedFiles:4};
  const live=await buildLiveProjectRequest({relativePath:'main.py',content:fixture.content,previousContent:'',line:fixture.line,column:1,diagnostics:[]},'gemini',policy,engine);
  const context=fixture.mode==='live'?live.contextPackage!:await engine.build({mode:fixture.mode==='explain'?'explain':'fix_error',kind:'code',activeRelativePath:'main.py',fileName:'main.py',language:'python',content:fixture.content,selectedCode:fixture.content,cursorLine:fixture.line,cursorColumn:1,exclusions:[],maximumTotalCharacters:50000,maximumRelatedFiles:4,maximumCharactersPerFile:8000});
  const contextMs=Math.round(performance.now()-prep),sent=performance.now();
  try{
   const suggestion=await getSuggestion('gemini',key,{fileName:'main.py',kind:'code',content:'',context:{mode:fixture.mode==='explain'?'explain':fixture.mode==='fix'?'fix_error':'improve_code'},projectContext:ProjectContextSchema.parse(context),...(fixture.mode!=='explain'?{editBase:live.editBase}:{}),...(fixture.mode==='live'?{liveObserver:true}:{}),...(fixture.mode==='explain'?{explanation:{question:'Explain this complete student-management program, including unfinished parts.',messages:[]}}:{}),...(fixture.mode==='fix'?{fixCode:{scope:'selection' as const,range:fixSelectionRange(fixture.content,fixture.content),clarifications:[]}}:{})});
   const providerMs=Math.round(performance.now()-sent);
   const checked=suggestion.edit?validateAndBuildProposedEdit(suggestion.edit,live.editBase!,fixture.content,createHash('sha256').update(fixture.content).digest('hex')):null;
   let behaviorPassed:boolean|undefined;
   if(checked?.ok){
    const result=spawnSync('python3',['-I','-c',checked.value.proposedContent+behavioralAssertions],{cwd:root,encoding:'utf8',timeout:5000,maxBuffer:100000});
    behaviorPassed=result.status===0;
   }
   const outcome=checked?checked.ok?'correction':'invalid_edit':suggestion.explanation==='NO_SUGGESTION'?'no_suggestion':suggestion.fixOutcome??(fixture.mode==='explain'?'explanation':'clarification');
   report({fixture:fixture.name,mode:fixture.mode,transport:'real_provider',characters:fixture.content.length,lines:fixture.content.split('\n').length,contextCharacters:context.totalCharacters,contextMs,providerMs,outcome,validEdit:checked?.ok,behaviorPassed,replacementCharacters:suggestion.edit?.replacementText.length,expected:fixture.expected,expectationMet:fixture.expected==='correction'?checked?.ok&&behaviorPassed:fixture.expected==='no_suggestion'?outcome==='no_suggestion':undefined});
  }catch(error){report({fixture:fixture.name,mode:fixture.mode,transport:'real_provider',contextMs,providerMs:Math.round(performance.now()-sent),outcome:error instanceof ProviderError?error.message:error instanceof Error?error.name:'error'});}
 }
 if(process.env.OBSERVER_EVAL_REPORT)await writeFile(process.env.OBSERVER_EVAL_REPORT,JSON.stringify(records,null,2)+'\n');
}finally{await rm(root,{recursive:true,force:true});}
