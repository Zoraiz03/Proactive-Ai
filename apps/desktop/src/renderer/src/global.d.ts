import type { WorkspaceBridge } from "../../shared/workspace";
import type { TerminalBridge } from "../../shared/terminal";
import type { RunnerBridge } from "../../shared/runner";
import type { DesktopAuthBridge } from "../../shared/auth";
import type { ObserverBridge } from "../../shared/observer";
import type { WorkspaceSearchBridge } from "../../shared/search";

declare global {
  interface Window {
    workspace: WorkspaceBridge;
    terminal: TerminalBridge;
    runner: RunnerBridge;
    desktopAuth: DesktopAuthBridge;
    observer: ObserverBridge;
    workspaceSearch: WorkspaceSearchBridge;
  }
}

export {};
