import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// Dev mode: no Supabase configured -> the backend runs with AUTH_DEV_BYPASS and we just send a
// role header. Otherwise forward the caller's Supabase JWT from the request cookies (every
// non-public API route requires it).
const DEV = !process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function serverApi<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const cookieStore = cookies();
  let authHeaders: Record<string, string> = {};

  if (DEV) {
    authHeaders = { 'x-dev-role': cookieStore.get('dev_role')?.value || 'admin' };
  } else {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n: string) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
    );
    const { data: { session } } = await supabase.auth.getSession();
    if (session) authHeaders = { Authorization: `Bearer ${session.access_token}` };
  }

  const base = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders, ...init.headers },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}
