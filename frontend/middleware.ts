import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/officer', '/supervisor', '/commissioner', '/admin', '/integration'];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Not configured yet — let requests through so the app still renders (dev convenience).
  if (!url || !anon) return res;

  const supabase = createServerClient(url, anon, {
    cookies: {
      get: (n: string) => req.cookies.get(n)?.value,
      set: (n: string, v: string, o: any) => res.cookies.set({ name: n, value: v, ...o }),
      remove: (n: string, o: any) => res.cookies.set({ name: n, value: '', ...o }),
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && PROTECTED.some((p) => req.nextUrl.pathname.startsWith(p)))
    return NextResponse.redirect(new URL('/login', req.url));
  return res;
}

export const config = {
  matcher: ['/officer/:path*', '/supervisor/:path*', '/commissioner/:path*', '/admin/:path*', '/integration/:path*'],
};
