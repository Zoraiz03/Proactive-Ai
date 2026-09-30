import { buildExplainContext } from "../apps/desktop/src/main/explain-context.ts";
import { explanationBudget } from "../apps/desktop/src/shared/explanation-budget.ts";
import {validImproveContext} from "../apps/desktop/src/shared/improve-code.ts";
import { validFixContext } from "../apps/desktop/src/shared/fix-code.ts";
import { EXPLANATION_LIMITS, validExplanationInput } from "../apps/desktop/src/shared/explanation.ts";
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
let authMethod = "bearer";
let providerCalls = 0;
let historyMode: "forbid" | "missing_table" | "network" | "saved" = "forbid";
let historyCalls = 0;
const historyDb = { from: (table: string) => {
  assert.equal(table, "suggestions");
  if (historyMode === "forbid") throw new Error("Unexpected history write");
  historyCalls++;
  return { insert: () => ({ select: () => ({ single: async () => {
    if (historyMode === "network") throw new Error("Network unavailable");
    return historyMode === "saved" ? { data: { id: "12345678-1234-4123-8123-123456789abc" }, error: null } : { data: null, error: { code: "PGRST205" } };
  } }) }) };
} };
const moduleExports: { POST?: (request: Request) => Promise<Response> } = {};
const source = readFileSync(new URL("../src/app/api/suggest/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const requireStub = (name: string) => {
 if(name.endsWith("/explanation-budget.ts") || name.endsWith("/explanation-budget"))return {explanationBudget};
  if (name.endsWith("/shared/improve-code.ts")) return {validImproveContext};
  if (name.endsWith("/shared/fix-code.ts")) return { validFixContext };
  if (name.endsWith("/shared/explanation.ts")) return { EXPLANATION_LIMITS, validExplanationInput };
  if (name === "next/server") return { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } };
  if (name === "zod") return { z };
  if (name.endsWith("/request-auth")) return { authenticateApiRequest: async () => authenticated ? { user: { id: "test-user" }, method: authMethod, supabase: historyDb } : null };
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

// Live Observer shares authentication/provider dispatch but has its own bounded contract.
const { buildLiveRequest } = await import("../apps/desktop/src/main/live-observer.ts");
const live = buildLiveRequest({ relativePath: "main.py", content: "x = 1\nprint(1 / x)", previousContent: "x = 0", line: 2, column: 1, diagnostics: [] }, "demo", { observerEnabled: true, includeDiagnostics: true, confirmCompleteFile: false, exclusions: [], maximumCharacters: 9000, maximumFileCharacters: 6000 });
authenticated = true;
const liveBody = { ...live, client: "desktop" };
const liveResponse = await send(liveBody);
assert.equal(liveResponse.status, 200);
assert.equal((await liveResponse.json()).suggestion.explanation, "NO_SUGGESTION");
const liveCalls = providerCalls;
for (const invalid of [{ ...liveBody, storeHistory: true }, { ...liveBody, kind: "doc" }, { ...liveBody, editBase: undefined }, { ...liveBody, automaticRun: body.automaticRun }, { ...liveBody, contextPackage: { ...live.contextPackage, items: live.contextPackage!.items.map(i => ({ ...i, source: { ...i.source, relativePath: "other.py" } })) } }]) assert.equal((await send(invalid)).status, 400);
assert.equal(providerCalls, liveCalls);
const livePrompt = buildPrompt({ liveObserver: true, fileName: "main.py", kind: "code", content: "", context: { mode: "improve_code" }, projectContext: ProjectContextSchema.parse(live.contextPackage), editBase: live.editBase });
assert.match(livePrompt, /NO_SUGGESTION/); assert.match(livePrompt, /UNTRUSTED DATA/); assert.match(livePrompt, /Never claim code was tested or fixed/);
console.log("live observer backend harness: all assertions passed");

// Explain conversations use the authenticated route, enforce bounded input and never write transcripts.
const explainBody = { ...liveBody, liveObserver: undefined, editBase: undefined, mode: 'explain', explanation: { question: 'Why?', messages: [{ role: 'user', content: 'Explain' }, { role: 'assistant', content: 'Old answer' }] }, contextPackage: { ...live.contextPackage!, intent: { mode: 'explain', instruction: 'Explain' } } };
assert.equal((await send(explainBody)).status, 200);
assert.equal(historyCalls, 0);
const explainCalls = providerCalls;
for (const invalid of [
 { ...explainBody, storeHistory: true }, { ...explainBody, liveObserver: true }, { ...explainBody, automaticRun: body.automaticRun },
 { ...explainBody, editBase: live.editBase }, { ...explainBody, explanation: { question: 'x'.repeat(501), messages: [] } },
 { ...explainBody, explanation: { question: 'why', messages: Array.from({length:10}, (_, i) => ({ role: i%2 ? 'assistant' : 'user', content: 'x' })) } },
 { ...explainBody, explanation: { question: 'password=fixture-secret-value-123456', messages: [] } },
 { ...explainBody, contextPackage: { ...explainBody.contextPackage, items: explainBody.contextPackage.items.map(item => ({ ...item, source: { ...item.source, relativePath: 'other.py' } })) } },
]) assert.equal((await send(invalid)).status, 400);
assert.equal(providerCalls, explainCalls);
authenticated = false; assert.equal((await send(explainBody)).status, 401); authenticated = true;
console.log('Explain conversation route: authentication, validation, limits and no transcript storage passed');
// Phase A: exercise the real authenticated backend with exact, complete synthetic scopes.
for(const maximum of [8000,20000])for(const size of [7999,8000,8001,12000,19999,20000,20001]) {
 const code='value = 1 #'+ 'x'.repeat(size-11);
 const seed={mode:'explain' as const,kind:'code' as const,activeRelativePath:'main.py',fileName:'main.py',language:'python',content:code,cursorLine:1,cursorColumn:1,explainScope:'file' as const,exclusions:[],maximumTotalCharacters:30000,maximumCharactersPerFile:20000,maximumRelatedFiles:4};
 // Construct oversized adversarial payloads too: the backend must reject without dispatch.
 const base=buildExplainContext({...seed,content:'value = 1'});
 const items=base.items.map(item=>item.type==='complete_file'?{...item,content:code,estimatedCharacters:code.length,estimatedTokens:Math.ceil(code.length/4)}:item);
 const totalCharacters=items.reduce((n,item)=>n+item.content.length,0);
 const contextPackage={...base,items,totalCharacters,estimatedTokens:Math.ceil(totalCharacters/4),limits:{...base.limits,maximumCharactersPerFile:maximum}};
 const before=providerCalls;
 const result=await send({...explainBody,fileName:seed.fileName,cursorLine:1,cursorColumn:1,explanation:{question:base.intent.instruction,messages:[]},contextPackage});
 assert.equal(result.status,size<=maximum?200:400,`${size} / ${maximum}: ${JSON.stringify(await result.json())}`);
 assert.equal(providerCalls,before+(size<=maximum?1:0));
}
assert.equal(historyCalls,0);
console.log('Phase A backend: 7999/8000/8001/12000/20001 exact full-file budgets and no rejected-request dispatch passed');


// Generated answers survive optional history failures, with no fabricated ID or retry.
for (const mode of ["missing_table", "network", "saved"] as const) {
  historyMode = mode;
  for (const input of [{ ...body, automaticRun: undefined, storeHistory: true }, { provider: "demo", content: "print(1)", fileName: "example.py", kind: "code" }]) {
    authMethod = "client" in input ? "bearer" : "cookie";
    const before = providerCalls;
    const result = await send(input);
    assert.equal(result.status, 200);
    const output = await result.json();
    assert.ok(output.suggestion.explanation);
    assert.equal(providerCalls, before + 1, "storage failure must not regenerate/charge twice");
    assert.equal(Boolean(output.suggestion.id), mode === "saved");
    assert.equal(Boolean(output.suggestion.historyWarning), mode !== "saved");
  }
}
assert.equal(historyCalls, 6);
historyMode = "forbid";
authMethod = "bearer";
assert.equal((await send(body)).status, 200);
assert.equal(historyCalls, 6, "automatic history opt-out is preserved");
console.log("manual history-failure regression harness: all assertions passed");

// Missing settings never silently become permission to send code.
{
  const settingsModule = await import("../src/lib/server/desktop-settings.ts");
  const source = readFileSync(new URL("../src/app/api/desktop-settings/route.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const api: { GET?: (r: Request) => Promise<Response> } = {};
  let code: string | null = "PGRST205";
  new Function("require", "exports", compiled)((name: string) => {
    if (name === "next/server") return { NextResponse: { json: (value: unknown, init?: ResponseInit) => Response.json(value, init) } };
    if (name.endsWith("/desktop-settings")) return settingsModule;
    if (name.endsWith("/request-auth")) return { authenticateApiRequest: async () => ({ user: { id: "fixture" }, supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: code ? { code } : null }) }) }) }) } }) };
    throw new Error(name);
  }, api);
  const missing = await api.GET!(new Request("http://localhost/api/desktop-settings"));
  assert.equal(missing.status, 500); assert.match((await missing.json()).error, /migration/);
  code = "42501";
  const denied = await api.GET!(new Request("http://localhost/api/desktop-settings"));
  assert.equal(denied.status, 500); assert.match((await denied.json()).error, /permissions/);
  code = null;
  assert.equal((await api.GET!(new Request("http://localhost/api/desktop-settings"))).status, 200);
}
console.log("settings availability regression harness: all assertions passed");

// Manual Fix Code has its own authenticated contract and never writes conversations.
{
 const {buildFixCodeContext}=await import('../apps/desktop/src/main/fix-code-context.ts');
 const {fixSelectionRange}=await import('../apps/desktop/src/shared/fix-code.ts');
 const {createHash}=await import('node:crypto');
 const content='function add(a,b) { return a + b; }';
 const contextPackage=buildFixCodeContext({mode:'fix_error',kind:'code',activeRelativePath:'main.js',fileName:'main.js',language:'javascript',content,cursorLine:1,cursorColumn:1,maximumTotalCharacters:9000,maximumCharactersPerFile:6000,maximumRelatedFiles:0,exclusions:[]});
 const input={client:'desktop',provider:'demo',mode:'fix_error',kind:'code',fileName:'main.js',language:'javascript',source:'cursor',cursorLine:1,cursorColumn:1,storeHistory:false,contextPackage,editBase:{targetRelativePath:'main.js',originalContentHash:createHash('sha256').update(content).digest('hex'),contentLength:content.length,basedOnUnsavedContent:true},fixCode:{scope:'file',range:fixSelectionRange(content),clarifications:[]}};
 const before=historyCalls;
 const response=await send(input);assert.equal(response.status,200,JSON.stringify(await response.clone().json()));assert.equal((await response.json()).suggestion.fixOutcome,'no_problem');
 assert.equal((await send({...input,fixCode:{...input.fixCode,clarifications:[{question:'What should this do?',answer:'Add two numbers.'}]}})).status,200);
 for(const bad of [{...input,fixCode:undefined},{...input,storeHistory:true},{...input,mode:'improve_code'},{...input,fixCode:{...input.fixCode,clarifications:[{question:'Intent?',answer:'password="fixture-sensitive-value"'}]}},{...input,contextPackage:{...contextPackage,items:contextPackage.items.map(i=>i.source.relativePath?{...i,source:{...i.source,relativePath:'other.js'}}:i)}}])assert.equal((await send(bad)).status,400);
 authenticated=false;assert.equal((await send(input)).status,401);authenticated=true;assert.equal(historyCalls,before);
 console.log('Fix Code route: no-diagnostic requests, clarification, authentication, scope/isolation, secret checks and no transcript writes passed');
}

// Improve Code keeps a separate authenticated, scoped, session-only contract.
{
 const {buildImproveCodeContext}=await import('../apps/desktop/src/main/improve-code-context.ts');
 const {resolveImproveScope}=await import('../apps/desktop/src/main/improve-scope.ts');
 const {createHash}=await import('node:crypto');
 const content='function f(x) { return x + 1; }';
 const seed={mode:'improve_code' as const,kind:'code' as const,activeRelativePath:'main.js',fileName:'main.js',language:'javascript',content,cursorLine:1,cursorColumn:10,maximumTotalCharacters:9000,maximumCharactersPerFile:6000,maximumRelatedFiles:0,exclusions:[]};
 const contextPackage=buildImproveCodeContext(seed);
 const input={client:'desktop',provider:'demo',mode:'improve_code',kind:'code',fileName:'main.js',language:'javascript',source:'cursor',cursorLine:1,cursorColumn:10,storeHistory:false,contextPackage,editBase:{targetRelativePath:'main.js',originalContentHash:createHash('sha256').update(content).digest('hex'),contentLength:content.length,basedOnUnsavedContent:true},improveCode:{...resolveImproveScope(seed),goal:'performance',clarifications:[]}};
 const before=historyCalls;
 const response=await send(input);assert.equal(response.status,200,JSON.stringify(await response.clone().json()));assert.equal((await response.json()).suggestion.improveOutcome,'no_change');
 assert.equal((await send({...input,improveCode:{...input.improveCode,clarifications:[{question:'Keep API?',answer:'Yes.'}]}})).status,200);
 for(const bad of [{...input,improveCode:undefined},{...input,storeHistory:true},{...input,mode:'fix_error'},{...input,liveObserver:true},{...input,improveCode:{...input.improveCode,goal:'invented'}},{...input,improveCode:{...input.improveCode,clarifications:[{question:'What?',answer:'password="fixture-sensitive-value"'}]}},{...input,contextPackage:{...contextPackage,items:contextPackage.items.map(i=>i.source.relativePath?{...i,source:{...i.source,relativePath:'other.js'}}:i)}}])assert.equal((await send(bad)).status,400);
 authenticated=false;assert.equal((await send(input)).status,401);authenticated=true;assert.equal(historyCalls,before);
 console.log('Improve Code route: goal/scope/authentication, clarification, no transcript writes, privacy and action isolation passed');
}
