import { buildFixCodeContext } from './fix-code-context.ts';
import { resolveImproveScope } from './improve-scope.ts';
import { offsetForPosition } from '../shared/ai-edit.ts';
import type { ProjectContextSeed } from '../shared/project-context.ts';
// Reuse exact, non-truncating code packaging; diagnostic/error diagnosis belongs in Fix Code.
export function buildImproveCodeContext(seed:ProjectContextSeed) {
  const resolved=resolveImproveScope(seed);
  const selected=resolved.scope==='file'?undefined:seed.content.slice(offsetForPosition(seed.content,resolved.range.start)!,offsetForPosition(seed.content,resolved.range.end)!);
  try {
    const context=buildFixCodeContext({...seed,mode:'fix_error',selectedCode:selected,selectionRange:resolved.range,diagnostic:undefined,fixDiagnostics:undefined,runError:undefined,fixRunEvidence:undefined,userRequest:seed.userRequest||'Propose one worthwhile behavior-preserving improvement, or explain why no change is justified.'});
    context.intent.mode='improve_code';
    for(const item of context.items){item.reason=item.reason.replaceAll('Fix Code','Improve Code');if(item.type==='selected_code')item.reason=`Exact ${resolved.scope} at ${resolved.range.start.line}:${resolved.range.start.column}–${resolved.range.end.line}:${resolved.range.end.column}; edits must remain in this scope.`;}
    return context;
  } catch(error){throw new Error((error instanceof Error?error.message:'Context preparation failed.').replaceAll('Fix Code','Improve Code'));}
}
