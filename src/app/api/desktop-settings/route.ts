import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/supabase/request-auth";
import { DEFAULT_DESKTOP_SETTINGS, DesktopSettingsSchema, desktopSettingsToRow, rowToDesktopSettings } from "@/lib/server/desktop-settings";

function settingsError(code: string | undefined, action: "load" | "save") {
  if (["PGRST205", "42P01", "42703", "PGRST204"].includes(code ?? "")) return "Desktop privacy settings are not installed in this database. Apply the existing desktop_user_settings migration, then retry.";
  if (code === "42501") return "Database permissions prevent access to desktop privacy settings. Check the existing settings grants and ownership policies.";
  return `Could not ${action} synced settings. Check the backend database connection and retry.`;
}

const columns = "preferred_provider, preferred_model, observer_enabled, default_observer_action, show_context_preview, include_diagnostics, include_terminal_error, maximum_context_chars, confirm_complete_file, store_suggestion_history";

export async function GET(request: Request) {
  const authenticated = await authenticateApiRequest(request);
  if (!authenticated) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data, error } = await authenticated.supabase.from("desktop_user_settings").select(columns).eq("user_id", authenticated.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: settingsError(error.code, "load") }, { status: 500 });
  return NextResponse.json({ settings: data ? rowToDesktopSettings(data) : DEFAULT_DESKTOP_SETTINGS });
}

export async function PUT(request: Request) {
  const authenticated = await authenticateApiRequest(request);
  if (!authenticated) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const parsed = DesktopSettingsSchema.safeParse(body?.settings);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid settings." }, { status: 400 });
  const { data, error } = await authenticated.supabase.from("desktop_user_settings")
    .upsert(desktopSettingsToRow(parsed.data, authenticated.user.id), { onConflict: "user_id" }).select(columns).single();
  if (error) return NextResponse.json({ error: settingsError(error.code, "save") }, { status: 500 });
  return NextResponse.json({ settings: rowToDesktopSettings(data) });
}
