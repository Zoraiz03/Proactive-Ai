import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiRequest } from "@/lib/supabase/request-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { encrypt } from "@/lib/server/crypto";
import { verifyProviderApiKey } from "@/lib/server/verify-provider-key";

const PROVIDERS = ["gemini", "openai", "deepseek", "anthropic"];
const Body = z.object({ apiKey: z.string().min(1).max(500), verify: z.boolean().default(false) });

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const authenticated = await authenticateApiRequest(req);
  if (!authenticated) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { provider } = await params;
  if (!PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid API key is required." }, { status: 400 });
  }

  const apiKey = parsed.data.apiKey.trim();
  if (parsed.data.verify) {
    try {
      if (!(await verifyProviderApiKey(provider as "gemini" | "openai" | "deepseek" | "anthropic", apiKey))) {
        return NextResponse.json({ error: "The provider rejected this API key." }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Could not verify the key with the provider." }, { status: 502 });
    }
  }
  const svc = createServiceClient();
  const { error } = await svc.from("api_keys").upsert({
    user_id: authenticated.user.id,
    provider,
    encrypted_key: encrypt(apiKey),
    updated_at: new Date().toISOString(),
  });
  if (error) {
    return NextResponse.json({ error: "Could not save the key." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, provider });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const authenticated = await authenticateApiRequest(req);
  if (!authenticated) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { provider } = await params;
  if (!PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  }
  const svc = createServiceClient();
  await svc.from("api_keys").delete().eq("user_id", authenticated.user.id).eq("provider", provider);
  return NextResponse.json({ ok: true });
}
