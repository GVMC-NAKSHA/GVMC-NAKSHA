'use client';
import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const DEV = !process.env.NEXT_PUBLIC_SUPABASE_URL;
const ROLES = ['admin', 'official', 'analyst', 'citizen'];

export default function LoginPage() {
  if (DEV) return <DevEntry />;
  return <SupabaseLogin />;
}

function DevEntry() {
  function enter(role: string) {
    document.cookie = `dev_role=${role}; path=/; max-age=86400`;
    window.location.href = '/officer';
  }
  return (
    <main className="login">
      <div className="login-card">
        <h1>GVMC · NAKSHA</h1>
        <p className="muted">Dev mode — no auth configured. Pick a role:</p>
        {ROLES.map((r) => (
          <button key={r} onClick={() => enter(r)}>{r}</button>
        ))}
        <p className="muted small">
          Add <code>SUPABASE_*</code> keys and set <code>AUTH_DEV_BYPASS=false</code> for real auth.
        </p>
      </div>
    </main>
  );
}

function SupabaseLogin() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg('Account created. Confirm email if required, then sign in.');
        setMode('signin');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = '/officer';
      }
    } catch (err: any) {
      setMsg(err.message ?? 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form onSubmit={submit} className="login-card">
        <h1>GVMC · NAKSHA</h1>
        <p className="muted">Land-record integration &amp; harmonization</p>
        <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button type="submit" disabled={busy}>{mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="link" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
        </button>
        {msg && <p className="muted">{msg}</p>}
        <p className="muted small">The first user to sign in becomes <b>admin</b>.</p>
      </form>
    </main>
  );
}
