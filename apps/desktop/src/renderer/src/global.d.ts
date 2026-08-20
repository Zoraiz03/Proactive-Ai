import type { WorkspaceBridge } from "../../shared/workspace";
import type { TerminalBridge } from "../../shared/terminal";
import type { RunnerBridge } from "../../shared/runner";

declare global {
  interface Window {
    workspace: WorkspaceBridge;
    terminal: TerminalBridge;
    runner: RunnerBridge;
  }
}

export {};
