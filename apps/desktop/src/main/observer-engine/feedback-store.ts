import type Database from 'better-sqlite3';
import { acceptedStyle, feedbackText, validManifest, type MemorySuggestion, type SuggestionOutcome, type FeedbackEntry } from '../../shared/feedback-memory.ts';
import { redactContextSecrets } from '../../shared/context-tray.ts';

export function storeSuggestion(db: Database.Database, row: MemorySuggestion, now: number) {
  if (!/^[\w-]{1,128}$/.test(row.id) || !['continuation','correction','next_step','create_file','doc_sync'].includes(row.kind) ||
    !['pause','manual'].includes(row.triggerReason) || typeof row.explanation!=='string' || row.explanation.length>600 || typeof row.reason!=='string' || row.reason.length>300 ||
    (row.proposedText!==undefined && (typeof row.proposedText!=='string' || row.proposedText.length>20000)) || !validManifest(row.manifest) ||
    redactContextSecrets([row.path,row.explanation,row.reason,row.proposedText??''].join('\n')).redacted) throw new Error('invalid_memory_suggestion');
  // Feedback needs the explanation and observed style, not another copy of the proposed file content.
  db.prepare(`INSERT INTO suggestions(id,ts,path,kind,trigger_reason,manifest_json,result_json,chars_sent,outcome)
    VALUES(?,?,?,?,?,?,?,?,'shown')`).run(row.id,now,row.path,row.kind,row.triggerReason,JSON.stringify(row.manifest),
      JSON.stringify({ explanation:row.explanation,reason:row.reason,style:row.proposedText?acceptedStyle(row.proposedText):'' }),row.manifest.totalChars);
}
export function storeOutcome(db: Database.Database, id: string, outcome: SuggestionOutcome, now: number) {
  if (!/^[\w-]{1,128}$/.test(id) || !['shown','accepted','dismissed','ignored','failed'].includes(outcome)) throw new Error('invalid_memory_outcome');
  db.prepare('UPDATE suggestions SET outcome=?,outcome_ts=? WHERE id=?').run(outcome,now,id);
}
export function readFeedback(db: Database.Database, allowed: (path: string)=>boolean): string {
  const entries: FeedbackEntry[] = [];
  const rows = db.prepare("SELECT id,path,result_json,outcome,coalesce(outcome_ts,ts) ts FROM suggestions WHERE outcome IN ('accepted','dismissed') ORDER BY coalesce(outcome_ts,ts) DESC,rowid DESC LIMIT 200").all() as {id:string;path:string;result_json:string;outcome:SuggestionOutcome;ts:number}[];
  for (const row of rows) {
    if (!row.path || !allowed(row.path)) continue;
    try {
      const result = JSON.parse(row.result_json) as Record<string,unknown>;
      if (typeof result.explanation!=='string' || typeof result.style!=='string' || result.explanation.length>600 || result.style.length>100) continue;
      entries.push({id:row.id,outcome:row.outcome,ts:row.ts,explanation:result.explanation,style:result.style});
    } catch { /* Unreadable legacy feedback is omitted, never guessed. */ }
  }
  return feedbackText(entries);
}
