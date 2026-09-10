// lib/supabase.ts — browser client (anon key only; never the service-role key)
import { createBrowserClient } from '@supabase/ssr';
export const supabaseBrowser = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
