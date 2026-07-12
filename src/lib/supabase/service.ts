import { createClient } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS entirely, so it is SERVER-ONLY and must
// never be imported into client code. Used to read/write the api_keys table,
// which has no client-facing RLS policy by design.
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
