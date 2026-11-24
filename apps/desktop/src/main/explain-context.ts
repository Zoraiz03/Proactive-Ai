import { currentImprovementFunction } from './improve-scope.ts';
import { fixSelectionRange } from '../shared/fix-code.ts';
import { offsetForPosition } from '../shared/ai-edit.ts';
import { redactContextSecrets } from '../shared/context-tray.ts';
import { projectContextCost, type ProjectContextSeed, type ProjectContextPackage } from '../shared/project-context.ts';
import { explanationBudget } from '../shared/explanation-budget.ts';
export function explainFunction(seed: ProjectContextSeed) {
 const range = currentImprovementFunction(seed);
 return range ? { range, reason: '' } : { range: null, reason: 'A complete enclosing function could not be identified reliably. Function detection supports conservative Python and JavaScript/TypeScript syntax. Select code or choose Entire active file instead.' };
}
export function buildExplainContext(seed: ProjectContextSeed): ProjectContextPackage {
 const scope = seed.explainScope ?? (seed.selectedCode ? 'selection' : 'function');
 const found = scope === 'function' ? explainFunction(seed) : null;
 if(found && !found.range) throw new Error(found.reason);
 if(scope === 'selection' && !seed.selectedCode) throw new Error('Selected code is unavailable: select code in the editor, or choose another explanation scope.');
 let range=found?.range;
 if(!range){try{range=fixSelectionRange(seed.content,scope === 'selection' ? seed.selectedCode : undefined,scope === 'selection' ? seed.selectionRange : undefined);}catch(error){throw new Error(error instanceof Error?error.message.replaceAll('Fix Code','Explain'):'Explain selection changed. Preview again.');}}
 const start=offsetForPosition(seed.content,range.start), end=offsetForPosition(seed.content,range.end);
 if(start===null || end===null) throw new Error('Explanation scope changed. Select code and preview again.');
 const code=seed.content.slice(start,end), instruction=seed.userRequest || 'Explain this code.';
 if(!code.trim()) throw new Error('The chosen explanation scope is empty. Select non-empty code.');
 if(redactContextSecrets(code).redacted || redactContextSecrets(instruction).redacted) throw new Error('Explain context contains suspected secrets. Select safe code; nothing was sent.');
 const items: ProjectContextPackage['items']=[
 {id:'explain-instruction',type:'user_instruction',priority:1,content:instruction,source:{provenance:'user'},reason:'Explicit read-only explanation instruction.',...projectContextCost(instruction),optional:false,completeFile:false,truncated:false,redacted:false},
 {id:'explain-code',type:scope==='file'?'complete_file':scope==='function'?'current_symbol':'selected_code',priority:2,content:code,source:{provenance:scope==='selection'?'editor_selection':'editor_cursor',relativePath:seed.activeRelativePath,lineStart:range.start.line,lineEnd:range.end.line},reason:`${scope==='file'?'Entire active file':scope==='function'?'Complete current function':'Exact selection'} · ${range.start.line}:${range.start.column}–${range.end.line}:${range.end.column}. Current buffer, including unsaved changes; no truncation.`,...projectContextCost(code),optional:false,completeFile:code.trim()===seed.content.trim(),truncated:false,redacted:false}
 ];
 const totalCharacters=items.reduce((n,i)=>n+i.content.length,0);
 const context:ProjectContextPackage={version:1,intent:{mode:'explain',instruction},activeFile:{relativePath:seed.activeRelativePath,fileName:seed.fileName,language:seed.language,kind:'code'},cursor:{line:seed.cursorLine,column:seed.cursorColumn},items,omitted:[],totalCharacters,estimatedTokens:Math.ceil(totalCharacters/4),limits:{maximumTotalCharacters:seed.maximumTotalCharacters,maximumRelatedFiles:0,maximumCharactersPerFile:seed.maximumCharactersPerFile},containsCompleteFile:items.some(i=>i.completeFile)};
 const budget=explanationBudget(context);if(budget.error)throw new Error(budget.error);
 return context;
}
