import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { DetectorType } from "@/lib/stuck-config";
import {
  adaptDetectorSettings,
  DetectorTypeSchema,
  normalizeStoredSettings,
} from "@/lib/server/stuck";

const Body = z.object({ outcome: z.enum(["accepted", "dismissed"]) });
const Params = z.object({ id: z.string().uuid() });

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const parsedParams = Params.safeParse(params);
  const parsedBody = Body.safeParse(await req.json().catch(() => null));
  if (!parsedParams.success || !parsedBody.success) {
    return NextResponse.json({ error: "Invalid suggestion outcome." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: suggestion, error: suggestionError } = await supabase
    .from("suggestions")
    .select("detector_metadata")
    .eq("id", parsedParams.data.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (suggestionError || !suggestion) {
    return NextResponse.json({ error: "Suggestion not found." }, { status: 404 });
  }

  const metadata = suggestion.detector_metadata as { detectorTypes?: unknown };
  const detectorTypes = z
    .array(DetectorTypeSchema)
    .catch([])
    .parse(metadata.detectorTypes);
  const { error: outcomeError } = await supabase.from("suggestion_outcomes").insert({
    suggestion_id: parsedParams.data.id,
    user_id: user.id,
    outcome: parsedBody.data.outcome,
    detector_types: detectorTypes,
    detector_metadata: suggestion.detector_metadata,
  });
  if (outcomeError) {
    if (outcomeError.code === "23505") {
      return NextResponse.json({ recorded: true, adapted: [] });
    }
    console.error("[suggestion-outcome] insert:", outcomeError.message);
    return NextResponse.json({ error: "Could not record the outcome." }, { status: 500 });
  }

  const adapted: DetectorType[] = [];
  if (parsedBody.data.outcome === "dismissed") {
    const { data: settingsRow } = await supabase
      .from("stuck_detection_settings")
      .select("preset, overrides, adaptive_overrides")
      .eq("user_id", user.id)
      .maybeSingle();
    const settings = normalizeStoredSettings(settingsRow);
    let adaptiveOverrides = settings.adaptiveOverrides;

    for (const detector of detectorTypes) {
      const { data: recent, error } = await supabase
        .from("suggestion_outcomes")
        .select("outcome")
        .eq("user_id", user.id)
        .contains("detector_types", [detector])
        .order("created_at", { ascending: false })
        .limit(20);
      if (error || recent.length < 20) continue;

      const dismissRate =
        recent.filter((item) => item.outcome === "dismissed").length / recent.length;
      if (dismissRate > 0.7) {
        const adaptedSettings = { ...settings, adaptiveOverrides };
        adaptiveOverrides = adaptDetectorSettings(adaptedSettings, detector);
        adapted.push(detector);
      }
    }

    if (adapted.length > 0) {
      const { error } = await supabase.from("stuck_detection_settings").upsert({
        user_id: user.id,
        preset: settings.preset,
        overrides: settings.overrides,
        adaptive_overrides: adaptiveOverrides,
        updated_at: new Date().toISOString(),
      });
      if (error) console.error("[suggestion-outcome] adapt:", error.message);
    }
  }

  return NextResponse.json({ recorded: true, adapted });
}
