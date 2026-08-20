export const TERMINAL_CHANNELS = {
  create: "terminal:create",
  input: "terminal:input",
  resize: "terminal:resize",
  close: "terminal:close",
  data: "terminal:data",
  exit: "terminal:exit",
} as const;

export interface TerminalDimensions {
  cols: number;
  rows: number;
}

export interface TerminalCreateRequest extends TerminalDimensions {}

export interface TerminalInputRequest {
  sessionId: string;
  data: string;
}

export interface TerminalResizeRequest extends TerminalDimensions {
  sessionId: string;
}

export interface TerminalCloseRequest {
  sessionId: string;
}

export interface TerminalDataEvent {
  sessionId: string;
  data: string;
}

export interface TerminalExitEvent {
  sessionId: string;
  exitCode: number | null;
  reason: "exited" | "closed" | "workspace_changed" | "renderer_closed" | "app_exit";
}

export type TerminalResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface TerminalBridge {
  create: (request: TerminalCreateRequest) => Promise<TerminalResult<{ sessionId: string }>>;
  sendInput: (request: TerminalInputRequest) => Promise<TerminalResult>;
  resize: (request: TerminalResizeRequest) => Promise<TerminalResult>;
  close: (request: TerminalCloseRequest) => Promise<TerminalResult>;
  onData: (listener: (event: TerminalDataEvent) => void) => () => void;
  onExit: (listener: (event: TerminalExitEvent) => void) => () => void;
}
