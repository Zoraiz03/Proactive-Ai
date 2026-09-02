import { validateWebContext, type ChromeSelectedTextContext } from "./web-context.ts";

export const PENDING_CAPTURE_KEY = "pendingSelectedTextCapture";
export const PENDING_CAPTURE_RETENTION_MS = 30 * 60 * 1000;

export interface LocalStorageArea {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string): Promise<void>;
}

export async function savePendingCapture(storage: LocalStorageArea, capture: ChromeSelectedTextContext): Promise<void> {
  const valid = validateWebContext(capture);
  if (!valid) throw new Error("The selected-text capture is invalid.");
  await storage.set({ [PENDING_CAPTURE_KEY]: valid });
}

export async function loadPendingCapture(storage: LocalStorageArea, now = Date.now()): Promise<ChromeSelectedTextContext | null> {
  const result = await storage.get(PENDING_CAPTURE_KEY);
  const capture = validateWebContext(result[PENDING_CAPTURE_KEY]);
  if (!capture || now - capture.capturedAt > PENDING_CAPTURE_RETENTION_MS || capture.capturedAt > now + 60_000) {
    await storage.remove(PENDING_CAPTURE_KEY);
    return null;
  }
  return capture;
}

export async function clearPendingCapture(storage: LocalStorageArea): Promise<void> {
  await storage.remove(PENDING_CAPTURE_KEY);
}
