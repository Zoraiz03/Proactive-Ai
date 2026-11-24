// Uses the workspace's existing TypeScript compiler API; parsing only, never execution.
import ts from 'typescript';
export function javascriptFunctionRange(fileName:string,source:string,cursor:number) {
    const file=ts.createSourceFile(fileName,source,ts.ScriptTarget.Latest,true);
    if((file as ts.SourceFile & {parseDiagnostics:readonly ts.Diagnostic[]}).parseDiagnostics.length)return null;
    let best:ts.Node|undefined;
    const visit=(node:ts.Node)=>{if(node.getStart(file)<=cursor&&cursor<=node.end){if(ts.isFunctionDeclaration(node)||ts.isFunctionExpression(node)||ts.isArrowFunction(node)||ts.isMethodDeclaration(node)||ts.isGetAccessorDeclaration(node)||ts.isSetAccessorDeclaration(node)){if(node.body)best=node;}ts.forEachChild(node,visit);}};
    visit(file);if(!best)return null;
    const start=file.getLineAndCharacterOfPosition(best.getStart(file)),end=file.getLineAndCharacterOfPosition(best.end);
    return {start:{line:start.line+1,column:start.character+1},end:{line:end.line+1,column:end.character+1}};
}
