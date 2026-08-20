import { z } from "zod";
import {
  DEFAULT_SENSITIVITY_PRESET,
  DetectorType,
  lessSensitiveOverride,
  mergeStuckOverrides,
  resolveStuckConfig,
  SensitivityPreset,
  StuckConfigOverrides,
} from "@/lib/stuck-config";

export const DetectorTypeSchema = z.enum([
  "repeated_edit",
  "repeated_error",
  "cursor_thrashing",
]);

export const StuckMetadataSchema = z
  .object({
    detectorTypes: z.array(DetectorTypeSchema).min(2).max(3),
    signals: z
      .array(
        z.object({
          type: DetectorTypeSchema,
          count: z.number().int().positive(),
          observedAt: z.number().nonnegative(),
          windowMs: z.number().nonnegative(),
          region: z
            .object({
              startLine: z.number().int().positive(),
              endLine: z.number().int().positive(),
            })
            .refine((region) => region.endLine >= region.startLine, {
              message: "A detector region must end on or after its start line.",
            }),
          score: z.number().nonnegative(),
          signature: z.string().max(1_000).optional(),
        })
      )
      .min(2)
      .max(3),
    score: z.number().nonnegative(),
    threshold: z.number().positive(),
    detectedAt: z.number().nonnegative(),
  })
  .superRefine((metadata, ctx) => {
    const types = new Set(metadata.detectorTypes);
    const signalTypes = new Set(metadata.signals.map((signal) => signal.type));
    if (
      types.size !== metadata.detectorTypes.length ||
      signalTypes.size !== metadata.signals.length ||
      types.size !== signalTypes.size ||
      Array.from(types).some((type) => !signalTypes.has(type))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Detector types must be unique and match the supplied signals.",
      });
    }
    if (metadata.score < metadata.threshold) {
      ctx.addIssue({ code: "custom", message: "The stuck score is below its threshold." });
    }
    const signalScore = metadata.signals.reduce(
      (total, signal) => total + signal.score,
      0
    );
    if (Math.abs(signalScore - metadata.score) > 0.01) {
      ctx.addIssue({ code: "custom", message: "The stuck score does not match its signals." });
    }
  });

const RepeatedEditOverrides = z
  .object({
    repetitionThreshold: z.number().int().min(3).max(8).optional(),
    windowMs: z.number().int().min(10_000).max(60_000).optional(),
    regionLineSpan: z.number().int().min(1).max(8).optional(),
    score: z.number().min(0.1).max(3).optional(),
  })
  .strict();

const RepeatedErrorOverrides = z
  .object({
    occurrenceThreshold: z.number().int().min(2).max(5).optional(),
    observationWindowMs: z.number().int().min(10_000).max(90_000).optional(),
    score: z.number().min(0.1).max(3).optional(),
  })
  .strict();

const CursorOverrides = z
  .object({
    movementCount: z.number().int().min(10).max(20).optional(),
    durationMs: z.number().int().min(20_000).max(45_000).optional(),
    lineBand: z.number().int().min(2).max(10).optional(),
    meaningfulForwardProgress: z.number().int().min(1).max(10).optional(),
    score: z.number().min(0.1).max(3).optional(),
  })
  .strict();

export const StuckOverridesSchema = z
  .object({
    scoreThreshold: z.number().min(0.5).max(5).optional(),
    combinationWindowMs: z.number().int().min(10_000).max(90_000).optional(),
    suggestionCooldownMs: z.number().int().min(10_000).max(300_000).optional(),
    repeatedEdit: RepeatedEditOverrides.optional(),
    repeatedError: RepeatedErrorOverrides.optional(),
    cursorThrashing: CursorOverrides.optional(),
  })
  .strict();

export const StuckSettingsPatchSchema = z
  .object({
    preset: z.enum(["low", "medium", "high"]).optional(),
    overrides: StuckOverridesSchema.optional(),
    proactiveHelpEnabled: z.boolean().optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.preset !== undefined ||
      body.overrides !== undefined ||
      body.proactiveHelpEnabled !== undefined,
    { message: "Provide a preset, overrides, or proactive help preference." }
  );

export interface StoredStuckSettings {
  preset: SensitivityPreset;
  overrides: StuckConfigOverrides;
  adaptiveOverrides: StuckConfigOverrides;
  proactiveHelpEnabled: boolean;
}

function safeOverrides(value: unknown): StuckConfigOverrides {
  const parsed = StuckOverridesSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

export function normalizeStoredSettings(row: {
  preset?: unknown;
  overrides?: unknown;
  adaptive_overrides?: unknown;
  proactive_help_enabled?: unknown;
} | null): StoredStuckSettings {
  const preset = z
    .enum(["low", "medium", "high"])
    .catch(DEFAULT_SENSITIVITY_PRESET)
    .parse(row?.preset);
  return {
    preset,
    overrides: safeOverrides(row?.overrides),
    adaptiveOverrides: safeOverrides(row?.adaptive_overrides),
    proactiveHelpEnabled:
      typeof row?.proactive_help_enabled === "boolean"
        ? row.proactive_help_enabled
        : true,
  };
}

export function resolvedSettings(settings: StoredStuckSettings) {
  return resolveStuckConfig(
    settings.preset,
    settings.overrides,
    settings.adaptiveOverrides
  );
}

export function adaptDetectorSettings(
  settings: StoredStuckSettings,
  detector: DetectorType
) {
  const currentConfig = resolvedSettings(settings);
  return mergeStuckOverrides(
    settings.adaptiveOverrides,
    lessSensitiveOverride(detector, currentConfig)
  );
}
