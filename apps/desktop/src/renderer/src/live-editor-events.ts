import type { LiveEdit } from '../../shared/live-observer';

/** Content events alone schedule a snapshot; the microtask runs after Monaco updates its cursor. */
export function createLiveEditReporter(read: () => Omit<LiveEdit, 'previousContent'> | null, emit: (edit: LiveEdit) => void, defer: (callback: () => void) => void = queueMicrotask) {
 let pending: { relativePath: string; previousContent: string } | null = null;
 let generation = 0;
 return {
  changed(relativePath: string, previousContent: string) {
   if (pending?.relativePath === relativePath) return;
   const token = ++generation;
   pending = { relativePath, previousContent };
   defer(() => {
    if (token !== generation || !pending) return;
    const base = pending; pending = null;
    const latest = read();
    if (latest?.relativePath === base.relativePath && latest.content !== base.previousContent) emit({ ...latest, previousContent: base.previousContent });
   });
  },
  cancel() { generation++; pending = null; },
 };
}

/** Shared by the real renderer and deterministic tests; known reviews beat generic dialog DOM. */
export function liveBlockReason(flags: {
 settingsLoaded: boolean; observerEnabled: boolean; workspaceUnavailable: boolean;
 reviewOpen: boolean; dialogOpen: boolean; manualBusy: boolean; automaticBusy: boolean; fileUnavailable: boolean;
}): import('../../shared/live-observer').LiveBlockReason | undefined {
 if (!flags.settingsLoaded) return 'settings';
 if (!flags.observerEnabled) return 'privacy';
 if (flags.workspaceUnavailable) return 'workspace';
 if (flags.reviewOpen) return 'review';
 if (flags.dialogOpen) return 'dialog';
 if (flags.manualBusy) return 'manual';
 if (flags.automaticBusy) return 'automatic';
 if (flags.fileUnavailable) return 'file';
 return undefined;
}
