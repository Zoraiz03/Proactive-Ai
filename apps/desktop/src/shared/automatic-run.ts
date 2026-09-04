import type { ObserverProvider } from "./observer";
import type { IpcResult } from "./workspace";

export const AUTOMATIC_RUN_CHANNELS = {
  configure: "automatic-run:configure",
  activity: "automatic-run:activity",
  dismiss: "automatic-run:dismiss",
  state: "automatic-run:state",
  getState: "automatic-run:get-state",
} as const;

// Experiment defaults: not behavioral/stuck detection. All limits live here.
export const AUTOMATIC_RUN_CONFIG = Object.freeze({
  pauseMs: 2_000,
  cooldownMs: 60_000,
  maximumRequestsPerHour: 6,
  maximumAgeMs: 120_000,
  activityFreshnessMs: 3_500,
  heartbeatMs: 1_000,
  codeRadius: 12,
  maximumCodeCharacters: 6_000,
  maximumErrorCharacters: 2_000,
  maximumExplanationCharacters: 2_000,
});

export interface AutomaticRunActivity {
  relativePath: string | null;
  dirty: boolean;
  blocked: boolean;
  focused: boolean;
}

export interface AutomaticRunState {
  enabled: boolean;
  provider?: ObserverProvider;
  status: "off" | "armed" | "waiting" | "thinking" | "ready" | "error" | "skipped";
  message: string;
  relativePath?: string;
  line?: number;
  explanation?: string;
  reason?: string;
}

export const AUTOMATIC_RUN_OFF: AutomaticRunState = {
  enabled: false,
  status: "off",
  message: "Off. Automatic explanations require your permission for this project session.",
};

export interface AutomaticRunBridge {
  configure: (enabled: boolean, provider: ObserverProvider) => Promise<IpcResult<AutomaticRunState>>;
  activity: (activity: AutomaticRunActivity) => void;
  dismiss: () => void;
  getState: () => Promise<AutomaticRunState>;
  onState: (listener: (state: AutomaticRunState) => void) => () => void;
}
