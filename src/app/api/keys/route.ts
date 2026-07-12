import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// List which providers the signed-in user has a saved key for.
// Never returns the keys themselves.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const svc = createServiceClient();
  const { data } = await svc
    .from("api_keys")
    .select("provider, updated_at")
    .eq("user_id", user.id);

  return NextResponse.json({ keys: data ?? [] });
}
