import type { IpcResult } from "./workspace";
import type { ObserverMode, ObserverProvider } from "./observer";

const CODE_SETTING_MODES = ["explain", "fix_error", "improve_code", "continue_code", "generate_tests"] as const;
const SETTING_PROVIDERS = ["gemini", "openai", "deepseek", "anthropic", "demo"] as const;

export const SETTINGS_VERSION = 1;

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

export function normalizeLocalSettings(value: unknown): LocalSettings {
  const source = plainObject(value) ? value : {};
  const editor = plainObject(source.editor) ? source.editor : {};
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
    showContextPreview: bool(source.showContextPreview, DEFAULT_SYNCED_SETTINGS.showContextPreview),
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
