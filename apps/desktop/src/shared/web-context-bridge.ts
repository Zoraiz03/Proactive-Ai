import type { ContextTrayItem } from "./context-tray";

export const WEB_CONTEXT_PROTOCOL_VERSION = 1 as const;
export const WEB_CONTEXT_CHANNELS = {
  status: "web-context:status", pending: "web-context:pending", received: "web-context:received",
  setEnabled: "web-context:set-enabled", startPairing: "web-context:start-pairing",
  cancelPairing: "web-context:cancel-pairing", revoke: "web-context:revoke",
  accept: "web-context:accept", reject: "web-context:reject",
} as const;

export interface WebContextBridgeStatus {
  available: boolean; enabled: boolean; paired: boolean; connected: boolean;
  pairingCode: string | null; pairingExpiresAt: number | null; pairedDevice: string | null;
  port: number | null; message: string;
}

export interface IncomingWebContext {
  transferId: string; idempotencyKey: string; captureId: string; selectedText: string;
  sourceTitle: string; sourceUrl: string; hostname: string; capturedAt: number;
  characterCount: number; redacted: boolean; truncated: boolean; userEdited: boolean;
  receivedAt: number; queueDepth: number;
}

export interface WebContextActionResult { ok: boolean; error?: string; item?: ContextTrayItem }
export interface WebContextBridge {
  getStatus(): Promise<WebContextBridgeStatus>;
  setEnabled(enabled: boolean): Promise<WebContextActionResult>;
  startPairing(): Promise<WebContextActionResult>;
  cancelPairing(): Promise<WebContextActionResult>;
  revoke(): Promise<WebContextActionResult>;
  accept(transferId: string): Promise<WebContextActionResult>;
  reject(transferId: string): Promise<WebContextActionResult>;
  onStatusChanged(listener: (status: WebContextBridgeStatus) => void): () => void;
  onPendingChanged(listener: (item: IncomingWebContext | null) => void): () => void;
  onContextReceived(listener: (item: ContextTrayItem) => void): () => void;
}
