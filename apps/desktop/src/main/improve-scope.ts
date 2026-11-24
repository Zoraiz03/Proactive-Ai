import {javascriptFunctionRange} from '../../../../src/lib/code-function-scope.ts';
import { fixSelectionRange } from '../shared/fix-code.ts';
import { offsetForPosition, type TextRange } from '../shared/ai-edit.ts';
import type { ProjectContextSeed } from '../shared/project-context.ts';

// Mask Python strings/comments without executing or importing the user's code.
function pythonMask(source:string):string|null {
  if (/"""|'''|\\\n|\bf["']/i.test(source)) return null;
  let result='',quote='',triple=false;
  for(let i=0;i<source.length;i++) {
    const c=source[i];
    if(quote) {
      if(c==='\\') {result+=' ';if(i+1<source.length)result+=source[++i]==='\n'?'\n':' ';continue;}
      if(source.startsWith(quote.repeat(triple?3:1),i)) {const n=triple?3:1;result+=' '.repeat(n);i+=n-1;quote='';continue;}
      if(c==='\n'&&!triple)return null;
      result+=c==='\n'?'\n':' ';continue;
    }
    if(c==='#') {while(i<source.length&&source[i]!=='\n'){result+=' ';i++;}if(i<source.length)result+='\n';continue;}
    if(c==='"'||c==="'") {quote=c;triple=source.startsWith(c.repeat(3),i);const n=triple?3:1;result+='s'+' '.repeat(n-1);i+=n-1;continue;}
    result+=c;
  }
  return quote?null:result;
}
export function currentImprovementFunction(seed:ProjectContextSeed):TextRange|null {
  const source=seed.content,position={line:seed.cursorLine,column:seed.cursorColumn};
  const cursor=offsetForPosition(source,position);if(cursor===null)return null;
  if(/\.[cm]?[jt]sx?$/i.test(seed.fileName)) {
    return javascriptFunctionRange(seed.fileName,source,cursor);
  }
  if(!/\.py$/i.test(seed.fileName))return null;
  const masked=pythonMask(source);if(masked===null)return null;
  const lines=source.split('\n'),code=masked.split('\n');let best:TextRange|null=null;
  for(let start=0;start<code.length;start++) {
    const match=/^( *)(?:async\s+)?def\s+\w+\s*\(/.exec(code[start]);if(!match)continue;
    // Mixed tabs and ambiguous indentation require an explicit selection.
    if(code.some(line=>/^ *\t/.test(line)))return null;
    const indent=match[1].length;let depth=0,headerEnd=-1;
    for(let i=start;i<code.length;i++){for(const c of code[i]){if('([{'.includes(c))depth++;if(')]}'.includes(c))depth--;}if(depth<0)break;if(depth===0&&/:\s*(?:[^#]*)$/.test(code[i])){headerEnd=i;break;}}
    if(headerEnd<0)continue;
    let end=headerEnd;
    if(/:\s*$/.test(code[headerEnd])) {
      depth=0;
      for(let i=headerEnd+1;i<code.length;i++) {
        if(code[i].trim()&&depth===0&&/^ */.exec(code[i])![0].length<=indent)break;
        for(const c of code[i]){if('([{'.includes(c))depth++;if(')]}'.includes(c))depth--;}
        if(depth<0)return null;
        if(lines[i].trim())end=i;
      }
      if(depth!==0||end===headerEnd)continue;
    }
    if(position.line>=start+1&&position.line<=end+1)best={start:{line:start+1,column:1},end:{line:end+1,column:lines[end].length+1}};
  }
  return best;
}
export function resolveImproveScope(seed:ProjectContextSeed) {
  if(seed.selectedCode)return {scope:'selection' as const,range:fixSelectionRange(seed.content,seed.selectedCode,seed.selectionRange)};
  if(seed.improveFullFile===true)return {scope:'file' as const,range:fixSelectionRange(seed.content,undefined)};
  const range=currentImprovementFunction(seed);
  if(!range)throw new Error('No current function could be identified safely. Select code, or explicitly approve the active file in Improve Code controls, then preview again.');
  return {scope:'function' as const,range};
}
