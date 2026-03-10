'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { RefreshCw } from 'lucide-react';

type ForgotPasswordResponse = {
  dev_link?: string;
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setPreview(null);
    setPreviewVisible(false);
    setSubmitting(true);

    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      setError('Enter your work email address.');
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/session/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ email: normalized }),
        cache: 'no-store',
      });
      const text = await res.text();
      const data = text ? (JSON.parse(text) as ForgotPasswordResponse & { error?: { message?: string } }) : {};

      if (!res.ok) {
        const requestId = (data as any)?.request_id ? ` (request_id=${(data as any).request_id})` : '';
        setError(`${data?.error?.message ?? 'Password reset request failed.'}${requestId}`);
        return;
      }

      setMessage('If an account exists for that email, reset instructions have been sent.');
      if (data.dev_link) {
        setPreview(data.dev_link);
      }
    } catch {
      setError('Password reset request failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-5 py-10 text-slate-100">
      <h1 className="text-2xl font-semibold">Forgot password</h1>
      <p className="mt-2 text-sm text-slate-400">Enter your work email and we will send a reset link if the account exists.</p>

      <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-slate-950/50 p-5">
        <div>
          <div className="mb-1 text-xs font-semibold text-slate-400">Email</div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            placeholder="user@company.com"
            className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3"
          />
        </div>

        {message ? <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</div> : null}
        {preview ? (
          <div className="rounded-xl border border-sky-400/20 bg-sky-500/10 p-3 text-xs text-sky-200">
            <div className="flex items-center justify-between gap-3">
              <span>Dev mode mail delivery is enabled for password reset.</span>
              <button
                type="button"
                className="inline-flex rounded-lg border border-sky-300/20 bg-sky-300/10 px-2 py-1 text-[11px] font-medium text-sky-100 hover:bg-sky-300/15"
                onClick={() => setPreviewVisible((value) => !value)}
              >
                {previewVisible ? 'Hide link' : 'Show dev link'}
              </button>
            </div>
            {previewVisible ? <div className="mt-2 break-all">{preview}</div> : null}
          </div>
        ) : null}
        {error ? <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}

        <button
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {submitting ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Sending reset link...
            </>
          ) : (
            'Send reset link'
          )}
        </button>

        <div className="text-xs text-slate-400">
          Remembered your password?{' '}
          <Link href="/login" className="text-sky-300 hover:text-sky-200">
            Back to sign in
          </Link>
        </div>
      </form>
    </div>
  );
}
