import type { ContextTrayItem } from "./context-tray";

export const WEB_CONTEXT_CHANNELS = {
  status: "web-context:status",
  received: "web-context:received",
} as const;

export interface WebContextBridgeStatus {
  available: boolean;
  paired: boolean;
  pairingCode: string | null;
  port: number | null;
  message: string;
}

export interface WebContextBridge {
  getStatus(): Promise<WebContextBridgeStatus>;
  onStatusChanged(listener: (status: WebContextBridgeStatus) => void): () => void;
  onContextReceived(listener: (item: ContextTrayItem) => void): () => void;
}
