import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { encrypt } from "@/lib/server/crypto";

const PROVIDERS = ["gemini", "openai", "deepseek", "anthropic"];
const Body = z.object({ apiKey: z.string().min(1).max(500) });

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { provider } = await params;
  if (!PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid API key is required." }, { status: 400 });
  }

  const svc = createServiceClient();
  const { error } = await svc.from("api_keys").upsert({
    user_id: user.id,
    provider,
    encrypted_key: encrypt(parsed.data.apiKey.trim()),
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
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { provider } = await params;
  const svc = createServiceClient();
  await svc.from("api_keys").delete().eq("user_id", user.id).eq("provider", provider);
  return NextResponse.json({ ok: true });
}
