import type { IpcResult } from "./workspace";
import type { ObserverMode, ObserverProvider } from "./observer";
import type { ProactiveObserverMode } from "./proactive-observer.ts";
import type { AssistPreset } from "./proactive-insights.ts";
import type { DocumentationConfidence, RelationshipDecision } from "./documentation-impact.ts";

const CODE_SETTING_MODES = ["explain", "fix_error", "improve_code", "continue_code", "generate_tests"] as const;
const SETTING_PROVIDERS = ["gemini", "openai", "deepseek", "anthropic", "demo"] as const;

export const SETTINGS_VERSION = 8;

export const SETTINGS_CHANNELS = {
  getLocal: "settings:get-local",
  updateLocal: "settings:update-local",
  resetLocal: "settings:reset-local",
  getSynced: "settings:get-synced",
  updateSynced: "settings:update-synced",
  providerStatus: "settings:provider-status",
  saveKey: "settings:save-key",
  deleteKey: "settings:delete-key",
  clearObserverHistory: "settings:clear-observer-history",
  getWorkspaceTabs: "settings:get-workspace-tabs",
  saveWorkspaceTabs: "settings:save-workspace-tabs",
} as const;

export type ThemePreference = "system" | "light" | "dark";
export type StartupBehavior = "welcome" | "reopen_last";
export type AutoSaveMode = "off" | "after_delay";

export interface LocalSettings {
  version: typeof SETTINGS_VERSION;
  theme: ThemePreference;
  startupBehavior: StartupBehavior;
  confirmBeforeDelete: boolean;
  restoreOpenTabs: boolean;
  editor: {
    fontSize: number;
    tabSize: number;
    wordWrap: boolean;
    minimap: boolean;
    autoSave: AutoSaveMode;
    autoSaveDelayMs: number;
  };
  aiContextExclusions: string[];
  contextMaximumRelatedFiles: number;
  contextMaximumFileCharacters: number;
  explainMaximumCodeCharacters: number;
  checkpointRetentionLimit: number;
  multiFileMaximumFiles: number;
  multiFileMaximumChangedLines: number;
  multiFileMaximumGeneratedBytes: number;
  proactiveObserverMode: ProactiveObserverMode;
  proactivePersistentDiagnostics: boolean;
  proactiveFailedRuns: boolean;
  proactiveFailedTests: boolean;
  proactiveFailedBuilds: boolean;
  proactiveCooldownMinutes: number;
  proactiveMaximumNudgesPerHour: number;
  proactivePreset: AssistPreset;
  proactiveDiagnosticCycles: number;
  proactiveFailedRunOccurrences: number;
  proactiveDetectorCooldownMinutes: { persistent_diagnostic: number; failed_run: number; failed_test: number; failed_build: number };
  proactiveDetectorMaximumPerHour: { persistent_diagnostic: number; failed_run: number; failed_test: number; failed_build: number };
  proactiveMetricsCollection: boolean;
  proactiveFeedbackPrompts: boolean;
  proactiveRetentionDays: number;
  proactiveDismissedRecommendations: string[];
  proactiveMutedErrors: string[];
  proactiveMutedFiles: string[];
  proactiveMutedProjects: string[];
  documentationImpactEnabled: boolean;
  documentationPaths: string[];
  documentationMinimumConfidence: DocumentationConfidence;
  documentationIncludeLowConfidence: boolean;
  documentationUseGit: boolean;
  documentationUseSessionFallback: boolean;
  documentationRelationshipDecisions: RelationshipDecision[];
  documentationUpdateMaximumFiles: number;
}

export interface SyncedSettings {
  preferredProvider: ObserverProvider;
  preferredModel: string;
  observerEnabled: boolean;
  defaultObserverAction: Extract<ObserverMode, typeof CODE_SETTING_MODES[number]>;
  showContextPreview: boolean;
  includeDiagnostics: boolean;
  includeTerminalError: boolean;
  maximumContextChars: number;
  confirmCompleteFile: boolean;
  storeSuggestionHistory: boolean;
}

export interface ProviderStatus {
  provider: ObserverProvider;
  label: string;
  models: string[];
  systemProvided: boolean;
  userKeyConfigured: boolean;
  available: boolean;
}

export interface SaveApiKeyRequest {
  provider: Exclude<ObserverProvider, "demo">;
  apiKey: string;
  verify: boolean;
}

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = Object.freeze({
  version: SETTINGS_VERSION,
  theme: "system",
  startupBehavior: "welcome",
  confirmBeforeDelete: true,
  restoreOpenTabs: true,
  editor: Object.freeze({
    fontSize: 14,
    tabSize: 2,
    wordWrap: false,
    minimap: true,
    autoSave: "off",
    autoSaveDelayMs: 1_000,
  }),
  aiContextExclusions: Object.freeze([]) as unknown as string[],
  contextMaximumRelatedFiles: 4,
  contextMaximumFileCharacters: 8_000,
  explainMaximumCodeCharacters: 8_000,
  checkpointRetentionLimit: 20,
  multiFileMaximumFiles: 5,
  multiFileMaximumChangedLines: 500,
  multiFileMaximumGeneratedBytes: 200_000,
  proactiveObserverMode: "manual",
  proactivePersistentDiagnostics: true,
  proactiveFailedRuns: true,
  proactiveFailedTests: true,
  proactiveFailedBuilds: true,
  proactiveCooldownMinutes: 10,
  proactiveMaximumNudgesPerHour: 3,
  proactivePreset: "balanced",
  proactiveDiagnosticCycles: 2,
  proactiveFailedRunOccurrences: 1,
  proactiveDetectorCooldownMinutes: Object.freeze({ persistent_diagnostic: 10, failed_run: 10, failed_test: 10, failed_build: 10 }),
  proactiveDetectorMaximumPerHour: Object.freeze({ persistent_diagnostic: 3, failed_run: 3, failed_test: 3, failed_build: 3 }),
  proactiveMetricsCollection: true,
  proactiveFeedbackPrompts: true,
  proactiveRetentionDays: 30,
  proactiveDismissedRecommendations: Object.freeze([]) as unknown as string[],
  proactiveMutedErrors: Object.freeze([]) as unknown as string[],
  proactiveMutedFiles: Object.freeze([]) as unknown as string[],
  proactiveMutedProjects: Object.freeze([]) as unknown as string[],
  documentationImpactEnabled: true,
  documentationPaths: Object.freeze([]) as unknown as string[],
  documentationMinimumConfidence: "medium",
  documentationIncludeLowConfidence: false,
  documentationUseGit: true,
  documentationUseSessionFallback: true,
  documentationRelationshipDecisions: Object.freeze([]) as unknown as RelationshipDecision[],
  documentationUpdateMaximumFiles: 1,
});

export const DEFAULT_SYNCED_SETTINGS: SyncedSettings = Object.freeze({
  preferredProvider: "gemini",
  preferredModel: "gemini-2.5-flash",
  observerEnabled: true,
  defaultObserverAction: "explain",
  showContextPreview: true,
  includeDiagnostics: true,
  includeTerminalError: false,
  maximumContextChars: 20_000,
  confirmCompleteFile: true,
  storeSuggestionHistory: true,
});

export const PROVIDER_MODELS: Readonly<Record<ObserverProvider, readonly string[]>> = {
  gemini: ["gemini-2.5-flash"],
  openai: ["gpt-4o-mini"],
  deepseek: ["deepseek-chat"],
  anthropic: ["claude-haiku-4-5-20251001"],
  demo: ["demo-local"],
};

export const MANDATORY_SECRET_EXCLUSIONS = Object.freeze([
  ".env", ".env.*", ".npmrc", ".pypirc", ".netrc", "credentials", "id_rsa", "id_ed25519",
  "*.pem", "*.key", "*.p12", "*.pfx",
]);

const plainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const bool = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;
const boundedInt = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : fallback;

function cleanExclusions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string =>
    typeof item === "string" && item.trim().length > 0 && item.length <= 300 && !item.includes("\0")
  ).map((item) => item.trim().replaceAll("\\", "/")))).slice(0, 100);
}
function cleanDocumentationPaths(value: unknown): string[] {
  return cleanExclusions(value).filter((path) => !path.startsWith("/") && !path.split("/").includes(".."));
}

const cleanIdentifiers = (value: unknown, pattern: RegExp, maximum = 200): string[] => Array.isArray(value) ? Array.from(new Set(value.filter((item): item is string => typeof item === "string" && pattern.test(item)))).slice(0, maximum) : [];
const cleanRelationshipDecisions = (value: unknown): RelationshipDecision[] => Array.isArray(value) ? value.flatMap((item) => {
  if (!plainObject(item) || typeof item.relationshipId !== "string" || !/^[a-f0-9]{24}$/.test(item.relationshipId) || typeof item.evidenceHash !== "string" || !/^[a-f0-9]{64}$/.test(item.evidenceHash) || !["confirmed", "rejected"].includes(String(item.decision))) return [];
  return [{ relationshipId: item.relationshipId, evidenceHash: item.evidenceHash, decision: item.decision as RelationshipDecision["decision"] }];
}).slice(-500) : [];

export function normalizeLocalSettings(value: unknown): LocalSettings {
  const source = plainObject(value) ? value : {};
  const editor = plainObject(source.editor) ? source.editor : {};
  const detectorCooldown = plainObject(source.proactiveDetectorCooldownMinutes) ? source.proactiveDetectorCooldownMinutes : {};
  const detectorMaximum = plainObject(source.proactiveDetectorMaximumPerHour) ? source.proactiveDetectorMaximumPerHour : {};
  return {
    version: SETTINGS_VERSION,
    theme: ["system", "light", "dark"].includes(String(source.theme))
      ? source.theme as ThemePreference : DEFAULT_LOCAL_SETTINGS.theme,
    startupBehavior: ["welcome", "reopen_last"].includes(String(source.startupBehavior))
      ? source.startupBehavior as StartupBehavior : DEFAULT_LOCAL_SETTINGS.startupBehavior,
    confirmBeforeDelete: bool(source.confirmBeforeDelete, DEFAULT_LOCAL_SETTINGS.confirmBeforeDelete),
    restoreOpenTabs: bool(source.restoreOpenTabs, DEFAULT_LOCAL_SETTINGS.restoreOpenTabs),
    editor: {
      fontSize: boundedInt(editor.fontSize, DEFAULT_LOCAL_SETTINGS.editor.fontSize, 10, 28),
      tabSize: boundedInt(editor.tabSize, DEFAULT_LOCAL_SETTINGS.editor.tabSize, 1, 8),
      wordWrap: bool(editor.wordWrap, DEFAULT_LOCAL_SETTINGS.editor.wordWrap),
      minimap: bool(editor.minimap, DEFAULT_LOCAL_SETTINGS.editor.minimap),
      autoSave: ["off", "after_delay"].includes(String(editor.autoSave))
        ? editor.autoSave as AutoSaveMode : DEFAULT_LOCAL_SETTINGS.editor.autoSave,
      autoSaveDelayMs: boundedInt(editor.autoSaveDelayMs, DEFAULT_LOCAL_SETTINGS.editor.autoSaveDelayMs, 250, 30_000),
    },
    aiContextExclusions: cleanExclusions(source.aiContextExclusions),
    contextMaximumRelatedFiles: boundedInt(source.contextMaximumRelatedFiles, DEFAULT_LOCAL_SETTINGS.contextMaximumRelatedFiles, 1, 10),
    explainMaximumCodeCharacters: boundedInt(source.explainMaximumCodeCharacters, boundedInt(source.contextMaximumFileCharacters, 8000, 500, 20000), 500, 20000),
    contextMaximumFileCharacters: boundedInt(source.contextMaximumFileCharacters, DEFAULT_LOCAL_SETTINGS.contextMaximumFileCharacters, 500, 20_000),
    checkpointRetentionLimit: boundedInt(source.checkpointRetentionLimit, DEFAULT_LOCAL_SETTINGS.checkpointRetentionLimit, 1, 100),
    multiFileMaximumFiles: boundedInt(source.multiFileMaximumFiles, DEFAULT_LOCAL_SETTINGS.multiFileMaximumFiles, 1, 10),
    multiFileMaximumChangedLines: boundedInt(source.multiFileMaximumChangedLines, DEFAULT_LOCAL_SETTINGS.multiFileMaximumChangedLines, 25, 5_000),
    multiFileMaximumGeneratedBytes: boundedInt(source.multiFileMaximumGeneratedBytes, DEFAULT_LOCAL_SETTINGS.multiFileMaximumGeneratedBytes, 10_000, 1_000_000),
    proactiveObserverMode: ["off", "manual", "assist"].includes(String(source.proactiveObserverMode)) ? source.proactiveObserverMode as ProactiveObserverMode : DEFAULT_LOCAL_SETTINGS.proactiveObserverMode,
    proactivePersistentDiagnostics: bool(source.proactivePersistentDiagnostics, DEFAULT_LOCAL_SETTINGS.proactivePersistentDiagnostics),
    proactiveFailedRuns: bool(source.proactiveFailedRuns, DEFAULT_LOCAL_SETTINGS.proactiveFailedRuns),
    proactiveFailedTests: bool(source.proactiveFailedTests, DEFAULT_LOCAL_SETTINGS.proactiveFailedTests),
    proactiveFailedBuilds: bool(source.proactiveFailedBuilds, DEFAULT_LOCAL_SETTINGS.proactiveFailedBuilds),
    proactiveCooldownMinutes: boundedInt(source.proactiveCooldownMinutes, DEFAULT_LOCAL_SETTINGS.proactiveCooldownMinutes, 1, 1_440),
    proactiveMaximumNudgesPerHour: boundedInt(source.proactiveMaximumNudgesPerHour, DEFAULT_LOCAL_SETTINGS.proactiveMaximumNudgesPerHour, 1, 10),
    proactivePreset: ["low", "balanced", "high"].includes(String(source.proactivePreset)) ? source.proactivePreset as AssistPreset : DEFAULT_LOCAL_SETTINGS.proactivePreset,
    proactiveDiagnosticCycles: boundedInt(source.proactiveDiagnosticCycles, DEFAULT_LOCAL_SETTINGS.proactiveDiagnosticCycles, 2, 5),
    proactiveFailedRunOccurrences: boundedInt(source.proactiveFailedRunOccurrences, DEFAULT_LOCAL_SETTINGS.proactiveFailedRunOccurrences, 1, 3),
    proactiveDetectorCooldownMinutes: {
      persistent_diagnostic: boundedInt(detectorCooldown.persistent_diagnostic, DEFAULT_LOCAL_SETTINGS.proactiveDetectorCooldownMinutes.persistent_diagnostic, 5, 1_440),
      failed_run: boundedInt(detectorCooldown.failed_run, DEFAULT_LOCAL_SETTINGS.proactiveDetectorCooldownMinutes.failed_run, 5, 1_440),
      failed_test: boundedInt(detectorCooldown.failed_test, DEFAULT_LOCAL_SETTINGS.proactiveDetectorCooldownMinutes.failed_test, 5, 1_440),
      failed_build: boundedInt(detectorCooldown.failed_build, DEFAULT_LOCAL_SETTINGS.proactiveDetectorCooldownMinutes.failed_build, 5, 1_440),
    },
    proactiveDetectorMaximumPerHour: {
      persistent_diagnostic: boundedInt(detectorMaximum.persistent_diagnostic, DEFAULT_LOCAL_SETTINGS.proactiveDetectorMaximumPerHour.persistent_diagnostic, 1, 10),
      failed_run: boundedInt(detectorMaximum.failed_run, DEFAULT_LOCAL_SETTINGS.proactiveDetectorMaximumPerHour.failed_run, 1, 10),
      failed_test: boundedInt(detectorMaximum.failed_test, DEFAULT_LOCAL_SETTINGS.proactiveDetectorMaximumPerHour.failed_test, 1, 10),
      failed_build: boundedInt(detectorMaximum.failed_build, DEFAULT_LOCAL_SETTINGS.proactiveDetectorMaximumPerHour.failed_build, 1, 10),
    },
    proactiveMetricsCollection: bool(source.proactiveMetricsCollection, DEFAULT_LOCAL_SETTINGS.proactiveMetricsCollection),
    proactiveFeedbackPrompts: bool(source.proactiveFeedbackPrompts, DEFAULT_LOCAL_SETTINGS.proactiveFeedbackPrompts),
    proactiveRetentionDays: boundedInt(source.proactiveRetentionDays, DEFAULT_LOCAL_SETTINGS.proactiveRetentionDays, 7, 365),
    proactiveDismissedRecommendations: cleanIdentifiers(source.proactiveDismissedRecommendations, /^[a-z0-9-]{3,100}$/, 50),
    proactiveMutedErrors: cleanIdentifiers(source.proactiveMutedErrors, /^[a-f0-9]{16}$/),
    proactiveMutedFiles: cleanIdentifiers(source.proactiveMutedFiles, /^(?!\/)(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))[^\0]{1,4096}$/),
    proactiveMutedProjects: cleanIdentifiers(source.proactiveMutedProjects, /^[a-f0-9]{64}$/),
    documentationImpactEnabled: bool(source.documentationImpactEnabled, DEFAULT_LOCAL_SETTINGS.documentationImpactEnabled),
    documentationPaths: cleanDocumentationPaths(source.documentationPaths),
    documentationMinimumConfidence: ["high", "medium", "low"].includes(String(source.documentationMinimumConfidence)) ? source.documentationMinimumConfidence as DocumentationConfidence : DEFAULT_LOCAL_SETTINGS.documentationMinimumConfidence,
    documentationIncludeLowConfidence: bool(source.documentationIncludeLowConfidence, DEFAULT_LOCAL_SETTINGS.documentationIncludeLowConfidence),
    documentationUseGit: bool(source.documentationUseGit, DEFAULT_LOCAL_SETTINGS.documentationUseGit),
    documentationUseSessionFallback: bool(source.documentationUseSessionFallback, DEFAULT_LOCAL_SETTINGS.documentationUseSessionFallback),
    documentationRelationshipDecisions: cleanRelationshipDecisions(source.documentationRelationshipDecisions),
    documentationUpdateMaximumFiles: boundedInt(source.documentationUpdateMaximumFiles, DEFAULT_LOCAL_SETTINGS.documentationUpdateMaximumFiles, 1, 5),
  };
}

export function normalizeSyncedSettings(value: unknown): SyncedSettings {
  const source = plainObject(value) ? value : {};
  const provider = SETTING_PROVIDERS.includes(source.preferredProvider as ObserverProvider)
    ? source.preferredProvider as ObserverProvider : DEFAULT_SYNCED_SETTINGS.preferredProvider;
  const model = typeof source.preferredModel === "string" && PROVIDER_MODELS[provider].includes(source.preferredModel)
    ? source.preferredModel : PROVIDER_MODELS[provider][0];
  return {
    preferredProvider: provider,
    preferredModel: model,
    observerEnabled: bool(source.observerEnabled, DEFAULT_SYNCED_SETTINGS.observerEnabled),
    defaultObserverAction: CODE_SETTING_MODES.includes(source.defaultObserverAction as typeof CODE_SETTING_MODES[number])
      ? source.defaultObserverAction as SyncedSettings["defaultObserverAction"]
      : DEFAULT_SYNCED_SETTINGS.defaultObserverAction,
    showContextPreview: true,
    includeDiagnostics: bool(source.includeDiagnostics, DEFAULT_SYNCED_SETTINGS.includeDiagnostics),
    includeTerminalError: bool(source.includeTerminalError, DEFAULT_SYNCED_SETTINGS.includeTerminalError),
    maximumContextChars: boundedInt(source.maximumContextChars, DEFAULT_SYNCED_SETTINGS.maximumContextChars, 1_000, 50_000),
    confirmCompleteFile: bool(source.confirmCompleteFile, DEFAULT_SYNCED_SETTINGS.confirmCompleteFile),
    storeSuggestionHistory: bool(source.storeSuggestionHistory, DEFAULT_SYNCED_SETTINGS.storeSuggestionHistory),
  };
}

export function isMandatorySecretFile(relativePath: string): boolean {
  const name = relativePath.replaceAll("\\", "/").split("/").at(-1)?.toLowerCase() ?? "";
  return /^\.env(?:\.|$)/.test(name) || [".npmrc", ".pypirc", ".netrc", "credentials", "id_rsa", "id_ed25519"].includes(name) ||
    /\.(?:pem|key|p12|pfx)$/.test(name);
}

export function isExcludedFromAiContext(relativePath: string, exclusions: readonly string[]): boolean {
  if (isMandatorySecretFile(relativePath)) return true;
  const path = relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
  return exclusions.some((raw) => {
    const pattern = raw.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
    if (!pattern) return false;
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
    return new RegExp(`^(?:${escaped})(?:/.*)?$`, "i").test(path) || path.toLowerCase() === pattern.toLowerCase();
  });
}

export function monacoOptionsFromSettings(editor: LocalSettings["editor"]) {
  return {
    fontSize: editor.fontSize,
    tabSize: editor.tabSize,
    wordWrap: editor.wordWrap ? "on" as const : "off" as const,
    minimap: { enabled: editor.minimap },
  };
}

export interface SettingsBridge {
  getLocal: () => Promise<IpcResult<LocalSettings>>;
  updateLocal: (settings: LocalSettings) => Promise<IpcResult<LocalSettings>>;
  resetLocal: () => Promise<IpcResult<LocalSettings>>;
  getSynced: () => Promise<IpcResult<SyncedSettings>>;
  updateSynced: (settings: SyncedSettings) => Promise<IpcResult<SyncedSettings>>;
  providerStatus: () => Promise<IpcResult<ProviderStatus[]>>;
  saveApiKey: (request: SaveApiKeyRequest) => Promise<IpcResult<void>>;
  deleteApiKey: (provider: Exclude<ObserverProvider, "demo">) => Promise<IpcResult<void>>;
  clearObserverHistory: () => Promise<IpcResult<void>>;
  getWorkspaceTabs: (workspaceId: string) => Promise<IpcResult<string[]>>;
  saveWorkspaceTabs: (workspaceId: string, paths: string[]) => Promise<IpcResult<void>>;
}
