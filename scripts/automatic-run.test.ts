import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { z } from "zod";
import { buildPrompt, getSuggestion, ProviderError } from "../src/lib/server/providers.ts";
import { ProjectContextSchema, formatUntrustedProjectContext, safeProjectContextMetadata } from "../src/lib/server/project-context.ts";
import { EditBaseSchema } from "../src/lib/server/ai-edit.ts";
import { buildAutomaticRunRequest } from "../apps/desktop/src/main/automatic-run.ts";

const request = buildAutomaticRunRequest({
  snapshot: { runId: randomUUID(), relativePath: "example.py", language: "python", content: "value = 0\nprint(1 / value)\n" },
  line: 2, error: "ZeroDivisionError: division by zero",
}, "demo", { enabled: true, exclusions: [], maximumCharacters: 9_000 })!;
assert.ok(request);
const context = ProjectContextSchema.parse(request.contextPackage);
const prompt = buildPrompt({ automaticRun: true, fileName: request.fileName, kind: "code", content: formatUntrustedProjectContext(context), context: { mode: "explain" }, projectContext: context });
assert.match(prompt, /No prompt was typed/);
assert.match(prompt, /UNTRUSTED DATA/);
assert.match(prompt, /What happened/);
assert.match(prompt, /Likely cause/);
assert.match(prompt, /Next step/);
assert.doesNotMatch(prompt, /explicitly clicked Ask Observer/);
assert.match(prompt, /Do not claim anything was fixed or tested/);

// Execute the real route's validation/dispatch against dependency doubles.
// No network, database calls, credentials or generated fixture files.
let authenticated = true;
let providerCalls = 0;
const moduleExports: { POST?: (request: Request) => Promise<Response> } = {};
const source = readFileSync(new URL("../src/app/api/suggest/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const requireStub = (name: string) => {
  if (name === "next/server") return { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } };
  if (name === "zod") return { z };
  if (name.endsWith("/request-auth")) return { authenticateApiRequest: async () => authenticated ? { user: { id: "test-user" }, method: "bearer", supabase: { from: () => { throw new Error("Automatic explanations must not persist history"); } } } : null };
  if (name.endsWith("/service")) return { createServiceClient: () => { throw new Error("No real key access in tests"); } };
  if (name.endsWith("/crypto")) return { decrypt: () => { throw new Error("No key decryption in tests"); } };
  if (name.endsWith("/providers")) return { ProviderError, getSuggestion: async (...args: Parameters<typeof getSuggestion>) => { providerCalls++; return getSuggestion(...args); } };
  if (name.endsWith("/project-context")) return { ProjectContextSchema, formatUntrustedProjectContext, safeProjectContextMetadata };
  if (name.endsWith("/ai-edit")) return { EditBaseSchema };
  throw new Error(`Unexpected test dependency: ${name}`);
};
new Function("require", "exports", compiled)(requireStub, moduleExports);
const send = (body: unknown) => moduleExports.POST!(new Request("http://localhost/api/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const body = { ...request, client: "desktop" };
const valid = await send(body);
assert.equal(valid.status, 200);
const response = await valid.json();
assert.match(response.suggestion.reason, /Automatically/);
assert.match(response.suggestion.explanation, /Demo only/);
assert.equal(response.suggestion.snippet, "");
assert.equal(providerCalls, 1);

for (const invalid of [
  { ...body, storeHistory: true },
  { ...body, automaticRun: { trigger: "failed_run", runId: "not-a-run" } },
  { ...body, automaticRun: { trigger: "typing_pause", runId: randomUUID() } },
  { ...body, mode: "improve_code" },
  { ...body, language: "c" },
  { ...body, contextPackage: { ...context, items: context.items.map((item) => item.type === "controlled_run_error" ? { ...item, type: "web_research" } : item) } },
  { ...body, contextPackage: { ...context, items: context.items.map((item) => item.type === "nearby_code" ? { ...item, source: { ...item.source, relativePath: "unrelated.py" } } : item) } },
]) assert.equal((await send(invalid)).status, 400);
assert.equal(providerCalls, 1, "invalid automatic requests must not call a provider");
authenticated = false; assert.equal((await send(body)).status, 401); assert.equal(providerCalls, 1);
console.log("automatic failed-run backend harness: all assertions passed");
