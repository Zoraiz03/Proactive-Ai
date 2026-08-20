import type { StuckMetadata } from "./stuck-detectors.ts";

export interface ProactiveHelpNudge {
  startLine: number;
  endLine: number;
  reason: string;
  metadata: StuckMetadata;
}

export type ProactiveHelpNudgeAction = "get_help" | "not_now";

interface NudgeDecisionContext {
  enabled: boolean;
  isCodeFile: boolean;
  contentLength: number;
  minimumContentLength: number;
  metadata: StuckMetadata;
}

const DETECTOR_REASONS = {
  repeated_edit: "You have repeatedly edited the same small area.",
  repeated_error: "The same error is still appearing.",
  cursor_thrashing:
    "Your cursor has stayed in a small area without meaningful forward progress.",
} as const;

export function createProactiveHelpNudge({
  enabled,
  isCodeFile,
  contentLength,
  minimumContentLength,
  metadata,
}: NudgeDecisionContext): ProactiveHelpNudge | null {
  if (!enabled || !isCodeFile || contentLength < minimumContentLength) {
    return null;
  }

  const startLine = Math.min(
    ...metadata.signals.map((signal) => signal.region.startLine)
  );
  const endLine = Math.max(
    ...metadata.signals.map((signal) => signal.region.endLine)
  );
  const reason = metadata.detectorTypes
    .map((type) => DETECTOR_REASONS[type])
    .join(" ");

  return { startLine, endLine, reason, metadata };
}

export function metadataForNudgeAction(
  nudge: ProactiveHelpNudge,
  action: ProactiveHelpNudgeAction
): StuckMetadata | null {
  return action === "get_help" ? nudge.metadata : null;
}
