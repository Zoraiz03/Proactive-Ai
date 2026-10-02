import type { editor } from 'monaco-editor';
import { createEditCapture, registerMemoryFlush, takeMemoryOrigin } from './edit-capture';

/** One capture session per mounted editor. Content only crosses the narrow memory bridge. */
export function attachEditorMemory(instance: editor.IStandaloneCodeEditor, workspace: () => string | undefined, path: () => string | null) {
  const sessionId = crypto.randomUUID();
  let workspaceId = workspace(), enabled = false, previous = instance.getValue();
  const capture = createEditCapture({
    begin: (path, content) => { if (workspaceId && enabled) void window.engine.beginBuffer({ workspaceId, sessionId, path, content }).then(result => { if (!result.ok) capture.reset(); }).catch(() => capture.reset()); },
    send: batch => { if (workspaceId && enabled) window.engine.memoryEdits({ workspaceId, sessionId, batch }); },
  });
  const stopStatus = window.engine.onMemoryStatus(event => {
    if (event.workspaceId !== workspace()) return;
    if (!event.result.ok || event.result.value.paused || workspaceId !== workspace()) capture.reset();
    workspaceId = workspace(); enabled = event.result.ok && event.result.value.open && !event.result.value.paused;
  });
  if (workspaceId) void window.engine.memoryStatus({ workspaceId }).then(result => {
    enabled = workspaceId === workspace() && result.ok && result.value.open && !result.value.paused;
  });
  const content = instance.onDidChangeModelContent(event => {
    const next = instance.getValue(), file = path();
    const origin = file ? takeMemoryOrigin(file) : undefined;
    if (workspaceId !== workspace()) { capture.reset(); workspaceId = workspace(); enabled = false; }
    if (enabled && file) capture.change(file, previous, event.isFlush ? {
      ...event, changes: [{ rangeOffset: 0, rangeLength: previous.length, text: next }],
    } : event, origin ?? (event.isFlush ? 'external' : undefined));
    previous = next;
  });
  const model = instance.onDidChangeModel(() => { capture.flush(); previous = instance.getValue(); });
  const blur = instance.onDidBlurEditorText(capture.flush);
  const unregister = registerMemoryFlush(capture.flush);
  window.addEventListener('blur', capture.flush);
  window.addEventListener('beforeunload', capture.flush);
  return { dispose() {
    capture.flush(); capture.reset(); stopStatus(); unregister(); content.dispose(); model.dispose(); blur.dispose();
    window.removeEventListener('blur', capture.flush); window.removeEventListener('beforeunload', capture.flush);
  } };
}
