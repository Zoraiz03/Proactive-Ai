import type { ChromeSelectedTextContext } from "./web-context.ts";

const BRIDGE_ORIGIN_PERMISSION = "http://127.0.0.1/*";
const PORT = 32145 as const;
const SESSION_KEY = "proactiveDesktopPairing";

interface PairingSession { token: string; expiresAt: number; port: number }
export interface BridgeStatus { paired: boolean; message: string }
export interface SendResult { ok: boolean; message: string; redacted?: boolean; truncated?: boolean }

const validSession = (value: unknown, now = Date.now()): PairingSession | null => {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<PairingSession>;
  return typeof item.token === "string" && /^[A-Za-z0-9_-]{40,60}$/.test(item.token) && Number.isInteger(item.expiresAt) && item.expiresAt! > now && item.port === PORT ? item as PairingSession : null;
};

async function loadSession(): Promise<PairingSession | null> {
  const stored = await chrome.storage.session.get(SESSION_KEY);
  const session = validSession(stored[SESSION_KEY]);
  if (!session) await chrome.storage.session.remove(SESSION_KEY);
  return session;
}

export async function bridgeStatus(): Promise<BridgeStatus> {
  return await loadSession() ? { paired: true, message: "Connected for this browser session." } : { paired: false, message: "Enter the 8-digit code shown in the IDE Context Tray." };
}

const post = async (port: number, path: string, body: unknown, token?: string) => {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 1_500);
  try {
    return await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), cache: "no-store", signal: controller.signal });
  } finally { clearTimeout(timeout); }
};

export async function pairDesktop(code: string): Promise<BridgeStatus> {
  if (!/^\d{8}$/.test(code)) throw new Error("Enter the 8-digit pairing code from the IDE.");
  const allowed = await chrome.permissions.request({ origins: [BRIDGE_ORIGIN_PERMISSION] });
  if (!allowed) throw new Error("Local IDE access was not granted.");
  try {
    const response = await post(PORT, "/v1/pair", { code });
    const value = await response.json() as { ok?: unknown; token?: unknown; expiresAt?: unknown; error?: unknown };
    if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : "Pairing failed.");
    const session = validSession({ token: value.token, expiresAt: value.expiresAt, port: PORT });
    if (!session) throw new Error("The IDE returned an invalid pairing response.");
    await chrome.storage.session.set({ [SESSION_KEY]: session });
    return { paired: true, message: "Connected for this browser session." };
  } catch (error) {
    if (error instanceof Error && /Pairing|invalid pairing response/.test(error.message)) throw error;
    throw new Error("Proactive AI IDE is not available. Open it, sign in, and open a workspace.");
  }
}

export async function sendToDesktop(capture: ChromeSelectedTextContext): Promise<SendResult> {
  const session = await loadSession();
  if (!session) return { ok: false, message: "IDE not connected. Open the extension and enter the pairing code." };
  try {
    const response = await post(session.port, "/v1/context", capture, session.token);
    const value = await response.json() as { ok?: unknown; error?: unknown; redacted?: unknown; truncated?: unknown };
    if (response.status === 401) await chrome.storage.session.remove(SESSION_KEY);
    if (!response.ok || value.ok !== true) return { ok: false, message: typeof value.error === "string" ? value.error : "The IDE rejected this selection." };
    return { ok: true, message: "Added to the IDE Context Tray.", redacted: value.redacted === true, truncated: value.truncated === true };
  } catch { await chrome.storage.session.remove(SESSION_KEY); return { ok: false, message: "IDE not connected. Keep the IDE open and pair it again." }; }
}
