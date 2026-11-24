import { redactContextSecrets } from './context-tray.ts';
import type { WebHit } from './engine-context.ts';
const STOP = new Set(['the','and','for','with','from','this','that','return','const','let','var','function','class','import','export','true','false','null','undefined']);
export function retrievalTerms(values: readonly string[]): string[] {
  return [...new Set(values.flatMap(value => redactContextSecrets(value).redacted ? [] : value.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []))].filter(term=>!STOP.has(term)).slice(0,24);
}
export function rankWeb(hits: WebHit[], now: number, limit: number): WebHit[] {
  const ranked = hits.map(hit => ({ ...hit, score: hit.score * (1 + 0.5 * Math.exp(-Math.max(0,now-hit.capturedAt)/3600000/12)) }))
    .sort((a,b)=>Number(b.pinned)-Number(a.pinned) || b.score-a.score || b.capturedAt-a.capturedAt || a.id.localeCompare(b.id));
  const hosts = new Map<string,number>(); const selected: WebHit[] = [];
  for (const hit of ranked) {
    const hostname = hit.hostname.toLowerCase();
    if ((hosts.get(hostname) ?? 0)>=2) continue;
    hosts.set(hostname,(hosts.get(hostname) ?? 0)+1); selected.push(hit);
    if (selected.length>=Math.max(1,Math.min(3,limit))) break;
  }
  return selected;
}
