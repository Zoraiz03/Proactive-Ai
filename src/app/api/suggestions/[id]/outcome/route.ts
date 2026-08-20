import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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
  const detectorTypes = Array.isArray(metadata.detectorTypes)
    ? metadata.detectorTypes.filter(
        (type): type is string =>
          type === "repeated_edit" ||
          type === "repeated_error" ||
          type === "cursor_thrashing"
      )
    : [];
  const { error: outcomeError } = await supabase.from("suggestion_outcomes").insert({
    suggestion_id: parsedParams.data.id,
    user_id: user.id,
    outcome: parsedBody.data.outcome,
    detector_types: detectorTypes,
    detector_metadata: suggestion.detector_metadata,
  });
  if (outcomeError) {
    if (outcomeError.code === "23505") {
      return NextResponse.json({ recorded: true });
    }
    console.error("[suggestion-outcome] insert:", outcomeError.message);
    return NextResponse.json({ error: "Could not record the outcome." }, { status: 500 });
  }

  return NextResponse.json({ recorded: true });
}
