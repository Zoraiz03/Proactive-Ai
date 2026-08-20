export type DetectorType =
  | "repeated_edit"
  | "repeated_error"
  | "cursor_thrashing";

export type SensitivityPreset = "low" | "medium" | "high";

export interface StuckDetectionConfig {
  scoreThreshold: number;
  combinationWindowMs: number;
  suggestionCooldownMs: number;
  repeatedEdit: {
    repetitionThreshold: number;
    windowMs: number;
    regionLineSpan: number;
    score: number;
  };
  repeatedError: {
    occurrenceThreshold: number;
    observationWindowMs: number;
    score: number;
  };
  cursorThrashing: {
    movementCount: number;
    durationMs: number;
    lineBand: number;
    meaningfulForwardProgress: number;
    score: number;
  };
}

export type StuckConfigOverrides = Partial<{
  scoreThreshold: number;
  combinationWindowMs: number;
  suggestionCooldownMs: number;
  repeatedEdit: Partial<StuckDetectionConfig["repeatedEdit"]>;
  repeatedError: Partial<StuckDetectionConfig["repeatedError"]>;
  cursorThrashing: Partial<StuckDetectionConfig["cursorThrashing"]>;
}>;

export const SENSITIVITY_PRESETS: Record<
  SensitivityPreset,
  StuckDetectionConfig
> = {
  low: {
    scoreThreshold: 1.9,
    combinationWindowMs: 30_000,
    suggestionCooldownMs: 60_000,
    repeatedEdit: {
      repetitionThreshold: 5,
      windowMs: 15_000,
      regionLineSpan: 3,
      score: 1,
    },
    repeatedError: {
      occurrenceThreshold: 3,
      observationWindowMs: 30_000,
      score: 1.1,
    },
    cursorThrashing: {
      movementCount: 15,
      durationMs: 30_000,
      lineBand: 5,
      meaningfulForwardProgress: 3,
      score: 0.8,
    },
  },
  medium: {
    scoreThreshold: 1.6,
    combinationWindowMs: 30_000,
    suggestionCooldownMs: 45_000,
    repeatedEdit: {
      repetitionThreshold: 3,
      windowMs: 18_000,
      regionLineSpan: 3,
      score: 0.9,
    },
    repeatedError: {
      occurrenceThreshold: 2,
      observationWindowMs: 30_000,
      score: 1,
    },
    cursorThrashing: {
      movementCount: 12,
      durationMs: 25_000,
      lineBand: 5,
      meaningfulForwardProgress: 3,
      score: 0.8,
    },
  },
  high: {
    scoreThreshold: 1.4,
    combinationWindowMs: 35_000,
    suggestionCooldownMs: 30_000,
    repeatedEdit: {
      repetitionThreshold: 3,
      windowMs: 20_000,
      regionLineSpan: 3,
      score: 0.9,
    },
    repeatedError: {
      occurrenceThreshold: 2,
      observationWindowMs: 35_000,
      score: 1,
    },
    cursorThrashing: {
      movementCount: 10,
      durationMs: 20_000,
      lineBand: 5,
      meaningfulForwardProgress: 3,
      score: 0.8,
    },
  },
};

export const DEFAULT_SENSITIVITY_PRESET: SensitivityPreset = "medium";

export function resolveStuckConfig(
  preset: SensitivityPreset = DEFAULT_SENSITIVITY_PRESET,
  ...overrides: Array<StuckConfigOverrides | null | undefined>
): StuckDetectionConfig {
  const base = SENSITIVITY_PRESETS[preset];
  return overrides.reduce<StuckDetectionConfig>(
    (config, override) => ({
      ...config,
      ...override,
      repeatedEdit: {
        ...config.repeatedEdit,
        ...override?.repeatedEdit,
      },
      repeatedError: {
        ...config.repeatedError,
        ...override?.repeatedError,
      },
      cursorThrashing: {
        ...config.cursorThrashing,
        ...override?.cursorThrashing,
      },
    }),
    structuredClone(base)
  );
}

/** Make only the specified detector less eager after consistently poor feedback. */
export function lessSensitiveOverride(
  detector: DetectorType,
  config: StuckDetectionConfig
): StuckConfigOverrides {
  switch (detector) {
    case "repeated_edit":
      return {
        repeatedEdit: {
          repetitionThreshold: Math.min(
            config.repeatedEdit.repetitionThreshold + 1,
            8
          ),
        },
      };
    case "repeated_error":
      return {
        repeatedError: {
          occurrenceThreshold: Math.min(
            config.repeatedError.occurrenceThreshold + 1,
            5
          ),
        },
      };
    case "cursor_thrashing":
      return {
        cursorThrashing: {
          movementCount: Math.min(
            config.cursorThrashing.movementCount + 2,
            20
          ),
          durationMs: Math.min(config.cursorThrashing.durationMs + 5_000, 45_000),
        },
      };
  }
}

export function mergeStuckOverrides(
  current: StuckConfigOverrides,
  next: StuckConfigOverrides
): StuckConfigOverrides {
  return {
    ...current,
    ...next,
    repeatedEdit: { ...current.repeatedEdit, ...next.repeatedEdit },
    repeatedError: { ...current.repeatedError, ...next.repeatedError },
    cursorThrashing: {
      ...current.cursorThrashing,
      ...next.cursorThrashing,
    },
  };
}
