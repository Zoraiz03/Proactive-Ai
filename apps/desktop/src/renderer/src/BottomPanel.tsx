import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RunDiagnostic, RunLanguage, RunStatus } from "../../shared/runner";
import { themeColor } from "./theme";

export interface IdeOutputMessage {
  id: number;
  timestamp: string;
  kind: "info" | "success" | "error";
  message: string;
}

export interface RunOutputState {
  sourceHash?: string;
  sourceUnchanged?: boolean;
  snapshotVerified?: boolean;
  runId: string;
  relativePath: string;
  language: RunLanguage;
  status: RunStatus;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number | null;
  diagnostics: RunDiagnostic[];
}

interface BottomPanelProps {
  workspaceOpen: boolean;
  workspaceVersion: number;
  messages: IdeOutputMessage[];
  run: RunOutputState | null;
  outputFocusToken: number;
  onDiagnosticClick: (diagnostic: RunDiagnostic) => void;
  onStatus: (message: string, kind?: IdeOutputMessage["kind"]) => void;
  commandRequest: { token: number; action: "terminal" | "output" | "new-terminal" } | null;
  onTerminalStateChange: (state: { active: boolean; creating: boolean }) => void;
  onAddDiagnostic: (diagnostic: RunDiagnostic) => void;
  onAddSelectedOutput: (content: string, source: "terminal" | "output") => void;
  onAddRunFailure: () => void;
  onAddTaskFailure: () => void;
  hasTaskFailure: boolean;
}

function exitDescription(reason: string, exitCode: number | null): string {
  if (reason === "workspace_changed") return "Terminal closed because the workspace changed.";
  if (reason === "renderer_closed") return "Terminal closed with the desktop window.";
  if (reason === "closed") return "Terminal closed.";
  return `Terminal exited${exitCode === null ? "." : ` with code ${exitCode}.`}`;
}

export default function BottomPanel({
  workspaceOpen,
  workspaceVersion,
  messages,
  run,
  outputFocusToken,
  onDiagnosticClick,
  onStatus,
  commandRequest,
  onTerminalStateChange,
  onAddDiagnostic,
  onAddSelectedOutput,
  onAddRunFailure,
  onAddTaskFailure,
  hasTaskFailure,
}: BottomPanelProps) {
  const [activeView, setActiveView] = useState<"terminal" | "output">("terminal");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const outputHostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const creatingRef = useRef(false);

  const fitAndResize = useCallback(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon || !terminalHostRef.current?.offsetParent) return;
    try {
      fitAddon.fit();
      const activeSessionId = sessionIdRef.current;
      if (activeSessionId) {
        void window.terminal.resize({
          sessionId: activeSessionId,
          cols: terminal.cols,
          rows: terminal.rows,
        });
      }
    } catch {
      setTerminalError("The terminal display could not be resized.");
    }
  }, []);

  useEffect(() => {
    const host = terminalHostRef.current;
    if (!host) return;
    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: themeColor("--font-mono"),
      fontSize: 12,
      lineHeight: 1.2,
      macOptionIsMeta: true,
      scrollback: 5_000,
      theme: {
        background: themeColor("--desktop-terminal"),
        foreground: themeColor("--desktop-terminal-text"),
        cursor: themeColor("--coffee-accent"),
        selectionBackground: themeColor("--ink-50"),
        black: themeColor("--coffee-deep"),
        brightBlack: themeColor("--tan"),
        red: themeColor("--window-close"),
        green: themeColor("--window-success"),
        yellow: themeColor("--window-warn"),
        blue: themeColor("--coffee-eyebrow"),
        magenta: themeColor("--coffee-accent"),
        cyan: themeColor("--coffee-star"),
        white: themeColor("--cream"),
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const inputSubscription = terminal.onData((data) => {
      const activeSessionId = sessionIdRef.current;
      if (!activeSessionId) return;
      void window.terminal.sendInput({ sessionId: activeSessionId, data }).then((result) => {
        if (!result.ok) setTerminalError(result.error);
      });
    });
    const unsubscribeData = window.terminal.onData((event) => {
      if (event.sessionId === sessionIdRef.current || creatingRef.current) {
        terminal.write(event.data);
      }
    });
    const unsubscribeExit = window.terminal.onExit((event) => {
      if (event.sessionId !== sessionIdRef.current && !creatingRef.current) return;
      sessionIdRef.current = null;
      creatingRef.current = false;
      setSessionId(null);
      setCreating(false);
      const description = exitDescription(event.reason, event.exitCode);
      terminal.write(`\r\n\x1b[90m[${description}]\x1b[0m\r\n`);
      onStatus(description, event.reason === "exited" && event.exitCode ? "error" : "info");
    });
    const resizeObserver = new ResizeObserver(() => fitAndResize());
    resizeObserver.observe(host);
    requestAnimationFrame(() => fitAndResize());

    return () => {
      const activeSessionId = sessionIdRef.current;
      if (activeSessionId) void window.terminal.close({ sessionId: activeSessionId });
      resizeObserver.disconnect();
      inputSubscription.dispose();
      unsubscribeData();
      unsubscribeExit();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [fitAndResize, onStatus]);

  useEffect(() => {
    sessionIdRef.current = null;
    creatingRef.current = false;
    setSessionId(null);
    setCreating(false);
    setTerminalError(null);
    terminalRef.current?.reset();
  }, [workspaceVersion]);

  useEffect(() => {
    if (activeView !== "terminal") return;
    const frame = requestAnimationFrame(() => {
      fitAndResize();
      terminalRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [activeView, fitAndResize]);

  useEffect(() => {
    if (outputFocusToken > 0) setActiveView("output");
  }, [outputFocusToken]);

  const createTerminal = async (): Promise<string | null> => {
    if (!workspaceOpen || creatingRef.current) return null;
    if (sessionIdRef.current) return sessionIdRef.current;
    setActiveView("terminal");
    setCreating(true);
    creatingRef.current = true;
    setTerminalError(null);
    terminalRef.current?.reset();
    requestAnimationFrame(() => fitAndResize());
    const terminal = terminalRef.current;
    const result = await window.terminal.create({
      cols: terminal?.cols || 80,
      rows: terminal?.rows || 24,
    });
    creatingRef.current = false;
    setCreating(false);
    if (!result.ok) {
      setTerminalError(result.error);
      onStatus(result.error, "error");
      return null;
    }
    sessionIdRef.current = result.value.sessionId;
    setSessionId(result.value.sessionId);
    onStatus("Workspace terminal started.", "success");
    requestAnimationFrame(() => {
      fitAndResize();
      terminalRef.current?.focus();
    });
    return result.value.sessionId;
  };

  const closeTerminal = async () => {
    const activeSessionId = sessionIdRef.current;
    if (!activeSessionId) return;
    const result = await window.terminal.close({ sessionId: activeSessionId });
    if (!result.ok) {
      setTerminalError(result.error);
      onStatus(result.error, "error");
    }
  };

  const addSelectedOutput = () => {
    const selection = window.getSelection();
    const selectedContent = selection?.toString().trim() ?? "";
    const selectedFromOutput = Boolean(selectedContent && selection?.anchorNode && outputHostRef.current?.contains(selection.anchorNode));
    const content = selectedFromOutput ? selectedContent : [run?.stdout, run?.stderr].filter(Boolean).join("\n").trim();
    if (!content) { onStatus("Select visible Output text or run a file before adding it to Context.", "error"); return; }
    onAddSelectedOutput(content, "output");
  };

  const addSelectedTerminal = () => {
    const content = terminalRef.current?.getSelection().trim() ?? "";
    if (!content) { onStatus("Select visible terminal text before adding it to Context.", "error"); return; }
    onAddSelectedOutput(content, "terminal");
  };

  useEffect(() => {
    onTerminalStateChange({ active: Boolean(sessionId), creating });
  }, [creating, onTerminalStateChange, sessionId]);

  useEffect(() => {
    if (!commandRequest) return;
    if (commandRequest.action === "new-terminal") void createTerminal();
    else if (commandRequest.action === "terminal") {
      setActiveView("terminal");
      requestAnimationFrame(() => terminalRef.current?.focus());
    } else {
      setActiveView("output");
      requestAnimationFrame(() => outputHostRef.current?.focus());
    }
  }, [commandRequest?.token]);

  return (
    <div className="bottom-workspace">
      <div className="bottom-tabs" role="tablist" aria-label="Terminal and output">
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "terminal"}
          className={activeView === "terminal" ? "active" : ""}
          onClick={() => setActiveView("terminal")}
        >
          Terminal
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeView === "output"}
          className={activeView === "output" ? "active" : ""}
          onClick={() => setActiveView("output")}
        >
          Output
        </button>
        <div className="bottom-actions">
          {sessionId ? (
            <><button type="button" onClick={addSelectedTerminal}>Add Selected Terminal to Context</button><button type="button" onClick={() => void closeTerminal()} title="Close terminal">Close Terminal</button></>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={() => void createTerminal()}
              disabled={!workspaceOpen || creating}
              title={workspaceOpen ? "Create workspace terminal" : "Open a workspace first"}
            >
              {creating ? "Starting…" : "New Terminal"}
            </button>
          )}
        </div>
      </div>

      <div className={`bottom-view terminal-view ${activeView === "terminal" ? "active" : ""}`}>
        <div ref={terminalHostRef} className="terminal-host" />
        {!sessionId && !creating && (
          <div className="terminal-empty">
            <span aria-hidden="true">›_</span>
            <p>{workspaceOpen ? "Choose New Terminal to start a workspace shell." : "Open a workspace, then create a terminal."}</p>
          </div>
        )}
        {terminalError && <div className="terminal-error" role="alert">{terminalError}</div>}
      </div>

      <div
        ref={outputHostRef}
        className={`bottom-view output-view ${activeView === "output" ? "active" : ""}`}
        tabIndex={-1}
        aria-label="IDE output"
      >
        <div className="output-context-actions" aria-label="Add output evidence to Context">
          <span className="output-context-label">Add to Context</span>
          <div className="output-context-action-buttons">
            <button className="primary output-context-primary" type="button" onClick={addSelectedOutput} aria-label="Selected Output" title="Add selected Output text to Context">
              <span aria-hidden="true">＋</span>
              Selected Output
            </button>
            <button type="button" onClick={onAddRunFailure} disabled={run?.status !== "failed"} aria-label="Run Failure" title={run?.status === "failed" ? "Add the latest failed run to Context" : "Available after a file run fails"}>
              <span aria-hidden="true">!</span>
              Run Failure
            </button>
            <button type="button" onClick={onAddTaskFailure} disabled={!hasTaskFailure} aria-label="Failed Test" title={hasTaskFailure ? "Add the failed test or build to Context" : "Available after a test or build fails"}>
              <span aria-hidden="true">×</span>
              Failed Test
            </button>
          </div>
        </div>
        {!run && messages.length === 0 ? (
          <div className="output-empty">IDE status messages will appear here.</div>
        ) : (
          <div className="output-scroll">
            {run && (
              <section className="run-result" aria-label="Current file run output">
                <header>
                  <strong>{run.relativePath}</strong>
                  <span className={`run-status ${run.status}`}>{run.status}</span>
                  {run.durationMs !== null && <span>{run.durationMs} ms</span>}
                  {run.exitCode !== null && <span>exit {run.exitCode}</span>}
                </header>
                {(run.stdout || run.stderr) ? (
                  <pre className="run-stream" aria-label="Program output">
                    {run.stdout && <span className="stdout">{run.stdout}</span>}
                    {run.stderr && <span className="stderr">{run.stderr}</span>}
                  </pre>
                ) : (
                  <p className="run-waiting">{run.status === "running" ? "Waiting for output…" : "The process produced no output."}</p>
                )}
                {run.diagnostics.length > 0 && (
                  <div className="run-diagnostics">
                    <h3>Diagnostics</h3>
                    {run.diagnostics.map((diagnostic, index) => (
                      <div
                        key={`${diagnostic.relativePath}:${diagnostic.line}:${diagnostic.column}:${index}`}
                      >
                        <button type="button" onClick={() => onDiagnosticClick(diagnostic)}><span>{diagnostic.relativePath}:{diagnostic.line}:{diagnostic.column}</span><small>{diagnostic.message}</small></button>
                        <button type="button" onClick={() => onAddDiagnostic(diagnostic)}>Add Diagnostic to Context</button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
            {messages.length > 0 && (
              <ol className="output-messages" aria-label="IDE output messages">
                {messages.map((message) => (
                  <li key={message.id} className={message.kind}>
                    <time>{message.timestamp}</time>
                    <span>{message.message}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
