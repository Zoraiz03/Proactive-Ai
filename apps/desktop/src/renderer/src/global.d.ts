import type { LiveBridge } from "../../shared/live-observer";
import type { EngineBridge } from '../../shared/observer-engine';
import type { WorkspaceBridge } from "../../shared/workspace";
import type { AutomaticRunBridge } from "../../shared/automatic-run";
import type { TerminalBridge } from "../../shared/terminal";
import type { RunnerBridge } from "../../shared/runner";
import type { DesktopAuthBridge } from "../../shared/auth";
import type { ObserverBridge } from "../../shared/observer";
import type { WorkspaceSearchBridge } from "../../shared/search";
import type { SettingsBridge } from "../../shared/settings";
import type { GitBridge } from "../../shared/git";
import type { CheckpointBridge } from "../../shared/checkpoints";
import type { MultiFileBridge } from "../../shared/multi-file-change";
import type { VerificationTaskBridge } from "../../shared/verification-task";
import type { InsightsBridge } from "../../shared/proactive-insights";
import type { WebContextBridge } from "../../shared/web-context-bridge";

declare global {
  interface Window {
    engine: EngineBridge;
    liveObserver: LiveBridge;
    automaticRun: AutomaticRunBridge;
    workspace: WorkspaceBridge;
    terminal: TerminalBridge;
    runner: RunnerBridge;
    desktopAuth: DesktopAuthBridge;
    observer: ObserverBridge;
    settings: SettingsBridge;
    git: GitBridge;
    checkpoints: CheckpointBridge;
    multiFileObserver: MultiFileBridge;
    verificationTask: VerificationTaskBridge;
    observerInsights: InsightsBridge;
    workspaceSearch: WorkspaceSearchBridge;
    webContext: WebContextBridge;
  }
}

export {};
