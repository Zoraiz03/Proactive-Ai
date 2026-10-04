import { z } from "zod";

export const ProviderSchema = z.enum(["gemini", "openai", "deepseek", "anthropic", "demo"]);
export const ModelByProvider = {
  gemini: ["gemini-3.5-flash"],
  openai: ["gpt-4o-mini"],
  deepseek: ["deepseek-chat"],
  anthropic: ["claude-haiku-4-5-20251001"],
  demo: ["demo-local"],
} as const;

export const DesktopSettingsSchema = z.object({
  preferredProvider: ProviderSchema,
  preferredModel: z.string().max(100),
  observerEnabled: z.boolean(),
  defaultObserverAction: z.enum(["explain", "fix_error", "improve_code", "continue_code", "generate_tests"]),
  showContextPreview: z.boolean(),
  includeDiagnostics: z.boolean(),
  includeTerminalError: z.boolean(),
  maximumContextChars: z.number().int().min(1_000).max(50_000),
  confirmCompleteFile: z.boolean(),
  storeSuggestionHistory: z.boolean(),
}).superRefine((settings, context) => {
  if (!(ModelByProvider[settings.preferredProvider] as readonly string[]).includes(settings.preferredModel)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["preferredModel"], message: "Model does not belong to the selected provider." });
  }
});

export const DEFAULT_DESKTOP_SETTINGS = {
  preferredProvider: "gemini",
  preferredModel: "gemini-3.5-flash",
  observerEnabled: true,
  defaultObserverAction: "explain",
  showContextPreview: true,
  includeDiagnostics: true,
  includeTerminalError: false,
  maximumContextChars: 20_000,
  confirmCompleteFile: true,
  storeSuggestionHistory: true,
} as const;

export function rowToDesktopSettings(row: Record<string, unknown> | null) {
  if (!row) return DEFAULT_DESKTOP_SETTINGS;
  return {
    preferredProvider: row.preferred_provider,
    preferredModel: row.preferred_model,
    observerEnabled: row.observer_enabled,
    defaultObserverAction: row.default_observer_action,
    showContextPreview: row.show_context_preview,
    includeDiagnostics: row.include_diagnostics,
    includeTerminalError: row.include_terminal_error,
    maximumContextChars: row.maximum_context_chars,
    confirmCompleteFile: row.confirm_complete_file,
    storeSuggestionHistory: row.store_suggestion_history,
  };
}

export function desktopSettingsToRow(settings: z.infer<typeof DesktopSettingsSchema>, userId: string) {
  return {
    user_id: userId,
    preferred_provider: settings.preferredProvider,
    preferred_model: settings.preferredModel,
    observer_enabled: settings.observerEnabled,
    default_observer_action: settings.defaultObserverAction,
    show_context_preview: settings.showContextPreview,
    include_diagnostics: settings.includeDiagnostics,
    include_terminal_error: settings.includeTerminalError,
    maximum_context_chars: settings.maximumContextChars,
    confirm_complete_file: settings.confirmCompleteFile,
    store_suggestion_history: settings.storeSuggestionHistory,
    updated_at: new Date().toISOString(),
  };
}
