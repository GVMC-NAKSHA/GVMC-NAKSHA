import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy singleton — do not build the client at import time. That lets the app boot (and
// `nest build` / CI run) without SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY set; the first
// authenticated request throws a clean 401 instead of the process crashing on load.
let _client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
      throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — auth is unavailable');
    _client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false }, // server-side only
    });
  }
  return _client;
}
