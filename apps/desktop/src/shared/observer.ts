import { validImproveContext, type ImproveCodeContext, type ImproveOutcome } from "./improve-code.ts";
import { validFixContext, type FixCodeContext, type FixCodeOutcome, type FixCodeResult } from "./fix-code.ts";
import { validExplanationInput, type ExplanationInput, type ExplanationResult } from "./explanation.ts";
import type { IpcResult } from "./workspace";
import { validateProjectContextPackage, type ProjectContextPackage, type ProjectContextSeed } from "./project-context.ts";
import type { ObserverEditBase, StructuredObserverEdit } from "./ai-edit.ts";
import { CONTEXT_TRAY_MAX_ITEMS, validateContextTrayItem } from "./context-tray.ts";
import type { DocumentationDraftRequest, StructuredDocumentationEdit } from "./documentation-update.ts";

export const CODE_OBSERVER_MODES = [
  "explain",
  "fix_error",
  "improve_code",
  "continue_code",
  "generate_tests",
  "add_comments",
  "plan_multi_file",
] as const;

export const DOCUMENT_OBSERVER_MODES = [
  "explain_document",
  "improve_writing",
  "summarize",
  "generate_readme_section",
] as const;

export const OBSERVER_MODES = [...CODE_OBSERVER_MODES, ...DOCUMENT_OBSERVER_MODES] as const;

export const OBSERVER_PROVIDERS = [
  "gemini",
  "deepseek",
  "openai",
  "anthropic",
  "demo",
] as const;

export const OBSERVER_CHANNELS = {
  prepare: "observer:prepare",
  improveStart: "observer:improve-start",
  improveClarify: "observer:improve-clarify",
  improveClear: "observer:improve-clear",
  fixStart: "observer:fix-start",
  fixClarify: "observer:fix-clarify",
  fixClear: "observer:fix-clear",
  explain: "observer:explain",
  followup: "observer:followup",
  cancelExplanation: "observer:cancel-explanation",
  clearExplanation: "observer:clear-explanation",
  ask: "observer:ask",
  outcome: "observer:outcome",
  copy: "observer:copy",
  documentationDraft: "observer:documentation-draft",
} as const;

export type ObserverMode = typeof OBSERVER_MODES[number];
export type ObserverProvider = typeof OBSERVER_PROVIDERS[number];
export type ObserverContextSource = "selection" | "cursor" | "diagnostic";
export type ObserverKind = "code" | "doc";

export const OBSERVER_MODE_LABELS: Readonly<Record<ObserverMode, string>> = {
  explain: "Explain",
  fix_error: "Fix Code",
  improve_code: "Improve Code",
  continue_code: "Continue Code",
  generate_tests: "Generate Tests",
  add_comments: "Add Comments/Documentation",
  plan_multi_file: "Plan Multi-File Change",
  explain_document: "Explain this document",
  improve_writing: "Improve writing",
  summarize: "Summarize",
  generate_readme_section: "Generate README section",
};

export const OBSERVER_PROVIDER_LABELS: Readonly<Record<ObserverProvider, string>> = {
  gemini: "Gemini",
  deepseek: "DeepSeek",
  openai: "ChatGPT",
  anthropic: "Claude",
  demo: "Demo (offline)",
};

export const OBSERVER_LIMITS = {
  selectedCode: 20_000,
  nearbyCode: 20_000,
  activeFile: 50_000,
  runError: 8_000,
  diagnosticMessage: 2_000,
  snippet: 50_000,
} as const;

export interface ObserverDiagnosticContext {
  fileName: string;
  line: number;
  column: number;
  message: string;
}

export interface ObserverRequest {
  improveCode?: ImproveCodeContext;
  fixCode?: FixCodeContext;
  explanation?: ExplanationInput;
  liveObserver?: boolean;
  automaticRun?: { trigger: "failed_run"; runId: string };
  provider: ObserverProvider;
  model?: string;
  storeHistory?: boolean;
  mode: ObserverMode;
  kind: ObserverKind;
  fileName: string;
  language: string;
  source: ObserverContextSource;
  cursorLine: number;
  cursorColumn: number;
  selectedCode?: string;
  nearbyCode?: string;
  diagnostic?: ObserverDiagnosticContext;
  runError?: string;
  activeFile?: string;
  contextPackage?: ProjectContextPackage;
  editBase?: ObserverEditBase;
}

export interface ObserverPrepareRequest {
  provider: ObserverProvider;
  model?: string;
  storeHistory?: boolean;
  seed: ProjectContextSeed;
}

export interface ObserverSuggestion {
  improveOutcome?: ImproveOutcome;
  tradeoffs?: string;
  fixOutcome?: FixCodeOutcome;
  clarificationQuestion?: string;
  verification?: string;
  historyWarning?: string;
  id?: string;
  explanation: string;
  snippet: string;
  reason: string;
  edit?: StructuredObserverEdit;
}

export interface ObserverAskResult {
  suggestion: ObserverSuggestion;
  provider: ObserverProvider;
}

export interface ObserverOutcomeRequest {
  suggestionId: string;
  outcome: "accepted" | "dismissed";
}

export interface ObserverBridge {
  improveStart: (id: string, request: ObserverRequest) => Promise<IpcResult<FixCodeResult>>;
  improveClarify: (id: string, answer: string, sourceHash: string) => Promise<IpcResult<FixCodeResult>>;
  improveClear: () => Promise<void>;
  fixStart: (id: string, request: ObserverRequest) => Promise<IpcResult<FixCodeResult>>;
  fixClarify: (id: string, answer: string, sourceHash: string) => Promise<IpcResult<FixCodeResult>>;
  fixClear: () => Promise<void>;
  explain: (id: string, request: ObserverRequest) => Promise<IpcResult<ExplanationResult>>;
  followup: (id: string, question: string) => Promise<IpcResult<ExplanationResult>>;
  cancelExplanation: () => Promise<void>;
  clearExplanation: () => Promise<void>;
  prepare: (request: ObserverPrepareRequest) => Promise<IpcResult<ObserverRequest>>;
  ask: (request: ObserverRequest) => Promise<IpcResult<ObserverAskResult>>;
  recordOutcome: (request: ObserverOutcomeRequest) => Promise<IpcResult<void>>;
  copySnippet: (snippet: string) => Promise<IpcResult<void>>;
  documentationDraft: (request: DocumentationDraftRequest) => Promise<IpcResult<{ edit: StructuredDocumentationEdit; provider: ObserverProvider }>>;
}

export interface CreateObserverRequestInput {
  provider: ObserverProvider;
  mode: ObserverMode;
  kind: ObserverKind;
  fileName: string;
  language: string;
  content: string;
  cursorLine: number;
  cursorColumn: number;
  selectedCode?: string;
  nearbyCode?: string;
  diagnostic?: ObserverDiagnosticContext;
  runError?: string;
  maximumContextChars?: number;
  model?: string;
  storeHistory?: boolean;
}

function bounded(value: string | undefined, limit: number): string | undefined {
  if (!value?.trim()) return undefined;
  return value.slice(0, limit);
}

export function isSensitiveObserverFile(fileName: string): boolean {
  const normalized = fileName.trim().toLowerCase();
  return /^\.env(?:\.|$)/.test(normalized) ||
    [".npmrc", ".pypirc", ".netrc", "credentials", "id_rsa", "id_ed25519"].includes(normalized) ||
    /\.(?:pem|key|p12|pfx)$/.test(normalized);
}

export function containsLikelySecret(value: string | undefined): boolean {
  if (!value) return false;
  return /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value) ||
    /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)\b\s*[:=]\s*["']?[A-Za-z0-9_./+\-=]{12,}/i.test(value);
}

export function createObserverRequest(input: CreateObserverRequestInput): ObserverRequest | null {
  const fileName = input.fileName.trim();
  if (!fileName || /[\\/]/.test(fileName) || fileName.length > 255 || isSensitiveObserverFile(fileName)) {
    return null;
  }
  if (!OBSERVER_MODES.includes(input.mode) || !OBSERVER_PROVIDERS.includes(input.provider)) return null;
  if (containsLikelySecret(input.selectedCode) || containsLikelySecret(input.nearbyCode) || containsLikelySecret(input.content) || containsLikelySecret(input.runError)) return null;
  if (!isObserverModeForKind(input.mode, input.kind)) return null;

  const cursorLine = Math.max(1, Math.trunc(input.cursorLine));
  const cursorColumn = Math.max(1, Math.trunc(input.cursorColumn));
  const requestedLimit = Math.max(1_000, Math.min(OBSERVER_LIMITS.activeFile, Math.trunc(input.maximumContextChars ?? OBSERVER_LIMITS.selectedCode)));
  const selectedCode = bounded(input.selectedCode, Math.min(OBSERVER_LIMITS.selectedCode, requestedLimit));
  const nearbyCode = bounded(input.nearbyCode, Math.min(OBSERVER_LIMITS.nearbyCode, requestedLimit));
  const diagnostic = input.mode === "fix_error" && input.diagnostic
    ? {
        fileName,
        line: Math.max(1, Math.trunc(input.diagnostic.line)),
        column: Math.max(1, Math.trunc(input.diagnostic.column)),
        message: input.diagnostic.message.slice(0, OBSERVER_LIMITS.diagnosticMessage),
      }
    : undefined;
  const source: ObserverContextSource = selectedCode
    ? "selection"
    : diagnostic
      ? "diagnostic"
      : "cursor";
  const fullContextMode = input.mode === "generate_tests" ||
    input.mode === "explain_document" ||
    input.mode === "summarize" ||
    input.mode === "generate_readme_section";
  const activeFile = fullContextMode && !selectedCode && input.content.length <= requestedLimit
    ? bounded(input.content, requestedLimit)
    : undefined;
  const runError = diagnostic
    ? bounded(input.runError, OBSERVER_LIMITS.runError)
    : undefined;
  if (!selectedCode && !nearbyCode && !activeFile && !diagnostic) return null;

  return {
    provider: input.provider,
    ...(input.model ? { model: input.model.slice(0, 100) } : {}),
    ...(input.storeHistory === false ? { storeHistory: false } : {}),
    mode: input.mode,
    kind: input.kind,
    fileName,
    language: input.language.slice(0, 64) || "plaintext",
    source,
    cursorLine,
    cursorColumn,
    ...(selectedCode ? { selectedCode } : {}),
    ...(nearbyCode ? { nearbyCode } : {}),
    ...(diagnostic ? { diagnostic } : {}),
    ...(runError ? { runError } : {}),
    ...(activeFile ? { activeFile } : {}),
  };
}

export function observerContextSummary(request: ObserverRequest): string {
  if (request.contextPackage) {
    return `${request.contextPackage.items.length} focused context item${request.contextPackage.items.length === 1 ? "" : "s"} · ~${request.contextPackage.estimatedTokens} tokens`;
  }
  if (request.source === "selection") {
    return `Sending selected ${request.kind === "doc" ? "text" : "code"} from ${request.fileName}`;
  }
  if (request.source === "diagnostic" && request.diagnostic) {
    return `Sending error on line ${request.diagnostic.line} from ${request.fileName}`;
  }
  if (request.activeFile) {
    if (request.mode === "generate_tests") return `Sending active file ${request.fileName} for test generation`;
    return `Sending active document ${request.fileName} for ${OBSERVER_MODE_LABELS[request.mode].toLowerCase()}`;
  }
  return `Sending nearby ${request.kind === "doc" ? "text" : "code"} around line ${request.cursorLine} from ${request.fileName}`;
}

export function isObserverModeForKind(mode: ObserverMode, kind: ObserverKind): boolean {
  return kind === "doc"
    ? DOCUMENT_OBSERVER_MODES.includes(mode as typeof DOCUMENT_OBSERVER_MODES[number])
    : CODE_OBSERVER_MODES.includes(mode as typeof CODE_OBSERVER_MODES[number]);
}

export function relevantObserverRunError(
  output: string | undefined,
  diagnostic: ObserverDiagnosticContext | undefined
): string | undefined {
  if (!output || !diagnostic) return undefined;
  const lines = output.split(/\r?\n/);
  const messageNeedle = diagnostic.message.trim();
  const locationNeedle = `${diagnostic.fileName}:${diagnostic.line}`;
  const index = lines.findIndex((line) =>
    (messageNeedle && line.includes(messageNeedle)) || line.includes(locationNeedle)
  );
  if (index < 0) return undefined;
  return bounded(lines.slice(Math.max(0, index - 2), index + 3).join("\n"), OBSERVER_LIMITS.runError);
}

export function isObserverAskShortcut(event: { key: string; ctrlKey: boolean; metaKey: boolean }): boolean {
  return event.key === "Enter" && (event.ctrlKey || event.metaKey);
}

export function isObserverDismissShortcut(event: { key: string }): boolean {
  return event.key === "Escape";
}

export async function copyObserverSnippet(
  snippet: string,
  writeText: (value: string) => Promise<void>
): Promise<boolean> {
  if (!snippet || snippet.length > OBSERVER_LIMITS.snippet) return false;
  try {
    await writeText(snippet);
    return true;
  } catch {
    return false;
  }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function optionalBoundedString(value: unknown, maximum: number): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.length > 0 && value.length <= maximum);
}

export function validateObserverPrepareRequest(value: unknown): ObserverPrepareRequest | null {
  if (!value || typeof value !== "object") return null;
  const request = value as Partial<ObserverPrepareRequest>;
  if (!OBSERVER_PROVIDERS.includes(request.provider as ObserverProvider) || !request.seed || typeof request.seed !== "object") return null;
  const seed = request.seed as Partial<ProjectContextSeed>;
  if (!OBSERVER_MODES.includes(seed.mode as ObserverMode) || !["code", "doc"].includes(seed.kind ?? "") || typeof seed.activeRelativePath !== "string" || !seed.activeRelativePath || seed.activeRelativePath.length > 4096 || typeof seed.fileName !== "string" || typeof seed.language !== "string" || typeof seed.content !== "string" || seed.content.length > (["fix_error","improve_code"].includes(seed.mode ?? "") ? 2 * 1024 * 1024 : OBSERVER_LIMITS.activeFile)) return null;
  if (!isPositiveInteger(seed.cursorLine) || !isPositiveInteger(seed.cursorColumn) || !Array.isArray(seed.exclusions) || seed.exclusions.some((item) => typeof item !== "string")) return null;
  if (!isPositiveInteger(seed.maximumTotalCharacters) || !isPositiveInteger(seed.maximumRelatedFiles) || !isPositiveInteger(seed.maximumCharactersPerFile)) return null;
  if (seed.improveGoal !== undefined && !["readability","performance"].includes(seed.improveGoal)) return null;
  if (seed.improveFullFile !== undefined && typeof seed.improveFullFile !== "boolean") return null;
  if (seed.fixDiagnostics !== undefined && (!Array.isArray(seed.fixDiagnostics) || seed.fixDiagnostics.length > 10 || seed.fixDiagnostics.some(d => !d || !isPositiveInteger(d.line) || !isPositiveInteger(d.column) || typeof d.message !== 'string' || d.message.length > 2000))) return null;
  if (seed.fixRunEvidence !== undefined && (!seed.fixRunEvidence || typeof seed.fixRunEvidence.output !== 'string' || seed.fixRunEvidence.output.length > 8000 || (seed.fixRunEvidence.sourceHash !== undefined && !/^[a-f0-9]{64}$/.test(seed.fixRunEvidence.sourceHash)) || (seed.fixRunEvidence.sourceUnchanged !== undefined && typeof seed.fixRunEvidence.sourceUnchanged !== 'boolean'))) return null;
  if (seed.selectionRange !== undefined && !validFixContext({scope:'selection',range:seed.selectionRange,clarifications:[]})) return null;
  if (seed.userRequest !== undefined && (typeof seed.userRequest !== "string" || !seed.userRequest.trim() || seed.userRequest.length > 500)) return null;
  if (seed.trayItems !== undefined && (!Array.isArray(seed.trayItems) || seed.trayItems.length > CONTEXT_TRAY_MAX_ITEMS || seed.trayItems.some((item) => !validateContextTrayItem(item)))) return null;
  if (seed.mode === "plan_multi_file" && !seed.userRequest) return null;
  if (request.model !== undefined && (typeof request.model !== "string" || !request.model || request.model.length > 100)) return null;
  if (request.storeHistory !== undefined && typeof request.storeHistory !== "boolean") return null;
  return request as ObserverPrepareRequest;
}

export function validateObserverRequest(value: unknown): ObserverRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const request = value as Partial<ObserverRequest>;
  if (request.improveCode !== undefined && (!validImproveContext(request.improveCode) || request.mode !== "improve_code" || request.kind !== "code" || !request.editBase || !request.contextPackage || request.fixCode || request.explanation || request.liveObserver || request.automaticRun)) return null;
  if (request.fixCode !== undefined && (!validFixContext(request.fixCode) || request.mode !== "fix_error" || request.kind !== "code" || !request.editBase || !request.contextPackage || request.explanation || request.liveObserver || request.automaticRun)) return null;
  if (request.explanation !== undefined && (!validExplanationInput(request.explanation) || request.mode !== "explain" || request.kind !== "code" || request.storeHistory !== false || request.editBase || request.liveObserver || request.automaticRun)) return null;
  const contextPackage = request.contextPackage === undefined ? undefined : validateProjectContextPackage(request.contextPackage);
  if (
    !OBSERVER_PROVIDERS.includes(request.provider as ObserverProvider) ||
    !OBSERVER_MODES.includes(request.mode as ObserverMode) ||
    !["code", "doc"].includes(request.kind ?? "") ||
    !["selection", "cursor", "diagnostic"].includes(request.source ?? "") ||
    typeof request.fileName !== "string" || !request.fileName || request.fileName.length > 255 ||
    /[\\/]/.test(request.fileName) || isSensitiveObserverFile(request.fileName) ||
    typeof request.language !== "string" || !request.language || request.language.length > 64 ||
    !isPositiveInteger(request.cursorLine) || !isPositiveInteger(request.cursorColumn) ||
    !optionalBoundedString(request.selectedCode, OBSERVER_LIMITS.selectedCode) ||
    !optionalBoundedString(request.nearbyCode, OBSERVER_LIMITS.nearbyCode) ||
    !optionalBoundedString(request.activeFile, OBSERVER_LIMITS.activeFile) ||
    !optionalBoundedString(request.runError, OBSERVER_LIMITS.runError)
  ) return null;
  if (request.model !== undefined && (typeof request.model !== "string" || request.model.length < 1 || request.model.length > 100)) return null;
  if (request.storeHistory !== undefined && typeof request.storeHistory !== "boolean") return null;
  if (!isObserverModeForKind(request.mode as ObserverMode, request.kind as ObserverKind)) return null;
  if (request.contextPackage !== undefined && !contextPackage) return null;
  if (request.editBase !== undefined && (!request.contextPackage || typeof request.editBase !== "object" || request.editBase.targetRelativePath !== contextPackage?.activeFile.relativePath || !/^[a-f0-9]{64}$/.test(request.editBase.originalContentHash) || !Number.isInteger(request.editBase.contentLength) || request.editBase.contentLength < 0 || typeof request.editBase.basedOnUnsavedContent !== "boolean")) return null;
  if (!contextPackage && !request.selectedCode && !request.nearbyCode && !request.activeFile && !request.diagnostic) return null;
  if (contextPackage && (contextPackage.intent.mode !== request.mode || contextPackage.activeFile.fileName !== request.fileName || contextPackage.activeFile.language !== request.language || contextPackage.activeFile.kind !== request.kind || contextPackage.cursor.line !== request.cursorLine || contextPackage.cursor.column !== request.cursorColumn)) return null;
  if (request.activeFile && !["generate_tests", "explain_document", "summarize", "generate_readme_section"].includes(request.mode as string)) return null;

  if (!contextPackage && request.runError && !request.diagnostic) return null;
  if (!contextPackage && request.source === "selection" && !request.selectedCode) return null;
  if (!contextPackage && request.source === "diagnostic" && (!request.diagnostic || request.mode !== "fix_error")) return null;
  if (request.diagnostic) {
    if (
      request.mode !== "fix_error" ||
      request.diagnostic.fileName !== request.fileName ||
      !isPositiveInteger(request.diagnostic.line) ||
      !isPositiveInteger(request.diagnostic.column) ||
      typeof request.diagnostic.message !== "string" ||
      !request.diagnostic.message ||
      request.diagnostic.message.length > OBSERVER_LIMITS.diagnosticMessage
    ) return null;
  }
  return {
    ...(request.improveCode ? {improveCode:request.improveCode} : {}),
    ...(request.fixCode ? { fixCode: request.fixCode } : {}),
    ...(request.explanation ? { explanation: request.explanation } : {}),
    provider: request.provider as ObserverProvider,
    ...(request.model ? { model: request.model } : {}),
    ...(request.storeHistory === false ? { storeHistory: false } : {}),
    mode: request.mode as ObserverMode,
    kind: request.kind as ObserverKind,
    fileName: request.fileName,
    language: request.language,
    source: request.source as ObserverContextSource,
    cursorLine: request.cursorLine,
    cursorColumn: request.cursorColumn,
    ...(request.selectedCode ? { selectedCode: request.selectedCode } : {}),
    ...(request.nearbyCode ? { nearbyCode: request.nearbyCode } : {}),
    ...(request.activeFile ? { activeFile: request.activeFile } : {}),
    ...(contextPackage ? { contextPackage } : {}),
    ...(request.editBase ? { editBase: request.editBase } : {}),
    ...(request.runError ? { runError: request.runError } : {}),
    ...(request.diagnostic ? { diagnostic: {
      fileName: request.diagnostic.fileName,
      line: request.diagnostic.line,
      column: request.diagnostic.column,
      message: request.diagnostic.message,
    } } : {}),
  };
}

export function validateObserverOutcome(value: unknown): ObserverOutcomeRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const request = value as Partial<ObserverOutcomeRequest>;
  if (
    typeof request.suggestionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.suggestionId) ||
    (request.outcome !== "accepted" && request.outcome !== "dismissed")
  ) return null;
  return { suggestionId: request.suggestionId, outcome: request.outcome };
}
