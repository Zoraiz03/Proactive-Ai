import { randomUUID } from "node:crypto";
import type {
  TerminalCreateRequest,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalInputRequest,
  TerminalResizeRequest,
  TerminalResult,
} from "../shared/terminal";

const MAX_INPUT_LENGTH = 64 * 1024;
const MAX_OUTPUT_CHUNK_LENGTH = 64 * 1024;

interface Disposable {
  dispose: () => void;
}

export interface PseudoTerminal {
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
  onData: (listener: (data: string) => void) => Disposable;
  onExit: (listener: (event: { exitCode: number; signal?: number }) => void) => Disposable;
}

export interface SpawnTerminalOptions {
  cwd: string;
  cols: number;
  rows: number;
}

export type SpawnTerminal = (options: SpawnTerminalOptions) => PseudoTerminal;

interface ActiveTerminal {
  sessionId: string;
  webContentsId: number;
  process: PseudoTerminal;
  subscriptions: Disposable[];
}

export interface TerminalEventSink {
  data: (webContentsId: number, event: TerminalDataEvent) => void;
  exit: (webContentsId: number, event: TerminalExitEvent) => void;
}

export function parseTerminalDimensions(value: unknown): { cols: number; rows: number } | null {
  if (typeof value !== "object" || value === null) return null;
  const { cols, rows } = value as { cols?: unknown; rows?: unknown };
  if (
    typeof cols !== "number" ||
    typeof rows !== "number" ||
    !Number.isInteger(cols) ||
    !Number.isInteger(rows) ||
    cols < 2 ||
    cols > 500 ||
    rows < 1 ||
    rows > 300
  ) {
    return null;
  }
  return { cols, rows };
}

function validSessionId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

export function parseTerminalInput(value: unknown): TerminalInputRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const { sessionId, data } = value as { sessionId?: unknown; data?: unknown };
  if (
    !validSessionId(sessionId) ||
    typeof data !== "string" ||
    data.length === 0 ||
    data.length > MAX_INPUT_LENGTH
  ) {
    return null;
  }
  return { sessionId, data };
}

function splitOutput(data: string): string[] {
  if (data.length <= MAX_OUTPUT_CHUNK_LENGTH) return [data];
  const chunks: string[] = [];
  for (let offset = 0; offset < data.length; offset += MAX_OUTPUT_CHUNK_LENGTH) {
    chunks.push(data.slice(offset, offset + MAX_OUTPUT_CHUNK_LENGTH));
  }
  return chunks;
}

export class TerminalSessionController {
  private workspace: { rootPath: string; webContentsId: number } | null = null;
  private active: ActiveTerminal | null = null;
  private readonly spawnTerminal: SpawnTerminal;
  private readonly sink: TerminalEventSink;

  constructor(
    spawnTerminal: SpawnTerminal,
    sink: TerminalEventSink
  ) {
    this.spawnTerminal = spawnTerminal;
    this.sink = sink;
  }

  setWorkspace(rootPath: string, webContentsId: number): void {
    this.closeActive("workspace_changed");
    this.workspace = { rootPath, webContentsId };
  }

  clearWorkspace(webContentsId?: number): void {
    if (webContentsId !== undefined && this.workspace?.webContentsId !== webContentsId) return;
    this.closeActive("workspace_changed");
    this.workspace = null;
  }

  create(webContentsId: number, request: unknown): TerminalResult<{ sessionId: string }> {
    if (!this.workspace || this.workspace.webContentsId !== webContentsId) {
      return { ok: false, error: "Open a workspace before creating a terminal." };
    }
    if (this.active) return { ok: false, error: "A terminal is already running." };
    const dimensions = parseTerminalDimensions(request as TerminalCreateRequest);
    if (!dimensions) return { ok: false, error: "The terminal size is invalid." };

    try {
      const sessionId = randomUUID();
      const process = this.spawnTerminal({
        cwd: this.workspace.rootPath,
        ...dimensions,
      });
      const active: ActiveTerminal = {
        sessionId,
        webContentsId,
        process,
        subscriptions: [],
      };
      this.active = active;
      active.subscriptions.push(
        process.onData((data) => {
          if (this.active !== active) return;
          for (const chunk of splitOutput(data)) {
            this.sink.data(webContentsId, { sessionId, data: chunk });
          }
        }),
        process.onExit(({ exitCode }) => {
          if (this.active !== active) return;
          this.disposeSubscriptions(active);
          this.active = null;
          this.sink.exit(webContentsId, { sessionId, exitCode, reason: "exited" });
        })
      );
      return { ok: true, value: { sessionId } };
    } catch {
      return { ok: false, error: "The workspace terminal could not be started." };
    }
  }

  input(webContentsId: number, request: unknown): TerminalResult {
    const parsed = parseTerminalInput(request);
    if (!parsed) return { ok: false, error: "The terminal input was rejected." };
    const active = this.authorizedSession(webContentsId, parsed.sessionId);
    if (!active) return { ok: false, error: "The terminal session is no longer available." };
    try {
      active.process.write(parsed.data);
      return { ok: true, value: undefined };
    } catch {
      return { ok: false, error: "The terminal could not receive input." };
    }
  }

  resize(webContentsId: number, request: unknown): TerminalResult {
    if (typeof request !== "object" || request === null) {
      return { ok: false, error: "The terminal resize request was rejected." };
    }
    const { sessionId } = request as { sessionId?: unknown };
    const dimensions = parseTerminalDimensions(request as TerminalResizeRequest);
    if (!validSessionId(sessionId) || !dimensions) {
      return { ok: false, error: "The terminal resize request was rejected." };
    }
    const active = this.authorizedSession(webContentsId, sessionId);
    if (!active) return { ok: false, error: "The terminal session is no longer available." };
    try {
      active.process.resize(dimensions.cols, dimensions.rows);
      return { ok: true, value: undefined };
    } catch {
      return { ok: false, error: "The terminal could not be resized." };
    }
  }

  close(webContentsId: number, request: unknown): TerminalResult {
    const sessionId =
      typeof request === "object" && request !== null && "sessionId" in request
        ? request.sessionId
        : null;
    if (!validSessionId(sessionId)) {
      return { ok: false, error: "The terminal close request was rejected." };
    }
    if (!this.authorizedSession(webContentsId, sessionId)) {
      return { ok: false, error: "The terminal session is no longer available." };
    }
    this.closeActive("closed");
    return { ok: true, value: undefined };
  }

  rendererClosed(webContentsId: number): void {
    if (this.active?.webContentsId === webContentsId) this.closeActive("renderer_closed", false);
    if (this.workspace?.webContentsId === webContentsId) this.workspace = null;
  }

  dispose(): void {
    this.closeActive("app_exit", false);
    this.workspace = null;
  }

  private authorizedSession(webContentsId: number, sessionId: string): ActiveTerminal | null {
    return this.active?.webContentsId === webContentsId && this.active.sessionId === sessionId
      ? this.active
      : null;
  }

  private closeActive(reason: TerminalExitEvent["reason"], notify = true): void {
    const active = this.active;
    if (!active) return;
    this.active = null;
    this.disposeSubscriptions(active);
    try {
      active.process.kill();
    } catch {
      // The process may already have exited between the request and cleanup.
    }
    if (notify) {
      this.sink.exit(active.webContentsId, {
        sessionId: active.sessionId,
        exitCode: null,
        reason,
      });
    }
  }

  private disposeSubscriptions(active: ActiveTerminal): void {
    for (const subscription of active.subscriptions) subscription.dispose();
    active.subscriptions = [];
  }
}
