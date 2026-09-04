import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import {
  AUTOMATIC_RUN_CONFIG, AUTOMATIC_RUN_OFF,
  type AutomaticRunActivity, type AutomaticRunState,
} from "../shared/automatic-run.ts";
import type { ObserverAskResult, ObserverProvider, ObserverRequest } from "../shared/observer.ts";
import { projectContextCost, type ProjectContextItem } from "../shared/project-context.ts";
import type { RunCompleteEvent, RunLanguage } from "../shared/runner.ts";
import type { IpcResult } from "../shared/workspace.ts";
import { isExcludedFromAiContext } from "../shared/settings.ts";
import { redactContextSecrets } from "../shared/context-tray.ts";

export interface AutomaticRunSnapshot {
  runId: string;
  relativePath: string;
  language: RunLanguage;
  content: string;
}

export interface AutomaticRunPolicy {
  enabled: boolean;
  exclusions: string[];
  maximumCharacters: number;
}

interface Candidate {
  snapshot: AutomaticRunSnapshot;
  line: number;
  error: string;
  key: string;
  createdAt: number;
}

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const instruction = "Automatically explain the latest failed run after the user's opt-in. Give a brief what happened, likely cause, and one next step. Do not change code or execute anything. If evidence is insufficient, say so.";

/** No crawling, attachments, stdout, absolute paths, or raw keystrokes. */
export function buildAutomaticRunRequest(candidate: Pick<Candidate, "snapshot" | "line" | "error">, provider: ObserverProvider, policy: AutomaticRunPolicy): ObserverRequest | null {
  const { snapshot, line, error } = candidate;
  if (!policy.enabled || isExcludedFromAiContext(snapshot.relativePath, policy.exclusions)) return null;
  if (snapshot.relativePath.split(/[\\/]/).some((part) => ["..", ".git", "node_modules", "dist", "build", "out", "vendor", "coverage"].includes(part)) || /^(?:\/|[a-z]:)/i.test(snapshot.relativePath)) return null;
  if (![".py", ".js", ".mjs"].includes(extname(snapshot.relativePath).toLowerCase())) return null;
  // Fail closed, rather than shipping a partially redacted error explanation.
  if (redactContextSecrets(snapshot.content).redacted || redactContextSecrets(error).redacted) return null;
  const lines = snapshot.content.split(/\r?\n/);
  if (!Number.isInteger(line) || line < 1 || line > lines.length || !error.trim()) return null;
  const start = Math.max(0, line - 1 - AUTOMATIC_RUN_CONFIG.codeRadius);
  const end = Math.min(lines.length, line + AUTOMATIC_RUN_CONFIG.codeRadius);
  const excerpt = lines.slice(start, end).join("\n");
  // Do not truncate away the error line or exceed the user's context budget.
  if (excerpt.length > AUTOMATIC_RUN_CONFIG.maximumCodeCharacters || !excerpt.trim()) return null;
  const safeError = error.slice(-AUTOMATIC_RUN_CONFIG.maximumErrorCharacters)
    .replace(/(?:file:\/\/)?(?:[A-Za-z]:[\\/]|\/)[^\s"'<>]+/g, "[local path]");
  const item = (id: string, type: ProjectContextItem["type"], content: string, provenance: ProjectContextItem["source"]["provenance"], source: Partial<ProjectContextItem["source"]> = {}): ProjectContextItem => ({
    id, type, content, priority: 1, source: { provenance, ...source }, reason: "Opt-in automatic explanation of a controlled failed run.",
    ...projectContextCost(content), optional: false, completeFile: false, truncated: false, redacted: false,
  });
  const items = [
    item("auto-intent", "user_instruction", instruction, "user"),
    item("auto-error", "controlled_run_error", safeError, "run_output", { relativePath: snapshot.relativePath, lineStart: line, lineEnd: line }),
    item("auto-code", "nearby_code", excerpt, "editor_cursor", { relativePath: snapshot.relativePath, lineStart: start + 1, lineEnd: end }),
  ];
  items[2].completeFile = start === 0 && end === lines.length;
  const totalCharacters = items.reduce((total, value) => total + value.content.length, 0);
  const maximumCharacters = Math.min(9_000, policy.maximumCharacters);
  if (totalCharacters > maximumCharacters || maximumCharacters < 1_000) return null;
  return {
    provider, mode: "explain", kind: "code", fileName: basename(snapshot.relativePath), language: snapshot.language,
    source: "cursor", cursorLine: line, cursorColumn: 1, storeHistory: false,
    automaticRun: { trigger: "failed_run", runId: snapshot.runId },
    contextPackage: {
      version: 1, intent: { mode: "explain", instruction },
      activeFile: { relativePath: snapshot.relativePath, fileName: basename(snapshot.relativePath), language: snapshot.language, kind: "code" },
      cursor: { line, column: 1 }, items, omitted: [], totalCharacters, estimatedTokens: Math.ceil(totalCharacters / 4),
      limits: { maximumTotalCharacters: maximumCharacters, maximumRelatedFiles: 0, maximumCharactersPerFile: AUTOMATIC_RUN_CONFIG.maximumCodeCharacters },
      containsCompleteFile: items.some((value) => value.completeFile),
    },
  };
}

export interface AutomaticRunDependencies {
  readCurrent: (relativePath: string) => Promise<string>;
  policy: () => Promise<AutomaticRunPolicy>;
  ask: (request: ObserverRequest, signal: AbortSignal) => Promise<IpcResult<ObserverAskResult>>;
  publish: (state: AutomaticRunState) => void;
  now?: () => number;
}

/** Main-process authority: renderer never supplies error evidence or permission by activity. */
export class AutomaticRunController {
  private state: AutomaticRunState = { ...AUTOMATIC_RUN_OFF };
  private snapshot: AutomaticRunSnapshot | null = null;
  private candidate: Candidate | null = null;
  private activity: AutomaticRunActivity | null = null;
  private activityAt = 0;
  private quietSince = 0;
  private abort: AbortController | null = null;
  private generation = 0;
  private readonly seen = new Set<string>();
  private requests: number[] = [];
  private lastRequestAt = Number.NEGATIVE_INFINITY;
  private busy = false;
  private readonly dependencies: AutomaticRunDependencies;
  private readonly now: () => number;

  constructor(dependencies: AutomaticRunDependencies) {
    this.dependencies = dependencies;
    this.now = dependencies.now ?? Date.now;
  }

  getState(): AutomaticRunState { return { ...this.state }; }

  configure(enabled: boolean, provider: ObserverProvider): void {
    this.invalidate(); this.snapshot = null;
    this.state = enabled ? { enabled: true, provider, status: "armed", message: "Waiting for your next failed Python or JavaScript run." } : { ...AUTOMATIC_RUN_OFF };
    this.publish();
  }

  reset(): void {
    this.configure(false, "demo"); this.activity = null; this.seen.clear();
    // Budget survives project/session toggles within this application process.
  }

  private publish(): void { this.dependencies.publish(this.getState()); }
  private invalidate(): void { this.generation++; this.abort?.abort(); this.abort = null; this.candidate = null; }

  invalidateFiles(): void {
    this.invalidate(); this.snapshot = null;
    if (this.state.enabled) { this.state = { enabled: true, provider: this.state.provider, status: "armed", message: "Project changed. Run the current code again for a fresh explanation." }; this.publish(); }
  }

  observeActivity(activity: AutomaticRunActivity): void {
    this.activity = activity; this.activityAt = this.now();
    if (!this.state.enabled) return;
    const path = this.candidate?.snapshot.relativePath ?? this.snapshot?.relativePath ?? this.state.relativePath;
    if (path && (activity.relativePath !== path || activity.dirty)) this.invalidateFiles();
    if (activity.blocked || !activity.focused) {
      this.quietSince = this.now();
      if (this.abort) this.invalidateFiles();
    }
  }

  runStarted(snapshot: AutomaticRunSnapshot): void {
    this.invalidate(); this.snapshot = this.state.enabled ? snapshot : null;
    if (this.state.enabled) { this.state = { enabled: true, provider: this.state.provider, status: "armed", message: "Waiting for this run to finish." }; this.publish(); }
  }

  runCompleted(event: RunCompleteEvent, stderr: string): void {
    const snapshot = this.snapshot; this.snapshot = null;
    if (!this.state.enabled || !snapshot || snapshot.runId !== event.runId) return;
    this.invalidate();
    if (event.status !== "failed" || event.exitCode === null || event.exitCode === 0) {
      this.state = { enabled: true, provider: this.state.provider, status: "armed", message: "No automatic explanation needed for this run." }; this.publish(); return;
    }
    const diagnostic = event.diagnostics.find((value) => value.relativePath === snapshot.relativePath);
    if (redactContextSecrets(stderr).redacted) { this.skip("Potential secret material was detected in run output. Nothing was sent."); return; }
    if (!diagnostic || !stderr.trim()) { this.skip("No reliable source location was found. Use Ask Observer to provide more context."); return; }
    const error = stderr.slice(-AUTOMATIC_RUN_CONFIG.maximumErrorCharacters);
    const key = hash(`${snapshot.relativePath}\0${snapshot.content}\0${diagnostic.line}\0${diagnostic.message}`);
    if (this.seen.has(key)) { this.skip("This unchanged failure was already considered. No repeat request was sent."); return; }
    this.quietSince = this.now();
    this.candidate = { snapshot, error, key, line: diagnostic.line, createdAt: this.now() };
    this.state = { enabled: true, provider: this.state.provider, status: "waiting", message: "Waiting for a short pause before explaining this failed run.", relativePath: snapshot.relativePath, line: diagnostic.line }; this.publish();
  }

  dismiss(): void {
    if (this.candidate) this.remember(this.candidate.key);
    this.invalidate();
    if (this.state.enabled) { this.state = { enabled: true, provider: this.state.provider, status: "armed", message: "Dismissed. No repeated explanation for unchanged code and the same error." }; this.publish(); }
  }

  private remember(key: string): void { this.seen.add(key); if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value!); }
  private skip(message: string): void {
    this.invalidate();
    this.state = { enabled: true, provider: this.state.provider, status: "skipped", message }; this.publish();
  }

  private activityAllows(candidate: Candidate): boolean {
    const activity = this.activity;
    return Boolean(activity && this.now() - this.activityAt <= AUTOMATIC_RUN_CONFIG.activityFreshnessMs && activity.focused && !activity.blocked && !activity.dirty && activity.relativePath === candidate.snapshot.relativePath && this.now() - this.quietSince >= AUTOMATIC_RUN_CONFIG.pauseMs && this.now() - candidate.createdAt <= AUTOMATIC_RUN_CONFIG.maximumAgeMs);
  }

  async tick(): Promise<void> {
    const candidate = this.candidate;
    if (!this.state.enabled || !candidate || this.busy || this.state.status !== "waiting") return;
    const now = this.now();
    if (now - candidate.createdAt > AUTOMATIC_RUN_CONFIG.maximumAgeMs) { this.skip("This failure is too old. Run again for fresh evidence."); return; }
    if (!this.activityAllows(candidate)) return;
    this.requests = this.requests.filter((at) => now - at < 3_600_000);
    if (now - this.lastRequestAt < AUTOMATIC_RUN_CONFIG.cooldownMs || this.requests.length >= AUTOMATIC_RUN_CONFIG.maximumRequestsPerHour) { this.skip("Automatic request limit reached. Ask Observer manually if you need help now."); return; }
    const generation = this.generation;
    const current = () => generation === this.generation && this.state.enabled;
    this.busy = true;
    try {
      const policy = await this.dependencies.policy();
      if (!current()) return;
      const content = await this.dependencies.readCurrent(candidate.snapshot.relativePath);
      if (!current()) return;
      if (content !== candidate.snapshot.content) { this.invalidateFiles(); return; }
      if (!this.activityAllows(candidate)) return;
      const request = buildAutomaticRunRequest(candidate, this.state.provider!, policy);
      if (!request) { this.skip("Automatic context was excluded, unsafe, too large, or disabled by privacy settings. Nothing was sent."); return; }
      this.remember(candidate.key); this.requests.push(this.now()); this.lastRequestAt = this.now();
      const controller = new AbortController(); this.abort = controller;
      this.state = { ...this.state, status: "thinking", message: "Automatically explaining the failed run…" }; this.publish();
      const result = await this.dependencies.ask(request, controller.signal);
      if (!current()) return;
      const latest = await this.dependencies.readCurrent(candidate.snapshot.relativePath);
      if (!current()) return;
      if (latest !== candidate.snapshot.content) { this.invalidateFiles(); return; }
      if (!this.activityAllows(candidate)) { this.skip("The editor is no longer ready for this explanation. Use Ask Observer when needed."); return; }
      this.candidate = null;
      if (!result.ok) {
        this.state = { enabled: true, provider: this.state.provider, status: "error", message: "Automatic explanation failed. Check your connection/provider settings or use Ask Observer. No automatic retry will occur." };
      } else {
        this.state = { ...this.state, status: "ready", message: "Automatic failed-run explanation", explanation: result.value.suggestion.explanation.slice(0, AUTOMATIC_RUN_CONFIG.maximumExplanationCharacters), reason: `Your latest ${candidate.snapshot.language} run failed at ${candidate.snapshot.relativePath}:${candidate.line}. Auto-explain is enabled.` };
      }
      this.publish();
    } catch {
      if (current()) this.skip("Automatic explanation could not safely read the current context. Nothing further will be requested.");
    } finally { this.busy = false; if (current()) this.abort = null; }
  }
}
