import type { IpcResult } from "./workspace";

export const OBSERVER_MODES = [
  "explain",
  "fix_error",
  "improve_code",
  "continue_code",
  "generate_tests",
] as const;

export const OBSERVER_PROVIDERS = [
  "gemini",
  "deepseek",
  "openai",
  "anthropic",
  "demo",
] as const;

export const OBSERVER_CHANNELS = {
  ask: "observer:ask",
  outcome: "observer:outcome",
  copy: "observer:copy",
} as const;

export type ObserverMode = typeof OBSERVER_MODES[number];
export type ObserverProvider = typeof OBSERVER_PROVIDERS[number];
export type ObserverContextSource = "selection" | "cursor" | "diagnostic";

export const OBSERVER_MODE_LABELS: Readonly<Record<ObserverMode, string>> = {
  explain: "Explain",
  fix_error: "Fix Error",
  improve_code: "Improve Code",
  continue_code: "Continue Code",
  generate_tests: "Generate Tests",
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
  provider: ObserverProvider;
  mode: ObserverMode;
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
}

export interface ObserverSuggestion {
  id: string;
  explanation: string;
  snippet: string;
  reason: string;
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
  ask: (request: ObserverRequest) => Promise<IpcResult<ObserverAskResult>>;
  recordOutcome: (request: ObserverOutcomeRequest) => Promise<IpcResult<void>>;
  copySnippet: (snippet: string) => Promise<IpcResult<void>>;
}

export interface CreateObserverRequestInput {
  provider: ObserverProvider;
  mode: ObserverMode;
  fileName: string;
  language: string;
  content: string;
  cursorLine: number;
  cursorColumn: number;
  selectedCode?: string;
  nearbyCode?: string;
  diagnostic?: ObserverDiagnosticContext;
  runError?: string;
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

export function createObserverRequest(input: CreateObserverRequestInput): ObserverRequest | null {
  const fileName = input.fileName.trim();
  if (!fileName || /[\\/]/.test(fileName) || fileName.length > 255 || isSensitiveObserverFile(fileName)) {
    return null;
  }
  if (!OBSERVER_MODES.includes(input.mode) || !OBSERVER_PROVIDERS.includes(input.provider)) return null;
  if (input.mode === "fix_error" && !input.diagnostic) return null;
  const cursorLine = Math.max(1, Math.trunc(input.cursorLine));
  const cursorColumn = Math.max(1, Math.trunc(input.cursorColumn));
  const selectedCode = bounded(input.selectedCode, OBSERVER_LIMITS.selectedCode);
  const nearbyCode = bounded(input.nearbyCode, OBSERVER_LIMITS.nearbyCode);
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
  const activeFile = input.mode === "generate_tests" && input.content.length <= OBSERVER_LIMITS.activeFile
    ? bounded(input.content, OBSERVER_LIMITS.activeFile)
    : undefined;
  const runError = diagnostic
    ? bounded(input.runError, OBSERVER_LIMITS.runError)
    : undefined;
  if (!selectedCode && !nearbyCode && !activeFile && !diagnostic) return null;

  return {
    provider: input.provider,
    mode: input.mode,
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
  if (request.source === "selection") return `Sending selected code from ${request.fileName}`;
  if (request.source === "diagnostic" && request.diagnostic) {
    return `Sending error on line ${request.diagnostic.line} from ${request.fileName}`;
  }
  if (request.activeFile) return `Sending active file ${request.fileName} for test generation`;
  return `Sending nearby code around line ${request.cursorLine} from ${request.fileName}`;
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

export function canInsertObserverSnippet(
  suggestion: ObserverSuggestion | null,
  requestedRelativePath: string | null,
  activeRelativePath: string | null,
  fileAvailable: boolean
): boolean {
  return Boolean(
    suggestion?.snippet &&
    suggestion.snippet.length <= OBSERVER_LIMITS.snippet &&
    requestedRelativePath &&
    requestedRelativePath === activeRelativePath &&
    fileAvailable
  );
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

export function validateObserverRequest(value: unknown): ObserverRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const request = value as Partial<ObserverRequest>;
  if (
    !OBSERVER_PROVIDERS.includes(request.provider as ObserverProvider) ||
    !OBSERVER_MODES.includes(request.mode as ObserverMode) ||
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
  if (!request.selectedCode && !request.nearbyCode && !request.activeFile && !request.diagnostic) return null;
  if (request.activeFile && request.mode !== "generate_tests") return null;
  if (request.mode === "fix_error" && !request.diagnostic) return null;
  if (request.runError && !request.diagnostic) return null;
  if (request.source === "selection" && !request.selectedCode) return null;
  if (request.source === "diagnostic" && (!request.diagnostic || request.mode !== "fix_error")) return null;
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
    provider: request.provider as ObserverProvider,
    mode: request.mode as ObserverMode,
    fileName: request.fileName,
    language: request.language,
    source: request.source as ObserverContextSource,
    cursorLine: request.cursorLine,
    cursorColumn: request.cursorColumn,
    ...(request.selectedCode ? { selectedCode: request.selectedCode } : {}),
    ...(request.nearbyCode ? { nearbyCode: request.nearbyCode } : {}),
    ...(request.activeFile ? { activeFile: request.activeFile } : {}),
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
