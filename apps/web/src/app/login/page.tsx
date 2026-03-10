'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, LockKeyhole, ShieldAlert } from 'lucide-react';
import { Card, Button } from '../../components/fraud/FraudUi';

const API = {
  me: '/api/session/me',
  login: '/api/session/login',
};

type ApiError = {
  status?: number;
  code?: string;
  message?: string;
  request_id?: string;
};

type Me = {
  user?: { email?: string };
};

function safeJsonParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    });
  } catch {
    throw { status: 503, code: 'AUTH_UPSTREAM_UNREACHABLE', message: 'Authentication service is unavailable.', request_id: 'web' } as ApiError;
  }
  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();
  const data = contentType.includes('application/json') ? safeJsonParse(text) : null;
  if (!res.ok) {
    throw {
      status: res.status,
      code: data?.error?.code ?? data?.code ?? 'HTTP_ERROR',
      message: data?.error?.message ?? data?.message ?? 'Request failed',
      request_id: data?.request_id ?? data?.requestId ?? res.headers.get('x-request-id') ?? undefined,
    } as ApiError;
  }
  if (!contentType.includes('application/json') || data === null) throw { status: res.status, code: 'NON_JSON', message: 'Server returned a non-JSON response.' } as ApiError;
  return data as T;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const authUnavailable = error?.code === 'AUTH_UPSTREAM_UNREACHABLE';

  useEffect(() => {
    let mounted = true;
    async function loadMe() {
      try {
        const me = await apiFetch<Me>(API.me);
        if (mounted && me?.user?.email) router.replace(next ?? '/dashboard');
      } catch {
      } finally {
        if (mounted) setChecking(false);
      }
    }
    void loadMe();
    return () => {
      mounted = false;
    };
  }, [next, router]);

  async function login() {
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError({ code: 'VALIDATION', message: 'Enter your work email address.' });
      return;
    }
    if (!password) {
      setError({ code: 'VALIDATION', message: 'Enter your password.' });
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch(API.login, { method: 'POST', body: JSON.stringify({ email: normalizedEmail, password }) });
      router.replace(next ?? '/dashboard');
      router.refresh();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_18%_-10%,rgba(14,165,233,0.20),transparent_42%),radial-gradient(1000px_circle_at_86%_0%,rgba(250,204,21,0.15),transparent_36%),linear-gradient(180deg,#07101c,#06111d)] px-5 py-10">
      <div className="mx-auto grid max-w-[1120px] grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-6">
          <div className="text-[13px] font-semibold tracking-wide text-slate-400">FRAUD OPS RISK CONSOLE</div>
          <h1 className="mt-1 text-3xl font-semibold text-slate-100">Sign in</h1>
          <p className="mt-2 text-sm text-slate-400">Access fraud analytics, anomaly investigation, case generation, and report download from one investigator workspace.</p>
          <div className="mt-6 grid grid-cols-12 gap-3">
            {[
              ['Data-driven detection', 'Upload transaction datasets and run anomaly detection without fabricated fraud results.'],
              ['Direct reporting', 'Run detection and download the full fraud report as soon as analysis completes.'],
              ['Case generation', 'Create investigation cases directly from suspicious rows and risk signals.'],
              ['Action audit', 'Track dataset uploads, analysis runs, and investigator changes with audit visibility.'],
            ].map(([title, detail]) => (
              <Card key={title} className="col-span-12 md:col-span-6">
                <div className="text-sm font-semibold text-slate-100">{title}</div>
                <div className="mt-1 text-xs text-slate-400">{detail}</div>
              </Card>
            ))}
          </div>
        </div>
        <div className="col-span-12 lg:col-span-6">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-100">Investigator login</div>
                <div className="mt-1 text-xs text-slate-400">
                  {authUnavailable ? 'Gateway authentication is unavailable. You can still open the local fraud workspace.' : 'Successful sign-in redirects to the fraud dashboard.'}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-2"><LockKeyhole className="h-5 w-5 text-slate-200" /></div>
            </div>
            {checking ? <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">Checking your session...</div> : null}
            {error ? (
              <div className={`mt-4 rounded-2xl border p-3 ${authUnavailable ? 'border-amber-400/20 bg-amber-500/10 text-amber-100' : 'border-red-400/20 bg-red-500/10 text-red-100'}`}>
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4" />
                  <div>
                    <div className="text-sm font-semibold">{authUnavailable ? 'Authentication stack unavailable' : 'Sign-in failed'}</div>
                    <div className="mt-1 text-sm">
                      {authUnavailable ? 'The local gateway/auth service is not running. You can continue into the current fraud workspace without sign-in.' : error.message}
                    </div>
                    <div className="mt-1 text-xs opacity-80">code: {error.code ?? '-'} | request_id: {error.request_id ?? '-'}</div>
                  </div>
                </div>
              </div>
            ) : null}
            <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void login(); }}>
              <div>
                <div className="mb-1 text-xs font-semibold text-slate-400">Email</div>
                <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="analyst@company.com" type="email" autoComplete="email" className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400/30" />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-400">
                  <span>Password</span>
                  <button type="button" className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200" onClick={() => setShowPassword((value) => !value)}>
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400/30" />
              </div>
              <Button type="submit" disabled={checking || submitting} className="w-full justify-center">{submitting ? 'Signing in...' : 'Sign in'}</Button>
            </form>
            {authUnavailable ? (
              <div className="mt-3">
                <Button variant="secondary" className="w-full justify-center" onClick={() => router.replace(next ?? '/dashboard')}>
                  Continue to local workspace
                </Button>
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
