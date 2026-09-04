import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  ASSIST_PRESETS,
  INSIGHTS_VERSION,
  INSIGHT_DETECTORS,
  calculateInsights,
  sanitizedCsv,
  type AssistPreset,
  type EvaluationSession,
  type EvaluationSessionRequest,
  type InsightAction,
  type InsightMutation,
  type InsightsExportRequest,
  type InsightsQuery,
  type ObserverInsightsReport,
  type ProactiveInsightRecord,
  type UsefulnessFeedback,
} from "../shared/proactive-insights.ts";

interface InsightsEnvelope { version: typeof INSIGHTS_VERSION; records: ProactiveInsightRecord[]; sessions: EvaluationSession[] }
const EMPTY: InsightsEnvelope = { version: INSIGHTS_VERSION, records: [], sessions: [] };
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const preset = (value: unknown): value is AssistPreset => typeof value === "string" && value in ASSIST_PRESETS;
const action = (value: unknown): value is InsightAction => typeof value === "string" && ["investigate", "explain", "suggest_fix", "not_now", "mute_error", "mute_file", "mute_project", "disable_assist"].includes(value);
const usefulness = (value: unknown): value is UsefulnessFeedback => value === "yes" || value === "no" || value === "skip";
const finiteTime = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;

export function parseInsightRecord(value: unknown): ProactiveInsightRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<ProactiveInsightRecord>;
  const allowed = ["version", "eventId", "detectorType", "severity", "eligibleAt", "nudgeShownAt", "action", "actionAt", "usefulness", "resolvedAt", "preset"];
  if (Object.keys(item).some((key) => !allowed.includes(key)) || item.version !== INSIGHTS_VERSION || !uuid(item.eventId) || !INSIGHT_DETECTORS.includes(item.detectorType as never) || item.severity !== "error" || !finiteTime(item.eligibleAt) || !preset(item.preset)) return null;
  if (item.nudgeShownAt !== undefined && !finiteTime(item.nudgeShownAt)) return null;
  if (item.action !== undefined && !action(item.action)) return null;
  if (item.actionAt !== undefined && !finiteTime(item.actionAt)) return null;
  if (item.usefulness !== undefined && !usefulness(item.usefulness)) return null;
  if (item.resolvedAt !== undefined && !finiteTime(item.resolvedAt)) return null;
  return item as ProactiveInsightRecord;
}

function parseSession(value: unknown): EvaluationSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<EvaluationSession>; const allowed = ["version", "sessionId", "participantId", "startedAt", "endedAt", "preset"];
  if (Object.keys(item).some((key) => !allowed.includes(key)) || item.version !== INSIGHTS_VERSION || !uuid(item.sessionId) || typeof item.participantId !== "string" || !/^[A-Za-z0-9_-]{3,32}$/.test(item.participantId) || !finiteTime(item.startedAt) || !preset(item.preset) || (item.endedAt !== undefined && !finiteTime(item.endedAt))) return null;
  return item as EvaluationSession;
}

export function validateInsightMutation(value: unknown): InsightMutation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<InsightMutation>; const allowed = ["kind", "eventId", "detectorType", "severity", "timestamp", "preset", "action", "usefulness", "collectionEnabled"];
  if (Object.keys(item).some((key) => !allowed.includes(key)) || !["eligible", "shown", "action", "feedback", "resolved"].includes(String(item.kind)) || !uuid(item.eventId) || !finiteTime(item.timestamp) || typeof item.collectionEnabled !== "boolean") return null;
  if (item.kind === "eligible" && (!INSIGHT_DETECTORS.includes(item.detectorType as never) || item.severity !== "error" || !preset(item.preset))) return null;
  if (item.kind === "action" && !action(item.action)) return null;
  if (item.kind === "feedback" && !usefulness(item.usefulness)) return null;
  return item as InsightMutation;
}

export class ProactiveInsightsStore {
  readonly filePath: string;
  private pending: Promise<void> = Promise.resolve();
  constructor(userDataPath: string) { this.filePath = join(userDataPath, "proactive-observer-insights-v2.json"); }
  private serialized<T>(operation: () => Promise<T>): Promise<T> { const result = this.pending.then(operation, operation); this.pending = result.then(() => undefined, () => undefined); return result; }
  private async read(): Promise<InsightsEnvelope> {
    try {
      const value = JSON.parse(await readFile(this.filePath, "utf8"));
      if (!value || value.version !== INSIGHTS_VERSION || !Array.isArray(value.records) || !Array.isArray(value.sessions)) return EMPTY;
      return { version: INSIGHTS_VERSION, records: value.records.map(parseInsightRecord).filter((item: ProactiveInsightRecord | null): item is ProactiveInsightRecord => Boolean(item)).slice(-5_000), sessions: value.sessions.map(parseSession).filter((item: EvaluationSession | null): item is EvaluationSession => Boolean(item)).slice(-200) };
    } catch { return EMPTY; }
  }
  private async write(value: InsightsEnvelope) {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 }); const temporary = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 }); await rename(temporary, this.filePath);
  }
  private retained(records: ProactiveInsightRecord[], retentionDays: number, now = Date.now()) { const days = Math.max(7, Math.min(365, Math.trunc(retentionDays))); const cutoff = now - days * 86_400_000; return records.filter((item) => item.eligibleAt >= cutoff).slice(-5_000); }
  mutate(value: unknown, retentionDays: number): Promise<void> { return this.serialized(() => this.mutateNow(value, retentionDays)); }
  private async mutateNow(value: unknown, retentionDays: number): Promise<void> {
    const mutation = validateInsightMutation(value); if (!mutation) throw new Error("Invalid insight mutation."); if (!mutation.collectionEnabled) return;
    const all = await this.read(); let records = this.retained(all.records, retentionDays, mutation.timestamp); const index = records.findIndex((item) => item.eventId === mutation.eventId);
    if (mutation.kind === "eligible") {
      if (index < 0) records.push({ version: INSIGHTS_VERSION, eventId: mutation.eventId, detectorType: mutation.detectorType!, severity: "error", eligibleAt: mutation.timestamp, preset: mutation.preset! });
      else if (mutation.detectorType === "repeated_objective_failure") records[index] = { ...records[index], detectorType: mutation.detectorType };
    } else if (index >= 0) {
      const current = records[index]; records[index] = mutation.kind === "shown" ? { ...current, nudgeShownAt: current.nudgeShownAt ?? mutation.timestamp } : mutation.kind === "action" ? { ...current, action: mutation.action, actionAt: current.actionAt ?? mutation.timestamp } : mutation.kind === "feedback" ? { ...current, usefulness: mutation.usefulness } : { ...current, resolvedAt: current.resolvedAt ?? mutation.timestamp };
    }
    await this.write({ ...all, records });
  }
  session(value: unknown): Promise<EvaluationSession | null> { return this.serialized(() => this.sessionNow(value)); }
  private async sessionNow(value: unknown): Promise<EvaluationSession | null> {
    const request = value as Partial<EvaluationSessionRequest> | null; if (!request || !["start", "stop"].includes(String(request.action)) || !finiteTime(request.timestamp)) throw new Error("Invalid evaluation session request.");
    const timestamp = request.timestamp as number; const all = await this.read(); const activeIndex = all.sessions.findIndex((item) => item.endedAt === undefined);
    if (request.action === "start") {
      if (activeIndex >= 0 || typeof request.participantId !== "string" || !/^[A-Za-z0-9_-]{3,32}$/.test(request.participantId) || !preset(request.preset)) throw new Error("Invalid evaluation consent session.");
      const session: EvaluationSession = { version: INSIGHTS_VERSION, sessionId: randomUUID(), participantId: request.participantId, startedAt: timestamp, preset: request.preset }; await this.write({ ...all, sessions: [...all.sessions, session].slice(-200) }); return session;
    }
    if (activeIndex < 0) return null; const session = { ...all.sessions[activeIndex], endedAt: timestamp }; const sessions = [...all.sessions]; sessions[activeIndex] = session; await this.write({ ...all, sessions }); return session;
  }
  report(query: InsightsQuery): Promise<ObserverInsightsReport> { return this.serialized(() => this.reportNow(query)); }
  private async reportNow(query: InsightsQuery): Promise<ObserverInsightsReport> { const all = await this.read(); const retained = this.retained(all.records, query.retentionDays); await this.write({ ...all, records: retained }); const records = query.metricsCollectionEnabled ? retained : []; return calculateInsights(records, all.sessions, query); }
  export(request: InsightsExportRequest): Promise<{ content: string; extension: "json" | "csv" }> { return this.serialized(async () => { const report = await this.reportNow(request); return request.format === "json" ? { content: `${JSON.stringify({ label: "Proactive Observer evaluation data", ...report }, null, 2)}\n`, extension: "json" } : { content: sanitizedCsv(report), extension: "csv" }; }); }
  clear(): Promise<void> { return this.serialized(async () => { await unlink(this.filePath).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; }); }); }
}
