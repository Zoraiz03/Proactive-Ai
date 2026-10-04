import { createHash } from 'node:crypto';
import { FIX_CODE_LIMITS, fixSelectionRange } from '../shared/fix-code.ts';
import { projectContextCost, type ProjectContextSeed, type ProjectContextPackage, type ProjectContextItem } from '../shared/project-context.ts';
import { redactContextSecrets } from '../shared/context-tray.ts';
export function buildFixCodeContext(seed: ProjectContextSeed): ProjectContextPackage {
    const range = fixSelectionRange(seed.content, seed.selectedCode, seed.selectionRange);
    const code = seed.selectedCode || seed.content;
    const instruction = seed.userRequest || 'Review this code for a justified correction; ask if essential intent is missing.';
    const maximum = Math.min(FIX_CODE_LIMITS.codeCharacters, seed.maximumTotalCharacters - instruction.length);
    if (!code.trim())
        throw new Error('Select or open non-empty code to review.');
    if (code.length > maximum)
        throw new Error(`Fix Code ${seed.selectedCode ? 'selection' : 'entire file'} exceeds the ${maximum}-character limit. Select a smaller section; no code was sent or truncated.`);
    if (redactContextSecrets(code).redacted || redactContextSecrets(instruction).redacted)
        throw new Error('Fix Code context contains suspected secrets. Remove sensitive material or select safe code. Nothing was sent.');
    const items: ProjectContextItem[] = [];
    const omitted: ProjectContextPackage['omitted'] = [];
    const add = (type: ProjectContextItem['type'], content: string, reason: string, start?: number, end?: number, optional = false, completeFile = false) => {
        if (!content.trim())
            return;
        if (redactContextSecrets(content).redacted) {
            if (!optional)
                throw new Error('Fix Code context contains suspected secrets. Nothing was sent.');
            omitted.push({ type, reason: 'Evidence omitted because it contains suspected secrets.' });
            return;
        }
        if (items.reduce((n, i) => n + i.content.length, 0) + content.length > seed.maximumTotalCharacters) {
            omitted.push({ type, reason: 'Optional evidence omitted to preserve the exact code scope within your context limit.' });
            return;
        }
        items.push({ id: `fix-${items.length}`, type, priority: items.length ? 2 : 1, content, reason, source: { provenance: type === 'user_instruction' ? 'user' : type === 'diagnostic' ? 'diagnostics' : type === 'terminal_error' ? 'run_output' : 'editor_selection', ...(type !== 'user_instruction' ? { relativePath: seed.activeRelativePath } : {}), ...(start ? { lineStart: start, lineEnd: end ?? start } : {}) }, ...projectContextCost(content), optional, completeFile, truncated: false, redacted: false });
    };
    add('user_instruction', instruction, 'User-stated expected behavior/problem; no inferred requirements.');
    add(seed.selectedCode ? 'selected_code' : 'complete_file', code, seed.selectedCode ? 'Exact selected code; edits outside this range are prohibited.' : 'Entire active buffer, including unsaved changes; no truncation.', range.start.line, range.end.line, false, code === seed.content);
    if (seed.selectedCode) {
        const lines = seed.content.split('\n'), start = Math.max(0, range.start.line - 4), end = Math.min(lines.length, range.end.line + 3);
        const nearby = lines.slice(start, end).join('\n');
        if (nearby.length <= Math.min(FIX_CODE_LIMITS.surroundingCharacters, seed.maximumCharactersPerFile) && nearby !== code)
            add('nearby_code', nearby, 'Bounded surrounding context, read-only; it does not broaden the editable selection.', start + 1, end, true, nearby === seed.content);
        else if (nearby !== code)
            omitted.push({ type: 'nearby_code', reason: 'Surrounding lines exceeded the bounded context limit; only the exact selection is reviewed.' });
    }
    for (const d of (seed.fixDiagnostics ?? (seed.diagnostic ? [seed.diagnostic] : [])).filter(d => !seed.selectedCode || (d.line >= range.start.line && d.line <= range.end.line)).slice(0, 3))
        add('diagnostic', `${d.line}:${d.column}: ${d.message.slice(0, 1000)}`, 'Supplied diagnostic; confirm its relevance to the current code. Not proof of a runtime failure.', d.line, d.line, true);
    const runEvidence = seed.fixRunEvidence ?? (seed.runError ? { output: seed.runError, sourceHash: undefined, sourceUnchanged: false } : undefined);
    if (runEvidence) {
        const current = createHash('sha256').update(seed.content).digest('hex');
        const stale = runEvidence.sourceHash !== current || !runEvidence.sourceUnchanged;
        add('terminal_error', `${stale ? 'STALE / VERSION UNCONFIRMED: this error is not evidence of a failure in the current buffer.' : 'Latest applicable failed run; source matched at launch and completion.'}\n${runEvidence.output.slice(-FIX_CODE_LIMITS.evidenceCharacters)}`, stale ? 'Run evidence is from an older or unconfirmed snapshot.' : 'Latest failed run for this source snapshot.', undefined, undefined, true);
    }
    const totalCharacters = items.reduce((n, i) => n + i.content.length, 0);
    return { version: 1, intent: { mode: 'fix_error', instruction }, activeFile: { relativePath: seed.activeRelativePath, fileName: seed.fileName, language: seed.language, kind: 'code' }, cursor: { line: seed.cursorLine, column: seed.cursorColumn }, items, omitted, totalCharacters, estimatedTokens: Math.ceil(totalCharacters / 4), limits: { maximumTotalCharacters: seed.maximumTotalCharacters, maximumRelatedFiles: 0, maximumCharactersPerFile: seed.maximumCharactersPerFile }, containsCompleteFile: items.some(i => i.completeFile) };
}
