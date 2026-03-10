'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { hasOpaqueToken } from '../../lib/auth/tokens';

type VerifyState = 'idle' | 'success' | 'error';

export default function VerifyEmailPage() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<VerifyState>('idle');
  const [message, setMessage] = useState('Checking verification token...');

  useEffect(() => {
    if (!hasOpaqueToken(token)) {
      setState('error');
      setMessage('Verification token is missing. Use the link from your email or request a new verification email after signing in.');
      return;
    }

    void (async () => {
      try {
        const res = await fetch(`/api/session/verify-email?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        const text = await res.text();
        const data = text ? JSON.parse(text) : {};
        if (!res.ok) {
          setState('error');
          setMessage(data?.error?.message ?? 'Verification failed. The link may be expired or already used.');
          return;
        }
        setState('success');
        setMessage(data?.message ?? 'Email verified. You can sign in now.');
      } catch {
        setState('error');
        setMessage('Verification failed. Try the link again or request a new verification email.');
      }
    })();
  }, [token]);

  return (
    <div className="mx-auto max-w-md px-5 py-10 text-slate-100">
      <h1 className="text-2xl font-semibold">Verify email</h1>
      <div
        className={`mt-6 rounded-2xl border p-5 ${
          state === 'success'
            ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
            : state === 'error'
            ? 'border-red-400/20 bg-red-500/10 text-red-200'
            : 'border-white/10 bg-slate-950/50 text-slate-200'
        }`}
      >
        {message}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
        <Link href="/login" className="text-sky-300 hover:text-sky-200">
          Back to sign in
        </Link>
        {state === 'error' ? (
          <span>Request a resend from your signed-in account settings or admin.</span>
        ) : null}
      </div>
    </div>
  );
}
