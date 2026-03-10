'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Eye, EyeOff, RefreshCw } from 'lucide-react';
import { evaluatePasswordPolicy, isPasswordPolicySatisfied, passwordPolicyItems } from '../../lib/auth/password-policy';
import { hasOpaqueToken } from '../../lib/auth/tokens';

export default function ResetPasswordPage() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const rules = useMemo(() => evaluatePasswordPolicy(password), [password]);
  const passwordStrongEnough = isPasswordPolicySatisfied(password);
  const policyItems = useMemo(() => passwordPolicyItems(password), [password]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!hasOpaqueToken(token)) {
      setError('Reset token is missing or invalid.');
      return;
    }
    if (!passwordStrongEnough) {
      setError('Choose a password that satisfies the policy.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/session/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ token, password }),
        cache: 'no-store',
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) {
        const requestId = data?.request_id ? ` (request_id=${data.request_id})` : '';
        setError(`${data?.error?.message ?? 'Password reset failed.'}${requestId}`);
        return;
      }
      setSuccess(data?.message ?? 'Password updated. Redirecting to sign in...');
      setTimeout(() => router.replace('/login'), 1200);
    } catch {
      setError('Password reset failed. Request a fresh link and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-5 py-10 text-slate-100">
      <h1 className="text-2xl font-semibold">Reset password</h1>
      <p className="mt-2 text-sm text-slate-400">Choose a new password for your account.</p>

      <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-slate-950/50 p-5">
        {!hasOpaqueToken(token) ? (
          <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">
            Reset token is missing. Request a new password reset email.
          </div>
        ) : null}

        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-400">
            <span>New password</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200"
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Create a strong password"
            className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3"
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-400">
            <span>Confirm password</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200"
              onClick={() => setShowConfirmPassword((value) => !value)}
            >
              {showConfirmPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showConfirmPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <input
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Confirm your password"
            className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3"
          />
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
          <div className="font-semibold text-slate-200">Password policy</div>
          <div className="mt-2 space-y-1">
            {policyItems.map((item) => (
              <div key={item.label} className={item.ok ? 'text-emerald-300' : 'text-slate-400'}>
                {item.ok ? 'OK' : '-'} {item.label}
              </div>
            ))}
          </div>
        </div>

        {success ? <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">{success}</div> : null}
        {error ? <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}

        <button
          disabled={saving || !hasOpaqueToken(token)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Updating password...
            </>
          ) : (
            'Update password'
          )}
        </button>

        <div className="text-xs text-slate-400">
          Need a new link?{' '}
          <Link href="/forgot-password" className="text-sky-300 hover:text-sky-200">
            Request password reset
          </Link>
        </div>
      </form>
    </div>
  );
}
