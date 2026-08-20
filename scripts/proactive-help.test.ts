import assert from "node:assert/strict";
import {
  createProactiveHelpNudge,
  metadataForNudgeAction,
} from "../src/lib/proactive-help.ts";
import type { StuckMetadata } from "../src/lib/stuck-detectors.ts";

const metadata: StuckMetadata = {
  detectorTypes: ["repeated_edit", "repeated_error"],
  signals: [
    {
      type: "repeated_edit",
      count: 3,
      observedAt: 18_000,
      windowMs: 18_000,
      region: { startLine: 8, endLine: 10 },
      score: 0.9,
    },
    {
      type: "repeated_error",
      count: 2,
      observedAt: 18_000,
      windowMs: 30_000,
      region: { startLine: 9, endLine: 12 },
      score: 1,
      signature: "Expected token|9:12",
    },
  ],
  score: 1.9,
  threshold: 1.6,
  detectedAt: 18_000,
};

function decide(overrides: Partial<Parameters<typeof createProactiveHelpNudge>[0]> = {}) {
  return createProactiveHelpNudge({
    enabled: true,
    isCodeFile: true,
    contentLength: 100,
    minimumContentLength: 20,
    metadata,
    ...overrides,
  });
}

assert.equal(decide({ enabled: false }), null, "disabled help must suppress nudges");
assert.equal(decide({ isCodeFile: false }), null, "documents must not use nudges");
assert.equal(
  decide({ contentLength: 19 }),
  null,
  "short code must not show a nudge"
);

const nudge = decide();
assert.deepEqual(
  nudge && { startLine: nudge.startLine, endLine: nudge.endLine },
  { startLine: 8, endLine: 12 }
);
assert.match(nudge?.reason ?? "", /repeatedly edited/i);
assert.match(nudge?.reason ?? "", /same error/i);
assert.equal(nudge?.metadata, metadata, "the exact detector metadata must be retained");
assert.equal(
  nudge && metadataForNudgeAction(nudge, "not_now"),
  null,
  "Not now must never produce API request metadata"
);
assert.equal(
  nudge && metadataForNudgeAction(nudge, "get_help"),
  metadata,
  "Get help must forward the exact structured metadata"
);

console.log("proactive help decision harness: all assertions passed");
