import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/supabase/request-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { decrypt } from "@/lib/server/crypto";
import { getProviderStructuredJson, ProviderError } from "@/lib/server/providers";
import { buildDocumentationUpdatePrompt, demoDocumentationEdit, DocumentationDraftRequestSchema, DocumentationEditSchema } from "@/lib/server/documentation-update";

const MODELS = { gemini: "gemini-2.5-flash", openai: "gpt-4o-mini", deepseek: "deepseek-chat", anthropic: "claude-haiku-4-5-20251001", demo: "demo-local" } as const;
const ENV_KEYS = { gemini: process.env.GEMINI_API_KEY, openai: process.env.OPENAI_API_KEY, deepseek: process.env.DEEPSEEK_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY };

export async function POST(request: Request) {
  const startedAt = Date.now(); const authenticated = await authenticateApiRequest(request);
  if (!authenticated) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const parsed = DocumentationDraftRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid documentation request." }, { status: 400 });
  const input = parsed.data;
  if (input.model && input.model !== MODELS[input.provider]) return NextResponse.json({ error: "The requested model is not supported." }, { status: 400 });
  try {
    let raw: unknown;
    if (input.provider === "demo") raw = demoDocumentationEdit(input);
    else {
      const service = createServiceClient();
      const { data } = await service.from("api_keys").select("encrypted_key").eq("user_id", authenticated.user.id).eq("provider", input.provider).maybeSingle();
      const key = data ? decrypt(data.encrypted_key) : ENV_KEYS[input.provider];
      if (!key) return NextResponse.json({ error: "No API key is available for this provider.", needsKey: true }, { status: 400 });
      raw = await getProviderStructuredJson(input.provider, key, buildDocumentationUpdatePrompt(input), input.model);
    }
    const edit = DocumentationEditSchema.safeParse(raw);
    if (!edit.success || edit.data.targetRelativePath !== input.documentationPath || edit.data.originalDocumentHash !== input.documentationHash || edit.data.expectedOriginalMarkdown !== input.sectionText || edit.data.range.start.line !== input.sectionRange.start.line || edit.data.range.start.column !== input.sectionRange.start.column || edit.data.range.end.line !== input.sectionRange.end.line || edit.data.range.end.column !== input.sectionRange.end.column || !edit.data.relationshipReferences.includes(input.relationshipId) || !edit.data.relationshipReferences.includes(input.evidenceHash)) return NextResponse.json({ error: "The model returned an invalid or mismatched documentation edit." }, { status: 502 });
    let suggestionId = edit.data.suggestionId;
    if (input.storeHistory) {
      const { data, error } = await authenticated.supabase.from("suggestions").insert({ user_id: authenticated.user.id, provider: input.provider, file_name: "documentation.md", detector_metadata: { trigger: "manual_documentation_update", action: edit.data.action, relationshipType: input.relationshipType, confidence: input.confidence, model: input.model ?? MODELS[input.provider], changedLineCount: edit.data.replacementMarkdown.split(/\r?\n/).length, warningCount: edit.data.warnings.length, responseLatencyMs: Date.now() - startedAt }, score: 0, explanation: "Documentation draft generated for explicit local review.", snippet: "", reason: "Explicit documentation relationship update request." }).select("id").single();
      if (error) return NextResponse.json({ error: "The draft was generated but its metadata could not be recorded." }, { status: 500 });
      suggestionId = data.id;
    }
    return NextResponse.json({ edit: { ...edit.data, suggestionId }, provider: input.provider });
  } catch (error) {
    const provider = error as ProviderError;
    return NextResponse.json({ error: provider.userMessage ?? "The documentation draft could not be generated." }, { status: 502 });
  }
}
