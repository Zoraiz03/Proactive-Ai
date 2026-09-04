import { createClient as createSupabaseClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { bearerClientOptions, parseBearerHeader } from "@/lib/server/bearer-token";
import { createClient as createCookieClient } from "@/lib/supabase/server";

export interface AuthenticatedApiRequest {
  supabase: SupabaseClient;
  user: User;
  method: "cookie" | "bearer";
}

function publicSupabaseKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
}

export async function authenticateApiRequest(request: Request): Promise<AuthenticatedApiRequest | null> {
  const bearer = parseBearerHeader(request.headers.get("authorization"));
  if (bearer.kind === "invalid") return null;

  if (bearer.kind === "absent") {
    const supabase = await createCookieClient();
    const { data, error } = await supabase.auth.getUser();
    return error || !data.user ? null : { supabase, user: data.user, method: "cookie" };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publishableKey = publicSupabaseKey();
  if (!supabaseUrl || !publishableKey) return null;
  const supabase = createSupabaseClient(supabaseUrl, publishableKey, bearerClientOptions(bearer.token));
  const { data, error } = await supabase.auth.getUser(bearer.token);
  return error || !data.user ? null : { supabase, user: data.user, method: "bearer" };
}
