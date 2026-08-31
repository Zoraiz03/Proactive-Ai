import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createManualSuggestionRequest,
  hasMeaningfulContent,
} from "../src/lib/manual-suggestion.ts";
import { bearerClientOptions, parseBearerHeader } from "../src/lib/server/bearer-token.ts";
import { verifyProviderApiKey } from "../src/lib/server/verify-provider-key.ts";

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

assert.deepEqual(parseBearerHeader(null), { kind: "absent" });
assert.deepEqual(parseBearerHeader("Basic credentials"), { kind: "invalid" });
assert.deepEqual(parseBearerHeader("Bearer first, Bearer second"), { kind: "invalid" });
assert.deepEqual(parseBearerHeader("Bearer valid.jwt-token_123"), {
  kind: "valid",
  token: "valid.jwt-token_123",
});
assert.deepEqual(bearerClientOptions("user-jwt"), {
  global: { headers: { Authorization: "Bearer user-jwt" } },
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const suggestionMigration = await readFile(
  new URL("../supabase/migrations/20260820100515_add_stuck_suggestion_feedback.sql", import.meta.url),
  "utf8"
);
for (const policy of [
  "suggestions: read own rows",
  "suggestions: insert own rows",
  "suggestion outcomes: read own rows",
  "suggestion outcomes: insert own rows",
]) {
  assert.equal(suggestionMigration.includes(policy), true, policy);
}
assert.equal(
  (suggestionMigration.match(/\(select auth\.uid\(\)\) = user_id/g) ?? []).length >= 4,
  true
);

const desktopSettingsMigration = await readFile(
  new URL("../supabase/migrations/20260831061842_add_desktop_user_settings.sql", import.meta.url),
  "utf8"
);
for (const required of [
  "enable row level security",
  "revoke all on table public.desktop_user_settings from anon, authenticated",
  "grant select, insert, update, delete on table public.desktop_user_settings to authenticated",
  "for select to authenticated\n  using ((select auth.uid()) = user_id)",
  "for insert to authenticated\n  with check ((select auth.uid()) = user_id)",
  "for update to authenticated\n  using ((select auth.uid()) = user_id)\n  with check ((select auth.uid()) = user_id)",
  "for delete to authenticated\n  using ((select auth.uid()) = user_id)",
]) assert.equal(desktopSettingsMigration.includes(required), true, required);

let verificationRequest: { url: string; authorization: string | null } | null = null;
assert.equal(await verifyProviderApiKey("openai", "private-value", async (input, init) => {
  verificationRequest = { url: String(input), authorization: new Headers(init?.headers).get("authorization") };
  return new Response("{}", { status: 200 });
}), true);
assert.equal(verificationRequest?.url, "https://api.openai.com/v1/models");
assert.equal(verificationRequest?.authorization, "Bearer private-value");
assert.equal(verificationRequest?.url.includes("private-value"), false);

console.log("manual suggestion harness: all assertions passed");
