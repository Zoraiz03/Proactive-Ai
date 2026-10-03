import type { MemoryDatabase } from './database.ts';
import type { ChunkHit, WebHit } from '../../shared/engine-context.ts';
import { rankWeb, retrievalTerms } from '../../shared/context-ranking.ts';
import { redactContextSecrets } from '../../shared/context-tray.ts';
import { journalHash } from '../../shared/edit-journal.ts';

const match = (terms: string[]) => terms.map(term=>`"${term}"`).join(' OR ');
const patterns = (terms: string[]) => terms.map(term=>`%${term.replace(/[_%\\]/g,'\\$&')}%`);
export function retrieveChunks(memory: MemoryDatabase, input: string[], limit: number, excludePath?: string): ChunkHit[] {
  const terms = retrievalTerms(input); if (!terms.length) return [];
  const predicate = terms.map(()=>"lower(c.text) LIKE ? ESCAPE '\\'").join(' OR ');
  const rows = memory.searchMode === 'fts5' ? memory.db.prepare(`SELECT c.*,bm25(chunks_fts) rank FROM chunks_fts
    JOIN chunks c ON c.id=chunks_fts.rowid JOIN files f ON f.path=c.path
    WHERE chunks_fts MATCH ? AND f.excluded=0 AND f.secret_flagged=0 AND f.deleted=0 AND c.path<>?
    ORDER BY rank,c.path,c.chunk_idx LIMIT 200`).all(match(terms),excludePath ?? '') :
    memory.db.prepare(`SELECT c.*,0 rank FROM chunks c JOIN files f ON f.path=c.path WHERE (${predicate})
      AND f.excluded=0 AND f.secret_flagged=0 AND f.deleted=0 AND c.path<>? ORDER BY c.path,c.chunk_idx LIMIT 1000`).all(...patterns(terms),excludePath ?? '');
  return (rows as { path:string; text:string; line_start:number; line_end:number; rank:number }[]).map(row=>({ path:row.path,text:row.text,lineStart:row.line_start,lineEnd:row.line_end,
    score:memory.searchMode==='fts5' ? Math.max(Number.EPSILON,-row.rank) : terms.filter(term=>row.text.toLowerCase().includes(term)).length }))
    .sort((a,b)=>b.score-a.score || a.path.localeCompare(b.path) || a.lineStart-b.lineStart).slice(0,Math.max(1,Math.min(50,limit)));
}
export function retrieveWeb(memory: MemoryDatabase, input: string[], now: number, limit: number): WebHit[] {
  const terms = retrievalTerms(input);
  const predicate = terms.length ? terms.map(()=>"lower(title || ' ' || text) LIKE ? ESCAPE '\\'").join(' OR ') : '0';
  const rows = memory.searchMode==='fts5' && terms.length ? memory.db.prepare(`SELECT w.*,coalesce(h.rank,0) rank FROM web_captures w LEFT JOIN
    (SELECT rowid,bm25(web_fts) rank FROM web_fts WHERE web_fts MATCH ?) h ON h.rowid=w.rowid
    WHERE expires_at>? AND (h.rowid IS NOT NULL OR pinned=1) ORDER BY pinned DESC,rank,captured_at DESC LIMIT 1000`).all(match(terms),now) :
    memory.db.prepare(`SELECT *,0 rank FROM web_captures WHERE expires_at>? AND (pinned=1 OR (${predicate})) ORDER BY pinned DESC,captured_at DESC LIMIT 1000`).all(now,...patterns(terms));
  const hits: WebHit[] = [];
  for (const row of rows as {id:string;text:string;title:string;url:string;hostname:string;captured_at:number;pinned:number;rank:number;content_hash:string}[]) {
    // Re-screen the whole stored item before snippet truncation, including metadata.
    if (redactContextSecrets([row.text,row.title,row.url,row.hostname].join('\n')).redacted || journalHash(row.text)!==row.content_hash) continue;
    try {
      const url = new URL(row.url);
      if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.hostname!==row.hostname.toLowerCase()) continue;
      url.search=''; url.hash='';
      hits.push({ id:row.id,text:row.text,title:row.title.slice(0,160),hostname:url.hostname,url:url.toString(),capturedAt:row.captured_at,pinned:row.pinned===1,
        score: memory.searchMode==='fts5' ? Math.max(1e-6,-row.rank) : Math.max(1,terms.filter(term=>(row.title+' '+row.text).toLowerCase().includes(term)).length) });
    } catch { /* Invalid or credential-bearing URLs never become context. */ }
  }
  return rankWeb(hits,now,limit);
}
