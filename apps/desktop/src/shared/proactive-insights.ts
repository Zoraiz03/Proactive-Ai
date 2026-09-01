import type { IpcResult } from "./workspace.ts";
import type { ProactiveAction, ProactiveDetectorType, ProactiveSeverity } from "./proactive-observer.ts";

export const INSIGHTS_VERSION = 2 as const;
export type AssistPreset = "low" | "balanced" | "high";
export type InsightDetectorType = ProactiveDetectorType | "repeated_objective_failure";
export type UsefulnessFeedback = "yes" | "no" | "skip";
export type InsightAction = ProactiveAction | "not_now" | "mute_error" | "mute_file" | "mute_project" | "disable_assist";

export interface ProactiveInsightRecord {
  version: typeof INSIGHTS_VERSION;
  eventId: string;
  detectorType: InsightDetectorType;
  severity: ProactiveSeverity;
  eligibleAt: number;
  nudgeShownAt?: number;
  action?: InsightAction;
  actionAt?: number;
  usefulness?: UsefulnessFeedback;
  resolvedAt?: number;
  preset: AssistPreset;
}

export interface EvaluationSession {
  version: typeof INSIGHTS_VERSION;
  sessionId: string;
  participantId: string;
  startedAt: number;
  endedAt?: number;
  preset: AssistPreset;
}

export interface DetectorMetrics {
  detectorType: InsightDetectorType;
  eligibleEvents: number;
  nudgesShown: number;
  investigate: number;
  explain: number;
  suggestFix: number;
  notNow: number;
  muted: number;
  resolved: number;
  unresolved: number;
  useful: number;
  notUseful: number;
  skipped: number;
  averageTimeToActionMs: number | null;
  averageTimeToResolutionMs: number | null;
  actionRate: number;
  dismissalRate: number;
  usefulFeedbackRate: number | null;
}

export interface ObserverInsightsReport {
  version: typeof INSIGHTS_VERSION;
  generatedAt: number;
  metricsCollectionEnabled: boolean;
  aggregate: DetectorMetrics;
  byDetector: DetectorMetrics[];
  mutedErrors: number;
  mutedFiles: number;
  mutedProjects: number;
  sessions: EvaluationSession[];
  activeSession: EvaluationSession | null;
  participantIds: string[];
  presetsUsed: AssistPreset[];
  records: ProactiveInsightRecord[];
}

export interface InsightMutation {
  kind: "eligible" | "shown" | "action" | "feedback" | "resolved";
  eventId: string;
  detectorType?: InsightDetectorType;
  severity?: ProactiveSeverity;
  timestamp: number;
  preset?: AssistPreset;
  action?: InsightAction;
  usefulness?: UsefulnessFeedback;
  collectionEnabled: boolean;
}

export interface EvaluationSessionRequest {
  action: "start" | "stop";
  participantId?: string;
  preset?: AssistPreset;
  timestamp: number;
}

export interface InsightsQuery {
  retentionDays: number;
  metricsCollectionEnabled: boolean;
  mutedErrors: number;
  mutedFiles: number;
  mutedProjects: number;
}

export interface InsightsExportRequest extends InsightsQuery { format: "json" | "csv" }

export const INSIGHTS_CHANNELS = {
  report: "insights:report",
  mutate: "insights:mutate",
  session: "insights:session",
  clear: "insights:clear",
  export: "insights:export",
} as const;

export interface InsightsBridge {
  report: (query: InsightsQuery) => Promise<IpcResult<ObserverInsightsReport>>;
  mutate: (mutation: InsightMutation, retentionDays: number) => Promise<IpcResult<void>>;
  session: (request: EvaluationSessionRequest) => Promise<IpcResult<EvaluationSession | null>>;
  clear: () => Promise<IpcResult<void>>;
  export: (request: InsightsExportRequest) => Promise<IpcResult<{ fileName: string }>>;
}

export const INSIGHT_DETECTORS: readonly InsightDetectorType[] = ["persistent_diagnostic", "failed_run", "failed_test", "failed_build", "repeated_objective_failure"];

const rate = (numerator: number, denominator: number) => denominator ? numerator / denominator : 0;
const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

export function calculateDetectorMetrics(records: readonly ProactiveInsightRecord[], detectorType: InsightDetectorType): DetectorMetrics {
  const items = detectorType === "repeated_objective_failure" ? records.filter((item) => item.detectorType === detectorType) : records.filter((item) => item.detectorType === detectorType);
  const shown = items.filter((item) => item.nudgeShownAt !== undefined);
  const acted = shown.filter((item) => item.actionAt !== undefined);
  const dismissed = shown.filter((item) => item.action === "not_now" || item.action?.startsWith("mute_") || item.action === "disable_assist");
  const answered = items.filter((item) => item.usefulness === "yes" || item.usefulness === "no");
  return {
    detectorType,
    eligibleEvents: items.length,
    nudgesShown: shown.length,
    investigate: items.filter((item) => item.action === "investigate").length,
    explain: items.filter((item) => item.action === "explain").length,
    suggestFix: items.filter((item) => item.action === "suggest_fix").length,
    notNow: items.filter((item) => item.action === "not_now").length,
    muted: items.filter((item) => item.action?.startsWith("mute_")).length,
    resolved: items.filter((item) => item.resolvedAt !== undefined).length,
    unresolved: items.filter((item) => item.resolvedAt === undefined).length,
    useful: items.filter((item) => item.usefulness === "yes").length,
    notUseful: items.filter((item) => item.usefulness === "no").length,
    skipped: items.filter((item) => item.usefulness === "skip").length,
    averageTimeToActionMs: average(acted.map((item) => Math.max(0, item.actionAt! - item.nudgeShownAt!))),
    averageTimeToResolutionMs: average(items.filter((item) => item.resolvedAt !== undefined && item.nudgeShownAt !== undefined).map((item) => Math.max(0, item.resolvedAt! - item.nudgeShownAt!))),
    actionRate: rate(acted.length, shown.length),
    dismissalRate: rate(dismissed.length, shown.length),
    usefulFeedbackRate: answered.length ? rate(items.filter((item) => item.usefulness === "yes").length, answered.length) : null,
  };
}

export function calculateInsights(records: readonly ProactiveInsightRecord[], sessions: readonly EvaluationSession[], query: InsightsQuery, generatedAt = Date.now()): ObserverInsightsReport {
  const byDetector = INSIGHT_DETECTORS.map((detector) => calculateDetectorMetrics(records, detector));
  const aggregate = calculateDetectorMetrics(records.map((item) => ({ ...item, detectorType: "repeated_objective_failure" })), "repeated_objective_failure");
  aggregate.detectorType = "repeated_objective_failure";
  const participants = Array.from(new Set(sessions.map((item) => item.participantId)));
  const activeSession = [...sessions].reverse().find((item) => item.endedAt === undefined) ?? null;
  return { version: INSIGHTS_VERSION, generatedAt, metricsCollectionEnabled: query.metricsCollectionEnabled, aggregate, byDetector, mutedErrors: query.mutedErrors, mutedFiles: query.mutedFiles, mutedProjects: query.mutedProjects, sessions: [...sessions], activeSession, participantIds: participants, presetsUsed: Array.from(new Set(records.map((item) => item.preset))), records: [...records] };
}

export interface AssistPresetDefinition {
  id: AssistPreset;
  label: string;
  description: string;
  diagnosticCycles: number;
  cooldownMinutes: number;
  maximumPerHour: number;
  failedRunOccurrences: number;
}

export const ASSIST_PRESETS: Readonly<Record<AssistPreset, AssistPresetDefinition>> = Object.freeze({
  low: { id: "low", label: "Low", description: "Only strongest repeated or high-confidence failures; longest quiet period.", diagnosticCycles: 3, cooldownMinutes: 30, maximumPerHour: 1, failedRunOccurrences: 2 },
  balanced: { id: "balanced", label: "Balanced", description: "Recommended Phase 10A behavior with conservative limits.", diagnosticCycles: 2, cooldownMinutes: 10, maximumPerHour: 3, failedRunOccurrences: 1 },
  high: { id: "high", label: "High", description: "More objective failure nudges with a shorter, still safe quiet period.", diagnosticCycles: 2, cooldownMinutes: 5, maximumPerHour: 5, failedRunOccurrences: 1 },
});

export interface TuningRecommendation { id: string; message: string; setting: "proactiveFailedRuns"; nextValue: false; explanation: string }

export function recommendTuning(report: ObserverInsightsReport, dismissedIds: readonly string[]): TuningRecommendation | null {
  const failedRuns = report.byDetector.find((item) => item.detectorType === "failed_run");
  const id = "reduce-failed-run-sensitivity";
  if (!failedRuns || failedRuns.nudgesShown < 5 || failedRuns.dismissalRate < 0.8 || dismissedIds.includes(id)) return null;
  return { id, message: `You dismissed ${Math.round(failedRuns.dismissalRate * 100)}% of failed-run nudges.`, setting: "proactiveFailedRuns", nextValue: false, explanation: "Apply Recommendation will disable failed-run nudges. It will not change any setting automatically." };
}

export function sanitizedCsv(report: ObserverInsightsReport): string {
  const header = "detector,eligible_events,nudges_shown,action_rate,dismissal_rate,useful_feedback_rate,resolved,unresolved,average_time_to_action_ms,average_time_to_resolution_ms";
  const rows = report.byDetector.map((item) => [item.detectorType, item.eligibleEvents, item.nudgesShown, item.actionRate, item.dismissalRate, item.usefulFeedbackRate ?? "", item.resolved, item.unresolved, item.averageTimeToActionMs ?? "", item.averageTimeToResolutionMs ?? ""].join(","));
  return ["# Proactive Observer evaluation data", `# sessions=${report.sessions.length}`, header, ...rows].join("\n") + "\n";
}
