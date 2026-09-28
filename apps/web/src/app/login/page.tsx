'use client';

import { Loader2, Lock } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@iris/ui';
import { Logo } from '@/components/shell/Logo';

function Form() {
  const params = useSearchParams();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j.error ?? 'Sign-in failed.');
        setBusy(false);
        return;
      }
      const next = params.get('next');
      window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
      <div>
        <label htmlFor="u" className="text-sm font-medium text-slate-700">Username</label>
        <input id="u" autoComplete="username" required value={username} onChange={(e) => setU(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />
      </div>
      <div>
        <label htmlFor="p" className="text-sm font-medium text-slate-700">Password</label>
        <input id="p" type="password" autoComplete="current-password" required value={password} onChange={(e) => setP(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={busy || !username || !password}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />} Sign in
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-950 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-pop">
        <Logo />
        <p className="mt-3 text-[11px] text-slate-500">Smart Hazard Intelligence &amp; Environmental Local Detection</p>
        <h1 className="mt-3 text-lg font-semibold text-navy-900">Operations sign-in</h1>
        <p className="text-sm text-slate-500">Demo build. Accounts and secrets are configured by the deployer via environment variables (see README).</p>
        <Suspense><Form /></Suspense>
        <Link href="/" className="mt-4 block text-center text-xs text-slate-500 hover:underline">← Back to overview</Link>
      </div>
    </div>
  );
}
