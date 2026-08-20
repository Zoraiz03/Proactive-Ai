import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { decrypt } from "@/lib/server/crypto";
import { getSuggestion, ProviderError, Provider } from "@/lib/server/providers";

const Body = z.object({
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

const ENV_KEY: Record<Exclude<Provider, "demo">, string | undefined> = {
  gemini: process.env.GEMINI_API_KEY,
  deepseek: process.env.DEEPSEEK_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }
  const { provider, fileName, kind, content, context } = parsed.data;

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
          hasSelection: Boolean(context.selectedText),
          cursorLine: context.cursorLine ?? null,
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
