import type { WorkspaceBridge } from "../../shared/workspace";
import type { TerminalBridge } from "../../shared/terminal";
import type { RunnerBridge } from "../../shared/runner";
import type { DesktopAuthBridge } from "../../shared/auth";

declare global {
  interface Window {
    workspace: WorkspaceBridge;
    terminal: TerminalBridge;
    runner: RunnerBridge;
    desktopAuth: DesktopAuthBridge;
  }
}

export {};
