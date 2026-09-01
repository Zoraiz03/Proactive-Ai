export type ProactiveObserverMode = "off" | "manual" | "assist";
export type ProactiveDetectorType = "persistent_diagnostic" | "failed_run" | "failed_test" | "failed_build";
export type ProactiveSeverity = "error";
export type ProactiveAction = "investigate" | "explain" | "suggest_fix";
export type ProactiveOutcome = ProactiveAction | "not_now" | "mute_error" | "mute_file" | "mute_project" | "disable_assist" | "shown" | "resolved";

export interface ProactiveContextReference {
  kind: "diagnostic" | "run" | "test" | "build";
  relativePath?: string;
  line?: number;
  column?: number;
}

export interface ProactiveEvent {
  eventId: string;
  detectorType: ProactiveDetectorType;
  severity: ProactiveSeverity;
  workspaceId: string;
  relativePath?: string;
  line?: number;
  column?: number;
  normalizedSignature: string;
  firstSeenAt: number;
  lastSeenAt: number;
  occurrenceCount: number;
  resolved: boolean;
  reason: string;
  availableActions: ProactiveAction[];
  contextReferences: ProactiveContextReference[];
  cooldownUntil: number;
}

export interface ProactiveNudge {
  event: ProactiveEvent;
  title: string;
}

export interface ProactiveSettingsSnapshot {
  mode: ProactiveObserverMode;
  persistentDiagnostics: boolean;
  failedRuns: boolean;
  failedTests: boolean;
  failedBuilds: boolean;
  cooldownMinutes: number;
  maximumNudgesPerHour: number;
  mutedErrors: string[];
  mutedFiles: string[];
  mutedProjects: string[];
}

export interface DiagnosticSignal {
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  line: number;
  column: number;
}

export interface ObjectiveFailureSignal {
  kind: "run" | "test" | "build";
  workspaceId: string;
  relativePath?: string;
  line?: number;
  column?: number;
  message: string;
  succeeded: boolean;
}

export interface ProactiveFeedbackRecord {
  version: 1;
  detectorType: ProactiveDetectorType;
  severity: ProactiveSeverity;
  workspaceId: string;
  signature: string;
  timestamp: number;
  outcome: ProactiveOutcome;
  resolved: boolean;
  timeToResolutionMs?: number;
}

export interface ProactiveObservation {
  nudge: ProactiveNudge | null;
  resolved: ProactiveEvent[];
  failedSafely: boolean;
}

export interface ProactiveEngineOptions {
  now?: () => number;
  diagnosticCycles?: number;
}

const EMPTY: ProactiveObservation = { nudge: null, resolved: [], failedSafely: false };
const basename = (path: string | undefined) => path?.split("/").at(-1) ?? "the current file";

function stableHash(value: string): string {
  let left = 0x811c9dc5; let right = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index); left = Math.imul(left ^ code, 0x01000193); right = Math.imul(right ^ (code + index), 0x85ebca6b);
  }
  return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0).toString(16).padStart(8, "0")}`;
}

export function normalizedFailureSignature(detector: ProactiveDetectorType, workspaceId: string, relativePath: string | undefined, line: number | undefined, message: string): string {
  const normalized = message.toLowerCase().replace(/(?:file:\/\/)?(?:[a-z]:)?[/\\][^\s:]+/gi, "<path>").replace(/\b\d+\b/g, "#").replace(/[A-Za-z0-9_./+\-=]{20,}/g, "<token>").replace(/\s+/g, " ").slice(0, 500);
  return stableHash(`${detector}|${workspaceId}|${relativePath ?? ""}|${line ?? 0}|${normalized}`);
}

function detectorFor(kind: ObjectiveFailureSignal["kind"]): ProactiveDetectorType {
  return kind === "run" ? "failed_run" : kind === "test" ? "failed_test" : "failed_build";
}

function enabled(settings: ProactiveSettingsSnapshot, detector: ProactiveDetectorType): boolean {
  if (settings.mode !== "assist") return false;
  return detector === "persistent_diagnostic" ? settings.persistentDiagnostics : detector === "failed_run" ? settings.failedRuns : detector === "failed_test" ? settings.failedTests : settings.failedBuilds;
}

export class ProactiveObserverEngine {
  private readonly events = new Map<string, ProactiveEvent>();
  private readonly dismissed = new Set<string>();
  private readonly shownByWorkspace = new Map<string, number[]>();
  private active: ProactiveNudge | null = null;
  private lastShownAt = Number.NEGATIVE_INFINITY;
  private counter = 0;
  private readonly now: () => number;
  private readonly diagnosticCycles: number;

  constructor(options: ProactiveEngineOptions = {}) {
    this.now = options.now ?? Date.now;
    this.diagnosticCycles = Math.max(2, Math.min(5, Math.trunc(options.diagnosticCycles ?? 2)));
  }

  currentNudge(): ProactiveNudge | null { return this.active; }

  resolveFile(workspaceId: string, relativePath: string): ProactiveObservation {
    try {
      return { nudge: null, resolved: this.resolveMatching((event) => event.workspaceId === workspaceId && event.relativePath === relativePath), failedSafely: false };
    } catch { return { ...EMPTY, failedSafely: true }; }
  }

  observeDiagnosticCycle(workspaceId: string, relativePath: string, diagnostics: DiagnosticSignal[], settings: ProactiveSettingsSnapshot): ProactiveObservation {
    try {
      if (!enabled(settings, "persistent_diagnostic")) return EMPTY;
      const errors = diagnostics.filter((item) => item.severity === "error");
      const present = new Set(errors.map((item) => normalizedFailureSignature("persistent_diagnostic", workspaceId, relativePath, item.line, item.message)));
      const resolved = this.resolveMatching((event) => event.detectorType === "persistent_diagnostic" && event.workspaceId === workspaceId && event.relativePath === relativePath && !present.has(event.normalizedSignature));
      let nudge: ProactiveNudge | null = null;
      for (const error of errors) {
        const signature = normalizedFailureSignature("persistent_diagnostic", workspaceId, relativePath, error.line, error.message);
        const event = this.upsert(signature, "persistent_diagnostic", workspaceId, relativePath, error.line, error.column, `An error-level diagnostic persisted after ${this.diagnosticCycles} save/validation cycles.`, [{ kind: "diagnostic", relativePath, line: error.line, column: error.column }]);
        if (!nudge && event.occurrenceCount >= this.diagnosticCycles) nudge = this.eligible(event, settings);
      }
      return { nudge, resolved, failedSafely: false };
    } catch { return { ...EMPTY, failedSafely: true }; }
  }

  observeObjectiveFailure(signal: ObjectiveFailureSignal, settings: ProactiveSettingsSnapshot): ProactiveObservation {
    try {
      const detector = detectorFor(signal.kind);
      if (!enabled(settings, detector)) return EMPTY;
      if (signal.succeeded) return { nudge: null, resolved: this.resolveMatching((event) => event.detectorType === detector && event.workspaceId === signal.workspaceId && (!signal.relativePath || event.relativePath === signal.relativePath)), failedSafely: false };
      const signature = normalizedFailureSignature(detector, signal.workspaceId, signal.relativePath, signal.line, signal.message);
      const repeated = this.events.has(signature);
      const label = signal.kind === "run" ? "controlled run" : `${signal.kind} action`;
      const reason = repeated ? `The same ${label} failure occurred again without a successful result.` : `An explicit ${label} returned a non-zero result.`;
      const referenceKind = signal.kind === "run" ? "run" : signal.kind;
      const event = this.upsert(signature, detector, signal.workspaceId, signal.relativePath, signal.line, signal.column, reason, [{ kind: referenceKind, ...(signal.relativePath ? { relativePath: signal.relativePath } : {}), ...(signal.line ? { line: signal.line } : {}), ...(signal.column ? { column: signal.column } : {}) }]);
      return { nudge: this.eligible(event, settings), resolved: [], failedSafely: false };
    } catch { return { ...EMPTY, failedSafely: true }; }
  }

  dismiss(_outcome: Exclude<ProactiveOutcome, "shown" | "resolved">): ProactiveEvent | null {
    const event = this.active?.event ?? null;
    if (event) this.dismissed.add(event.normalizedSignature);
    this.active = null;
    return event;
  }

  clearActive(): void { this.active = null; }

  private upsert(signature: string, detectorType: ProactiveDetectorType, workspaceId: string, relativePath: string | undefined, line: number | undefined, column: number | undefined, reason: string, contextReferences: ProactiveContextReference[]): ProactiveEvent {
    const now = this.now(); const previous = this.events.get(signature);
    const event: ProactiveEvent = previous && !previous.resolved ? { ...previous, lastSeenAt: now, occurrenceCount: previous.occurrenceCount + 1, resolved: false, reason, contextReferences } : { eventId: `local-${++this.counter}-${signature}`, detectorType, severity: "error", workspaceId, ...(relativePath ? { relativePath } : {}), ...(line ? { line } : {}), ...(column ? { column } : {}), normalizedSignature: signature, firstSeenAt: now, lastSeenAt: now, occurrenceCount: 1, resolved: false, reason, availableActions: ["investigate", "explain", "suggest_fix"], contextReferences, cooldownUntil: now };
    this.events.set(signature, event); return event;
  }

  private eligible(event: ProactiveEvent, settings: ProactiveSettingsSnapshot): ProactiveNudge | null {
    const now = this.now(); const cooldownMs = settings.cooldownMinutes * 60_000;
    if (this.active || this.dismissed.has(event.normalizedSignature) || settings.mutedErrors.includes(event.normalizedSignature) || (event.relativePath && settings.mutedFiles.includes(event.relativePath)) || settings.mutedProjects.includes(event.workspaceId) || now - this.lastShownAt < cooldownMs) return null;
    const recent = (this.shownByWorkspace.get(event.workspaceId) ?? []).filter((timestamp) => now - timestamp < 3_600_000);
    if (recent.length >= settings.maximumNudgesPerHour) { this.shownByWorkspace.set(event.workspaceId, recent); return null; }
    recent.push(now); this.shownByWorkspace.set(event.workspaceId, recent); this.lastShownAt = now;
    const subject = basename(event.relativePath); const repeated = event.occurrenceCount > 1 ? " again" : "";
    const title = event.detectorType === "failed_test" ? `A test failed${repeated}${event.relativePath ? ` in ${subject}` : ""}.` : event.detectorType === "failed_build" ? `Your build failed${repeated}.` : event.detectorType === "failed_run" ? `The controlled run failed${repeated}${event.relativePath ? ` in ${subject}` : ""}.` : `An error persists in ${subject}.`;
    this.active = { event: { ...event, cooldownUntil: now + cooldownMs }, title }; return this.active;
  }

  private resolveMatching(matches: (event: ProactiveEvent) => boolean): ProactiveEvent[] {
    const resolved: ProactiveEvent[] = [];
    for (const [signature, event] of Array.from(this.events.entries())) {
      if (event.resolved || !matches(event)) continue;
      const next = { ...event, resolved: true, lastSeenAt: this.now() }; this.events.set(signature, next); this.dismissed.delete(signature); resolved.push(next);
      if (this.active?.event.normalizedSignature === signature) this.active = null;
    }
    return resolved;
  }
}

export function proactiveFeedback(event: ProactiveEvent, outcome: ProactiveOutcome, timestamp = Date.now()): ProactiveFeedbackRecord {
  return { version: 1, detectorType: event.detectorType, severity: event.severity, workspaceId: event.workspaceId, signature: event.normalizedSignature, timestamp, outcome, resolved: outcome === "resolved" || event.resolved, ...(outcome === "resolved" ? { timeToResolutionMs: Math.max(0, timestamp - event.firstSeenAt) } : {}) };
}
