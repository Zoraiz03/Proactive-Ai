import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/supabase/request-auth";
import { createServiceClient } from "@/lib/supabase/service";

// List which providers the signed-in user has a saved key for.
// Never returns the keys themselves.
export async function GET(request: Request) {
  const authenticated = await authenticateApiRequest(request);
  if (!authenticated) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const svc = createServiceClient();
  const { data } = await svc
    .from("api_keys")
    .select("provider, updated_at")
    .eq("user_id", authenticated.user.id);

  return NextResponse.json({ keys: data ?? [] });
}
