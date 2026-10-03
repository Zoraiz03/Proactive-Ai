import { applyDelta, journalHash } from './edit-journal.ts';
import { redactContextSecrets } from './context-tray.ts';
import type { JournalRow } from './observer-engine.ts';
import type { EditBurst } from './engine-context.ts';

/** Replay offsets against each retained baseline version before computing line ranges. */
export function editBursts(path: string, baselines: ReadonlyMap<number,string>, rows: readonly JournalRow[], limit = 6): EditBurst[] {
  const texts = new Map(baselines), bursts: EditBurst[] = []; let previousSeq = -1;
  for (const text of texts.values()) if (redactContextSecrets(text).redacted) throw new Error('memory_secret');
  for (const row of rows) {
    if (row.path!==path || row.seq<=previousSeq || !Number.isFinite(row.ts)) throw new Error('memory_burst_order');
    previousSeq=row.seq;
    const text = texts.get(row.base_ver); if (text===undefined) throw new Error('memory_burst_baseline');
    const next = applyDelta(text,{offset:row.offset,removedLen:row.removed_len,inserted:row.inserted});
    if (redactContextSecrets(next).redacted || redactContextSecrets(row.removed_text ?? '').redacted) throw new Error('memory_secret');
    if (row.post_hash && journalHash(next)!==row.post_hash) throw new Error('memory_burst_hash');
    texts.set(row.base_ver,next);
    const ts = Math.floor(row.ts/1000), line = text.slice(0,row.offset).split('\n').length;
    const end = line + (row.inserted.match(/\n/g)?.length ?? 0), previous = bursts.at(-1);
    if (previous && ts>=previous.endTs && ts-previous.endTs<=20) {
      previous.endTs=ts; previous.addedLines=[Math.min(previous.addedLines[0],line),Math.max(previous.addedLines[1],end)];
      previous.addedChars+=row.inserted.length; previous.removedChars+=row.removed_len;
      previous.preview=(previous.preview+row.inserted).slice(0,200);
    } else bursts.push({ path,startTs:ts,endTs:ts,addedLines:[line,end],addedChars:row.inserted.length,removedChars:row.removed_len,preview:row.inserted.slice(0,200) });
  }
  return bursts.slice(-Math.max(1,Math.min(6,Math.floor(limit)||6)));
}
