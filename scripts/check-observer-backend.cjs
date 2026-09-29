// Read-only schema readiness probe. Never prints credentials or user rows.
require('@next/env').loadEnvConfig(process.cwd());
const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const checks = [
  ['suggestions', 'id,user_id,provider,file_name,detector_metadata,score,explanation,snippet,reason', '20260820100515_add_stuck_suggestion_feedback.sql'],
  ['suggestion_outcomes', 'id,suggestion_id,user_id,outcome,detector_types,detector_metadata', '20260820100515_add_stuck_suggestion_feedback.sql'],
  ['desktop_user_settings', 'user_id,preferred_provider,preferred_model,observer_enabled,default_observer_action,show_context_preview,include_diagnostics,include_terminal_error,maximum_context_chars,confirm_complete_file,store_suggestion_history', '20260831061842_add_desktop_user_settings.sql'],
];
async function main() {
  if (!url || !key) throw new Error('Public Supabase configuration is missing.');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) } });
  for (const [table, columns, migration] of checks) {
    const { error } = await db.from(table).select(columns).limit(0);
    if (!error) console.log(`OK ${table}: expected columns are available.`);
    else {
      process.exitCode = 1;
      const missing = ['PGRST205', 'PGRST204', '42P01', '42703'].includes(error.code);
      console.log(`FAIL ${table}: ${missing ? `missing schema; review existing migration supabase/migrations/${migration}` : `connection/access error (${error.code || 'network'}); check backend connectivity and database permissions`}.`);
    }
  }
  console.log('This checks schema availability only, not signed-in ownership policies or provider quality.');
}
main().catch(() => { console.error('Backend readiness check failed. Check configuration and connectivity.'); process.exitCode = 1; });
