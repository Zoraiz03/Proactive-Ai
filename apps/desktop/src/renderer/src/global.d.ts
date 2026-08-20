import type { WorkspaceBridge } from "../../shared/workspace";

declare global {
  interface Window {
    workspace: WorkspaceBridge;
  }
}

export {};
