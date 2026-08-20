import assert from "node:assert/strict";
import {
  createManualSuggestionRequest,
  hasMeaningfulContent,
} from "../src/lib/manual-suggestion.ts";

assert.equal(hasMeaningfulContent("code", "  \n"), false);
assert.equal(hasMeaningfulContent("code", "const ready = true;"), true);
assert.equal(hasMeaningfulContent("doc", "<p><br></p>"), false);
assert.equal(hasMeaningfulContent("doc", "<p>Review this paragraph</p>"), true);

const selected = createManualSuggestionRequest(
  "example.ts",
  "code",
  "const first = 1;\nconst second = 2;",
  {
    selectedText: "const second = 2;",
    cursorLine: 2,
    nearbyContent: "ignored when selected",
  }
);
assert.equal(selected.content, "const first = 1;\nconst second = 2;");
assert.deepEqual(selected.context, { selectedText: "const second = 2;" });

const cursor = createManualSuggestionRequest(
  "example.ts",
  "code",
  "const value = calculate();",
  { cursorLine: 1, nearbyContent: "const value = calculate();" }
);
assert.deepEqual(cursor.context, {
  cursorLine: 1,
  nearbyContent: "const value = calculate();",
});

const document = createManualSuggestionRequest(
  "notes.md",
  "doc",
  "<p>Complete document</p>",
  { selectedText: "Complete" }
);
assert.deepEqual(document.context, { selectedText: "Complete" });

console.log("manual suggestion harness: all assertions passed");
