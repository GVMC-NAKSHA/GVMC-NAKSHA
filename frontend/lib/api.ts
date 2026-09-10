import { createBrowserClient } from '@supabase/ssr';

const base = process.env.NEXT_PUBLIC_API_URL!;
const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json',
               ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
               ...init.headers },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? res.statusText);
  return res.json();
}
