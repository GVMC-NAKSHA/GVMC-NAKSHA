import { createBrowserClient } from '@supabase/ssr';

const DEV = !process.env.NEXT_PUBLIC_SUPABASE_URL;
const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

const supabase = DEV
  ? null
  : createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

function devRole(): string {
  if (typeof document === 'undefined') return 'admin';
  const m = document.cookie.match(/(?:^|;\s*)dev_role=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : 'admin';
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let authHeaders: Record<string, string> = {};
  if (DEV) {
    authHeaders = { 'x-dev-role': devRole() };
  } else {
    const { data: { session } } = await supabase!.auth.getSession();
    if (session) authHeaders = { Authorization: `Bearer ${session.access_token}` };
  }
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders, ...init.headers },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? res.statusText);
  return res.json();
}
