import { validFixContext, type FixCodeContext } from "../../../../apps/desktop/src/shared/fix-code.ts";
import { EXPLANATION_LIMITS, validExplanationInput } from "../../../../apps/desktop/src/shared/explanation.ts";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/supabase/request-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { decrypt } from "@/lib/server/crypto";
import { getSuggestion, ProviderError, Provider } from "@/lib/server/providers";
import { ProjectContextSchema, formatUntrustedProjectContext, safeProjectContextMetadata } from "@/lib/server/project-context";
import { EditBaseSchema } from "@/lib/server/ai-edit";

const ProviderSchema = z.enum(["gemini", "deepseek", "openai", "anthropic", "demo"]);
const CodeModeSchema = z.enum(["explain", "fix_error", "improve_code", "continue_code", "generate_tests", "add_comments"]);
const DocumentModeSchema = z.enum(["explain_document", "improve_writing", "summarize", "generate_readme_section"]);
const ModeSchema = z.union([CodeModeSchema, DocumentModeSchema]);
const ModelForProvider = { gemini: "gemini-2.5-flash", openai: "gpt-4o-mini", deepseek: "deepseek-chat", anthropic: "claude-haiku-4-5-20251001", demo: "demo-local" } as const;

const WebBody = z.object({
  client: z.literal("web").optional(),
  provider: z.enum(["gemini", "deepseek", "openai", "anthropic", "demo"]),
  fileName: z.string().max(255).default("untitled"),
  kind: z.enum(["code", "doc"]).default("code"),
  content: z.string().min(1, "Nothing to review yet.").max(100_000),
  context: z
    .object({
      selectedText: z.string().max(50_000).optional(),
      cursorLine: z.number().int().positive().optional(),
      nearbyContent: z.string().max(20_000).optional(),
    })
    .default({}),
});

const DesktopBody = z.object({
  fixCode: z.custom<FixCodeContext>(validFixContext).optional(),
  explanation: z.custom<import("../../../../apps/desktop/src/shared/explanation").ExplanationInput>(validExplanationInput).optional(),
  liveObserver: z.literal(true).optional(),
  automaticRun: z.object({ trigger: z.literal("failed_run"), runId: z.string().uuid() }).strict().optional(),
  client: z.literal("desktop"),
  provider: ProviderSchema,
  model: z.string().min(1).max(100).optional(),
  storeHistory: z.boolean().default(true),
  mode: ModeSchema,
  kind: z.enum(["code", "doc"]),
  fileName: z.string().min(1).max(255).regex(/^[^\\/]+$/),
  language: z.string().min(1).max(64),
  source: z.enum(["selection", "cursor", "diagnostic"]),
  cursorLine: z.number().int().positive(),
  cursorColumn: z.number().int().positive(),
  selectedCode: z.string().min(1).max(20_000).optional(),
  nearbyCode: z.string().min(1).max(20_000).optional(),
  diagnostic: z.object({
    fileName: z.string().min(1).max(255).regex(/^[^\\/]+$/),
    line: z.number().int().positive(),
    column: z.number().int().positive(),
    message: z.string().min(1).max(2_000),
  }).optional(),
  runError: z.string().min(1).max(8_000).optional(),
  activeFile: z.string().min(1).max(50_000).optional(),
  contextPackage: ProjectContextSchema,
  editBase: EditBaseSchema.optional(),
}).superRefine((body, context) => {
  if (body.explanation && (body.mode !== 'explain' || body.kind !== 'code' || body.automaticRun || body.liveObserver || body.editBase || body.storeHistory || body.contextPackage.totalCharacters > EXPLANATION_LIMITS.contextCharacters ||
    body.contextPackage.totalCharacters + body.explanation.question.length + body.explanation.messages.reduce((n, m) => n + m.content.length, 0) > body.contextPackage.limits.maximumTotalCharacters ||
    body.contextPackage.items.some(item => !['user_instruction', 'selected_code', 'current_symbol', 'nearby_code'].includes(item.type) || (item.source.relativePath && item.source.relativePath !== body.contextPackage.activeFile.relativePath)) ||
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|password|access[_-]?token)\s*[:=]\s*["']?[A-Za-z0-9_./+\-=]{12,}/i.test(JSON.stringify(body.explanation)))) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid or unsafe explanation conversation.' });
  const liveContextInvalid = body.automaticRun || body.mode !== "improve_code" || body.kind !== "code" ||
    !["python", "javascript"].includes(body.language) || body.storeHistory || !body.editBase ||
    body.contextPackage.totalCharacters > 9000 || body.contextPackage.items.length > 5 ||
    !body.contextPackage.items.some(item => item.type === "nearby_code") ||
    body.contextPackage.items.some(item =>
      !["nearby_code", "diagnostic", "user_instruction"].includes(item.type) ||
      item.source.relativePath !== body.contextPackage.activeFile.relativePath ||
      item.content.length > (item.type === "nearby_code" ? 6000 : item.type === "diagnostic" ? 1000 : 500));
  if (body.liveObserver && liveContextInvalid) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid bounded Live Observer context." });
  }
  const automaticContextInvalid = body.mode !== "explain" || body.kind !== "code" ||
    !["python", "javascript"].includes(body.language) || body.editBase || body.storeHistory ||
    body.contextPackage.totalCharacters > 9_000 || body.contextPackage.items.length !== 3 ||
    !body.contextPackage.items.some((item) => item.type === "controlled_run_error") ||
    !body.contextPackage.items.some((item) => item.type === "nearby_code") ||
    body.contextPackage.items.some((item) =>
      !["user_instruction", "controlled_run_error", "nearby_code"].includes(item.type) ||
      (item.source.relativePath && item.source.relativePath !== body.contextPackage.activeFile.relativePath) ||
      (item.type === "nearby_code" && item.content.length > 6_000) ||
      (item.type === "controlled_run_error" && item.content.length > 2_000));
  if (body.automaticRun && automaticContextInvalid) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Automatic explanations require bounded failed-run context, explanation-only mode, and disabled history." });
  }
  if (body.model && body.model !== ModelForProvider[body.provider]) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "The requested model is not supported for this provider." });
  }
  const normalizedFileName = body.fileName.toLowerCase();
  const sensitive = /^\.env(?:\.|$)/.test(normalizedFileName) ||
    [".npmrc", ".pypirc", ".netrc", "credentials", "id_rsa", "id_ed25519"].includes(normalizedFileName) ||
    /\.(?:pem|key|p12|pfx)$/.test(normalizedFileName);
  if (sensitive) context.addIssue({ code: z.ZodIssueCode.custom, message: "Sensitive files cannot be sent." });
  const containsSecret = (value?: string) => Boolean(value && (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value) || /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)\b\s*[:=]\s*["']?[A-Za-z0-9_./+\-=]{12,}/i.test(value)));
  if ([body.selectedCode, body.nearbyCode, body.activeFile, body.runError].some(containsSecret)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Potential secret material cannot be sent." });
  }
  const codeModes = CodeModeSchema.options as readonly string[];
  const documentModes = DocumentModeSchema.options as readonly string[];
  if ((body.kind === "code" && !codeModes.includes(body.mode)) ||
      (body.kind === "doc" && !documentModes.includes(body.mode))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Request mode does not match the active file type." });
  }
  if (body.contextPackage.intent.mode !== body.mode || body.contextPackage.activeFile.fileName !== body.fileName || body.contextPackage.activeFile.language !== body.language || body.contextPackage.activeFile.kind !== body.kind || body.contextPackage.cursor.line !== body.cursorLine || body.contextPackage.cursor.column !== body.cursorColumn) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Structured context does not match the Observer request." });
  }
  if (body.mode === 'fix_error' && !body.fixCode) context.addIssue({code:z.ZodIssueCode.custom,message:'Fix Code requires an explicit reviewed scope.'});
  if (body.fixCode && (body.mode !== 'fix_error' || body.kind !== 'code' || body.liveObserver || body.automaticRun || body.explanation || body.storeHistory || !body.editBase ||
    body.contextPackage.totalCharacters + body.fixCode.clarifications.reduce((n,t)=>n+t.question.length+t.answer.length,0) > body.contextPackage.limits.maximumTotalCharacters ||
    body.contextPackage.items.some(i=>!['user_instruction','selected_code','complete_file','nearby_code','diagnostic','terminal_error'].includes(i.type) || (i.source.relativePath && i.source.relativePath !== body.contextPackage.activeFile.relativePath)) ||
    !body.contextPackage.items.some(i=> i.type === (body.fixCode!.scope==='file'?'complete_file':'selected_code') && !i.truncated && !i.redacted && !i.optional) ||
    body.fixCode.clarifications.some(t=>containsSecret(t.question)||containsSecret(t.answer)))) context.addIssue({code:z.ZodIssueCode.custom,message:'Invalid or unsafe Fix Code context.'});
  const editable = ["fix_error", "improve_code", "continue_code", "add_comments"].includes(body.mode);
  if (editable && (!body.editBase || body.editBase.targetRelativePath !== body.contextPackage.activeFile.relativePath)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Editable Observer actions require the active-file edit base." });
  if (!editable && body.editBase) context.addIssue({ code: z.ZodIssueCode.custom, message: "This Observer action is suggestion-only." });
  if (body.diagnostic && (body.mode !== "fix_error" || body.diagnostic.fileName !== body.fileName)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Diagnostic context does not match the active file." });
  }
  if (body.runError && !body.diagnostic) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Run error context requires a diagnostic." });
  }
  if (body.activeFile && !["generate_tests", "explain_document", "summarize", "generate_readme_section"].includes(body.mode)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Full active-file context is not allowed for this mode." });
  }
});

const Body = z.union([DesktopBody, WebBody]);

const ENV_KEY: Record<Exclude<Provider, "demo">, string | undefined> = {
  gemini: process.env.GEMINI_API_KEY,
  deepseek: process.env.DEEPSEEK_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
};

export async function POST(req: Request) {
  const requestStartedAt = Date.now();
  const authenticated = await authenticateApiRequest(req);
  if (!authenticated) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { supabase, user, method } = authenticated;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }
  if (method === "bearer" && !("mode" in parsed.data)) {
    return NextResponse.json({ error: "Desktop requests require focused context." }, { status: 400 });
  }
  const desktop = "mode" in parsed.data ? parsed.data : null;
  const web = "context" in parsed.data ? parsed.data : null;
  const desktopItem = (type: string) => desktop?.contextPackage.items.find((item) => item.type === type);
  const diagnosticItem = desktopItem("diagnostic");
  const provider = parsed.data.provider;
  const fileName = parsed.data.fileName.split(/[\\/]/).at(-1) ?? "untitled";
  const kind = desktop?.kind ?? web?.kind ?? "code";
  const context = desktop
    ? {
        selectedText: desktopItem("selected_code")?.content,
        cursorLine: desktop.cursorLine,
        nearbyContent: desktopItem("current_symbol")?.content ?? desktopItem("nearby_code")?.content,
        mode: desktop.mode,
        language: desktop.language,
        source: desktop.source,
        client: "desktop" as const,
        diagnostic: diagnosticItem ? { fileName: desktop.fileName, line: diagnosticItem.source.lineStart ?? desktop.cursorLine, column: desktop.cursorColumn, message: diagnosticItem.content } : undefined,
        runError: desktopItem("terminal_error")?.content,
        activeFileIncluded: desktop.contextPackage.containsCompleteFile,
      }
    : { ...web!.context, mode: "improve_code" as const, client: "web" as const };
  const content = desktop
    ? formatUntrustedProjectContext(desktop.contextPackage)
    : web!.content;

  // Resolve the key: the user's own stored key wins; the server-wide env key
  // is the fallback. Keys are read with the service client (bypasses RLS) and
  // never leave the server.
  let apiKey: string | null = null;
  if (provider !== "demo") {
    const svc = createServiceClient();
    const { data: row } = await svc
      .from("api_keys")
      .select("encrypted_key")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .maybeSingle();

    apiKey = row ? decrypt(row.encrypted_key) : ENV_KEY[provider] ?? null;
    if (!apiKey) {
      return NextResponse.json(
        {
          error: "No API key saved for this provider yet. Add your key to use it.",
          needsKey: true,
        },
        { status: 400 }
      );
    }
  }

  try {
    const suggestion = await getSuggestion(provider, apiKey, {
      fileName,
      kind,
      content,
      context,
      ...(desktop?.fixCode ? {fixCode: desktop.fixCode} : {}),
      ...(desktop?.explanation ? { explanation: desktop.explanation } : {}),
      ...(desktop?.liveObserver ? { liveObserver: true } : {}),
      ...(desktop?.automaticRun ? { automaticRun: true } : {}),
      ...(desktop ? { projectContext: desktop.contextPackage } : {}),
      ...(desktop?.editBase ? { editBase: desktop.editBase } : {}),
    }, desktop?.model);
    if (!suggestion.explanation) {
      return NextResponse.json(
        { error: "The model returned an empty suggestion. Try again." },
        { status: 502 }
      );
    }
    if (desktop && !desktop.storeHistory) {
      return NextResponse.json({ suggestion, provider });
    }
    // History is optional: a storage outage must not discard a paid-for answer.
    let saved: { id: string } | null = null;
    let historyFailed = false;
    try {
      const result = await supabase
        .from("suggestions")
        .insert({
          user_id: user.id,
          provider,
          file_name: fileName,
          detector_metadata: {
            trigger: "manual",
            client: desktop ? "desktop" : "web",
            authMethod: method,
            mode: context.mode,
            kind,
            contextSource: context.source ?? (context.selectedText ? "selection" : "cursor"),
            language: context.language ?? null,
            hasSelection: Boolean(context.selectedText),
            cursorLine: context.cursorLine ?? null,
            diagnosticLine: context.diagnostic?.line ?? null,
            activeFileIncluded: Boolean(context.activeFileIncluded),
            ...(desktop ? { projectContext: safeProjectContextMetadata(desktop.contextPackage) } : {}),
            editProposed: Boolean(desktop?.editBase && suggestion.edit),
            targetFileType: desktop?.language ?? kind,
            responseLatencyMs: Math.max(0, Date.now() - requestStartedAt),
          },
          score: 0,
          explanation: suggestion.explanation,
          // Editable code stays only in the authenticated response and local checkpoint.
          // Supabase receives metadata, not replacement code.
          snippet: suggestion.edit ? "" : suggestion.snippet,
          reason: suggestion.reason,
        })
        .select("id")
        .single();
      saved = result.data;
      historyFailed = Boolean(result.error || !saved?.id);
      if (result.error) console.error("[suggest] history unavailable:", result.error.code ?? "unknown");
    } catch {
      historyFailed = true;
      console.error("[suggest] history transport unavailable");
    }
    return NextResponse.json({ suggestion: {
      ...suggestion,
      ...(!historyFailed && saved?.id ? { id: saved.id } : {}),
      ...(historyFailed ? { historyWarning: "This suggestion is available, but was not saved to history. Check the backend database setup or connection." } : {}),
    }, provider });
  } catch (err) {
    const pe = err as ProviderError;
    console.error(`[suggest] ${provider}:`, pe.message);
    return NextResponse.json(
      {
        error: pe.userMessage ?? "The AI provider request failed. Try again.",
        needsKey: Boolean(pe.needsKey),
      },
      { status: 502 }
    );
  }
}
