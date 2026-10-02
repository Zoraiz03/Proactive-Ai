import { applyDelta, journalHash } from '../../../shared/edit-journal.ts';
import type { EditBatch, EditDelta, EditOrigin } from '../../../shared/observer-engine';

export interface ContentEvent {
  changes: readonly { rangeOffset: number; rangeLength: number; text: string }[];
  isUndoing?: boolean; isRedoing?: boolean; isFlush?: boolean;
}

export function createEditCapture(deps: {
  begin: (path: string, content: string) => void;
  send: (batch: EditBatch) => void;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  let path = '', text = '', baseHash = '', sequence = 0, events = 0;
  let pending: EditDelta[] = [], timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { if (timer !== undefined) (deps.cancel ?? clearTimeout)(timer); timer = undefined; };
  const flush = () => {
    cancel();
    if (pending.length) { deps.send({ path, deltas: pending, clientSeq: ++sequence, expectedBaseHash: baseHash }); pending = []; }
    baseHash = journalHash(text); events = 0;
  };
  const reset = () => { cancel(); pending = []; path = ''; text = ''; events = 0; };
  return {
    flush, reset,
    change(nextPath: string, previous: string, event: ContentEvent, explicitOrigin?: EditOrigin) {
      if (path !== nextPath || text !== previous || event.isFlush) {
        flush(); path = nextPath; text = previous; baseHash = journalHash(text); deps.begin(path, text);
      }
      const changes = [...event.changes].sort((a,b) => b.rangeOffset - a.rangeOffset);
      // Monaco offsets refer to the pre-event document: apply from right to left.
      for (const change of changes) {
        const origin = event.isUndoing || event.isRedoing ? 'undo_redo' : explicitOrigin ??
          (changes.length === 1 && change.rangeLength === 0 && (change.text.length > 20 || change.text.includes('\n')) ? 'paste' : 'typing');
        const pieces = Math.max(1, Math.ceil(change.text.length / 20000));
        for (let piece = 0; piece < pieces; piece++) {
          const delta: EditDelta = { path, offset: change.rangeOffset + piece * 20000,
            removedLen: piece === 0 ? change.rangeLength : 0, inserted: change.text.slice(piece*20000,(piece+1)*20000),
            origin, ts: Math.floor((deps.now ?? Date.now)()/1000)*1000 };
          if (pending.length >= 20 || new TextEncoder().encode(JSON.stringify([...pending,delta])).length > 180000) flush();
          const last = pending.at(-1);
          if (last && origin === 'typing' && last.origin === origin && !last.removedLen && !delta.removedLen &&
            last.offset + last.inserted.length === delta.offset && last.inserted.length + delta.inserted.length <= 20000) last.inserted += delta.inserted;
          else pending.push(delta);
          text = applyDelta(text, delta);
        }
      }
      if (++events >= 20) flush();
      else { cancel(); timer = (deps.schedule ?? setTimeout)(flush,250); }
    },
  };
}

const flushers = new Set<() => void>();
const origins = new Map<string, EditOrigin>();
export function registerMemoryFlush(flush: () => void) { flushers.add(flush); return () => { flushers.delete(flush); }; }
export function flushMemoryCapture() { for (const flush of flushers) flush(); }
export function markMemoryOrigin(path: string, origin: EditOrigin) { origins.set(path,origin); }
export function takeMemoryOrigin(path: string) { const origin = origins.get(path); origins.delete(path); return origin; }
