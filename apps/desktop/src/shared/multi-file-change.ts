import type { ObserverProvider, ObserverRequest } from "./observer.ts";
import type { IpcResult } from "./workspace.ts";
import { isMandatorySecretFile } from "./settings.ts";

export const MULTI_FILE_CHANNELS = {
  plan: "multi-file:plan",
  prepare: "multi-file:prepare",
  generate: "multi-file:generate",
  apply: "multi-file:apply",
  undo: "multi-file:undo",
  outcome: "multi-file:outcome",
} as const;

export interface MultiFileLimits {
  maximumFiles: number;
  maximumChangedLines: number;
  maximumGeneratedBytes: number;
}

export interface PlannedFileChange {
  operation: "update" | "create";
  relativePath: string;
  reason: string;
}

export interface MultiFilePlan {
  planId: string;
  summary: string;
  files: PlannedFileChange[];
  risks: string[];
  verificationSuggestions: string[];
}

export interface ExistingFileBase {
  operation: "update";
  relativePath: string;
  originalContentHash: string;
  originalContent: string;
}

export interface NewFileBase {
  operation: "create";
  relativePath: string;
  expectedAbsent: true;
}

export type MultiFileBase = ExistingFileBase | NewFileBase;

export interface ExistingFileChange extends ExistingFileBase {
  proposedContent: string;
  explanation: string;
}

export interface NewFileChange extends NewFileBase {
  proposedContent: string;
  explanation: string;
}

export type MultiFileChange = ExistingFileChange | NewFileChange;

export interface MultiFileChangeSet {
  changeSetId: string;
  planId: string;
  summary: string;
  explanation: string;
  warnings: string[];
  verificationSuggestions: string[];
  changes: MultiFileChange[];
}

export interface MultiFilePlanRequest {
  provider: ObserverProvider;
  model?: string;
  storeHistory: boolean;
  userRequest: string;
  context: ObserverRequest;
  limits: MultiFileLimits;
}

export interface MultiFileGenerateRequest extends MultiFilePlanRequest {
  plan: MultiFilePlan;
  fileBases: MultiFileBase[];
}

export interface MultiFileApplyRequest {
  workspaceId: string;
  plan: MultiFilePlan;
  changeSet: MultiFileChangeSet;
  dirtyPaths: string[];
  limits: MultiFileLimits;
  checkpointRetentionLimit: number;
}

export interface AppliedFileSnapshot {
  relativePath: string;
  content: string;
  modifiedAtMs: number;
  created: boolean;
}

export interface MultiFileApplyResult {
  files: AppliedFileSnapshot[];
  addedLines: number;
  deletedLines: number;
}

export interface MultiFileUndoResult {
  restoredFiles: AppliedFileSnapshot[];
  removedPaths: string[];
  changeSetId: string;
}

export interface MultiFileOutcomeRequest {
  storeHistory: boolean;
  phase: "plan" | "change_set" | "apply" | "rollback";
  outcome: "approved" | "rejected" | "accepted" | "failed" | "rolled_back" | "rollback_conflict";
  provider: ObserverProvider;
  model?: string;
  planId?: string;
  changeSetId?: string;
  fileCount: number;
  updateCount: number;
  createCount: number;
  changedLines: number;
  durationMs: number;
}

export interface MultiFileBridge {
  plan: (request: MultiFilePlanRequest) => Promise<IpcResult<{ plan: MultiFilePlan; provider: ObserverProvider }>>;
  prepare: (plan: MultiFilePlan, limits: MultiFileLimits) => Promise<IpcResult<MultiFileBase[]>>;
  generate: (request: MultiFileGenerateRequest) => Promise<IpcResult<{ changeSet: MultiFileChangeSet; provider: ObserverProvider }>>;
  apply: (request: MultiFileApplyRequest) => Promise<IpcResult<MultiFileApplyResult>>;
  undo: (request: { workspaceId: string; dirtyPaths: string[] }) => Promise<IpcResult<MultiFileUndoResult>>;
  outcome: (request: MultiFileOutcomeRequest) => Promise<IpcResult<void>>;
}

const SUPPORTED = new Set(["js", "mjs", "jsx", "ts", "tsx", "py", "java", "c", "cpp", "h", "html", "css", "json", "md", "mdx", "txt", "yml", "yaml"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const plain = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value);
const boundedText = (value: unknown, maximum: number) => typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
const boundedList = (value: unknown, maximumItems: number, maximumText: number): value is string[] => Array.isArray(value) && value.length <= maximumItems && value.every((item) => boundedText(item, maximumText));

export function isSafeChangeSetPath(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 4096 || value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || value.includes("\0") || value.includes("\\")) return false;
  const segments = value.split("/");
  const extension = segments.at(-1)?.split(".").at(-1)?.toLowerCase() ?? "";
  return !segments.some((segment) => !segment || segment === "." || segment === "..") && SUPPORTED.has(extension) && !isMandatorySecretFile(value) && !segments.some((segment) => segment === ".git");
}

export function normalizeMultiFileLimits(value: unknown): MultiFileLimits | null {
  if (!plain(value)) return null;
  const { maximumFiles, maximumChangedLines, maximumGeneratedBytes } = value;
  if (!Number.isInteger(maximumFiles) || (maximumFiles as number) < 1 || (maximumFiles as number) > 10 ||
    !Number.isInteger(maximumChangedLines) || (maximumChangedLines as number) < 25 || (maximumChangedLines as number) > 5000 ||
    !Number.isInteger(maximumGeneratedBytes) || (maximumGeneratedBytes as number) < 10_000 || (maximumGeneratedBytes as number) > 1_000_000) return null;
  return { maximumFiles: maximumFiles as number, maximumChangedLines: maximumChangedLines as number, maximumGeneratedBytes: maximumGeneratedBytes as number };
}

export function parseMultiFilePlan(value: unknown, limits: MultiFileLimits): MultiFilePlan | null {
  if (!plain(value) || !exactKeys(value, ["planId", "summary", "files", "risks", "verificationSuggestions"]) || !UUID.test(String(value.planId)) || !boundedText(value.summary, 2000) || !boundedList(value.risks, 20, 500) || !boundedList(value.verificationSuggestions, 20, 500) || !Array.isArray(value.files) || value.files.length < 1 || value.files.length > limits.maximumFiles) return null;
  const paths = new Set<string>();
  const files: PlannedFileChange[] = [];
  for (const item of value.files) {
    if (!plain(item) || !exactKeys(item, ["operation", "relativePath", "reason"]) || !["update", "create"].includes(String(item.operation)) || !isSafeChangeSetPath(item.relativePath) || !boundedText(item.reason, 1000) || paths.has(item.relativePath)) return null;
    paths.add(item.relativePath);
    files.push(item as unknown as PlannedFileChange);
  }
  return { planId: String(value.planId), summary: String(value.summary), files, risks: value.risks as string[], verificationSuggestions: value.verificationSuggestions as string[] };
}

export function lineDiffStats(original: string, proposed: string): { added: number; deleted: number; changed: number } {
  const before = original.split("\n"); const after = proposed.split("\n");
  let prefix = 0; while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0; while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;
  const deleted = Math.max(0, before.length - prefix - suffix);
  const added = Math.max(0, after.length - prefix - suffix);
  return { added, deleted, changed: added + deleted };
}

export function validateMultiFileChangeSet(value: unknown, plan: MultiFilePlan, bases: MultiFileBase[], limits: MultiFileLimits): MultiFileChangeSet | null {
  if (!plain(value) || !exactKeys(value, ["changeSetId", "planId", "summary", "explanation", "warnings", "verificationSuggestions", "changes"]) || !UUID.test(String(value.changeSetId)) || value.planId !== plan.planId || !boundedText(value.summary, 2000) || !boundedText(value.explanation, 10_000) || !boundedList(value.warnings, 20, 500) || !boundedList(value.verificationSuggestions, 20, 500) || !Array.isArray(value.changes) || value.changes.length !== plan.files.length || value.changes.length > limits.maximumFiles) return null;
  const baseMap = new Map(bases.map((base) => [base.relativePath, base]));
  const planMap = new Map(plan.files.map((file) => [file.relativePath, file]));
  const seen = new Set<string>(); let bytes = 0; let changedLines = 0;
  const changes: MultiFileChange[] = [];
  for (const item of value.changes) {
    if (!plain(item) || !isSafeChangeSetPath(item.relativePath) || seen.has(item.relativePath) || !boundedText(item.explanation, 2000) || typeof item.proposedContent !== "string") return null;
    const planned = planMap.get(item.relativePath); const base = baseMap.get(item.relativePath);
    if (!planned || !base || item.operation !== planned.operation || item.operation !== base.operation) return null;
    bytes += new TextEncoder().encode(item.proposedContent).byteLength;
    if (item.operation === "update") {
      if (!exactKeys(item, ["operation", "relativePath", "originalContentHash", "originalContent", "proposedContent", "explanation"]) || base.operation !== "update" || item.originalContentHash !== base.originalContentHash || item.originalContent !== base.originalContent || !HASH.test(String(item.originalContentHash)) || item.proposedContent === item.originalContent) return null;
      changedLines += lineDiffStats(item.originalContent, item.proposedContent).changed;
    } else {
      if (!exactKeys(item, ["operation", "relativePath", "expectedAbsent", "proposedContent", "explanation"]) || base.operation !== "create" || item.expectedAbsent !== true || item.proposedContent.length === 0) return null;
      changedLines += item.proposedContent.split("\n").length;
    }
    seen.add(item.relativePath); changes.push(item as unknown as MultiFileChange);
  }
  if (seen.size !== plan.files.length || plan.files.some((file) => !seen.has(file.relativePath)) || bytes > limits.maximumGeneratedBytes || changedLines > limits.maximumChangedLines) return null;
  return { changeSetId: String(value.changeSetId), planId: String(value.planId), summary: String(value.summary), explanation: String(value.explanation), warnings: value.warnings as string[], verificationSuggestions: value.verificationSuggestions as string[], changes };
}
