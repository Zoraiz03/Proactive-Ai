import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeStoredSettings,
  resolvedSettings,
  StuckSettingsPatchSchema,
} from "@/lib/server/stuck";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data, error } = await supabase
    .from("stuck_detection_settings")
    .select("preset, overrides, adaptive_overrides, proactive_help_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("[stuck-settings] read:", error.message);
    return NextResponse.json({ error: "Could not load detector settings." }, { status: 500 });
  }

  const settings = normalizeStoredSettings(data);
  return NextResponse.json({ ...settings, config: resolvedSettings(settings) });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsed = StuckSettingsPatchSchema.safeParse(
    await req.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid settings." },
      { status: 400 }
    );
  }

  const { data: existing, error: readError } = await supabase
    .from("stuck_detection_settings")
    .select("preset, overrides, adaptive_overrides, proactive_help_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) {
    return NextResponse.json({ error: "Could not load detector settings." }, { status: 500 });
  }

  const current = normalizeStoredSettings(existing);
  const next = {
    preset: parsed.data.preset ?? current.preset,
    overrides: parsed.data.overrides ?? current.overrides,
    adaptive_overrides: current.adaptiveOverrides,
    proactive_help_enabled:
      parsed.data.proactiveHelpEnabled ?? current.proactiveHelpEnabled,
  };
  const { error } = await supabase.from("stuck_detection_settings").upsert({
    user_id: user.id,
    ...next,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[stuck-settings] write:", error.message);
    return NextResponse.json({ error: "Could not save detector settings." }, { status: 500 });
  }

  const settings = normalizeStoredSettings(next);
  return NextResponse.json({ ...settings, config: resolvedSettings(settings) });
}
