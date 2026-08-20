import type { WorkspaceBridge } from "../../shared/workspace";
import type { TerminalBridge } from "../../shared/terminal";

declare global {
  interface Window {
    workspace: WorkspaceBridge;
    terminal: TerminalBridge;
  }
}

export {};
