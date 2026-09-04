import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/supabase/request-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { ModelByProvider } from "@/lib/server/desktop-settings";

const labels = { gemini: "Gemini", openai: "OpenAI", deepseek: "DeepSeek", anthropic: "Anthropic", demo: "Demo (offline)" } as const;
const environmentAvailability = () => ({
  gemini: Boolean(process.env.GEMINI_API_KEY), openai: Boolean(process.env.OPENAI_API_KEY),
  deepseek: Boolean(process.env.DEEPSEEK_API_KEY), anthropic: Boolean(process.env.ANTHROPIC_API_KEY), demo: true,
});

export async function GET(request: Request) {
  const authenticated = await authenticateApiRequest(request);
  if (!authenticated) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data, error } = await createServiceClient().from("api_keys").select("provider").eq("user_id", authenticated.user.id);
  if (error) return NextResponse.json({ error: "Could not load provider status." }, { status: 500 });
  const userProviders = new Set((data ?? []).map((row) => row.provider));
  const system = environmentAvailability();
  const providers = Object.keys(ModelByProvider).map((provider) => {
    const typed = provider as keyof typeof ModelByProvider;
    const userKeyConfigured = typed !== "demo" && userProviders.has(typed);
    return { provider: typed, label: labels[typed], models: ModelByProvider[typed], systemProvided: system[typed], userKeyConfigured, available: system[typed] || userKeyConfigured };
  });
  return NextResponse.json({ providers });
}
