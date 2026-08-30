import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/supabase/request-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { decrypt } from "@/lib/server/crypto";
import { getSuggestion, ProviderError, Provider } from "@/lib/server/providers";

const ProviderSchema = z.enum(["gemini", "deepseek", "openai", "anthropic", "demo"]);
const ModeSchema = z.enum(["explain", "fix_error", "improve_code", "continue_code", "generate_tests"]);

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
  client: z.literal("desktop"),
  provider: ProviderSchema,
  mode: ModeSchema,
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
}).superRefine((body, context) => {
  const normalizedFileName = body.fileName.toLowerCase();
  const sensitive = /^\.env(?:\.|$)/.test(normalizedFileName) ||
    [".npmrc", ".pypirc", ".netrc", "credentials", "id_rsa", "id_ed25519"].includes(normalizedFileName) ||
    /\.(?:pem|key|p12|pfx)$/.test(normalizedFileName);
  if (sensitive) context.addIssue({ code: z.ZodIssueCode.custom, message: "Sensitive files cannot be sent." });
  if (!body.selectedCode && !body.nearbyCode && !body.diagnostic && !body.activeFile) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "No focused context was provided." });
  }
  if (body.source === "selection" && !body.selectedCode) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Selected-code context is missing." });
  }
  if (body.source === "diagnostic" && (!body.diagnostic || body.mode !== "fix_error")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Diagnostic context requires Fix Error mode." });
  }
  if (body.mode === "fix_error" && !body.diagnostic) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Fix Error requires a diagnostic." });
  }
  if (body.diagnostic && (body.mode !== "fix_error" || body.diagnostic.fileName !== body.fileName)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Diagnostic context does not match the active file." });
  }
  if (body.runError && !body.diagnostic) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Run error context requires a diagnostic." });
  }
  if (body.activeFile && body.mode !== "generate_tests") {
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
  const provider = parsed.data.provider;
  const fileName = parsed.data.fileName.split(/[\\/]/).at(-1) ?? "untitled";
  const kind = web?.kind ?? "code";
  const context = desktop
    ? {
        selectedText: desktop.selectedCode,
        cursorLine: desktop.cursorLine,
        nearbyContent: desktop.nearbyCode,
        mode: desktop.mode,
        language: desktop.language,
        source: desktop.source,
        client: "desktop" as const,
        diagnostic: desktop.diagnostic,
        runError: desktop.runError,
        activeFileIncluded: Boolean(desktop.activeFile),
      }
    : { ...web!.context, mode: "improve_code" as const, client: "web" as const };
  const content = desktop
    ? desktop.activeFile ?? desktop.selectedCode ?? desktop.nearbyCode ?? desktop.diagnostic?.message ?? ""
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
    });
    if (!suggestion.explanation) {
      return NextResponse.json(
        { error: "The model returned an empty suggestion. Try again." },
        { status: 502 }
      );
    }
    const { data: saved, error: saveError } = await supabase
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
          contextSource: context.source ?? (context.selectedText ? "selection" : "cursor"),
          language: context.language ?? null,
          hasSelection: Boolean(context.selectedText),
          cursorLine: context.cursorLine ?? null,
          diagnosticLine: context.diagnostic?.line ?? null,
          activeFileIncluded: Boolean(context.activeFileIncluded),
        },
        score: 0,
        explanation: suggestion.explanation,
        snippet: suggestion.snippet,
        reason: suggestion.reason,
      })
      .select("id")
      .single();
    if (saveError) {
      console.error("[suggest] persist:", saveError.message);
      return NextResponse.json(
        { error: "The suggestion was generated but could not be saved." },
        { status: 500 }
      );
    }
    return NextResponse.json({ suggestion: { ...suggestion, id: saved.id }, provider });
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
