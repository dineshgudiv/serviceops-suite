'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  RefreshCw,
  ShieldAlert,
  Send,
  Webhook,
  Mail,
  MessageSquare,
  Phone,
  Settings2,
  X,
  Clock,
} from 'lucide-react';

const API = {
  notifications: '/api/bff/integrations/notifications',
  testSend: '/api/bff/integrations/test-notification',
};

type ApiError = {
  status?: number;
  code?: string;
  message?: string;
  request_id?: string;
  raw?: string;
};

type Integration = {
  id: string;
  kind: 'slack' | 'teams' | 'email' | 'webhook' | string;
  name?: string;
  enabled: boolean | null;
  target?: string;
  updatedAt?: string;
};

type DeliveryLog = {
  id: string;
  at: string;
  kind: string;
  target?: string;
  status: 'SENT' | 'FAILED' | 'PENDING' | 'UNKNOWN';
  message?: string;
  request_id?: string;
  error?: string;
};

type Paged<T> = { items: T[]; total: number };

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

function safeJsonParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': init?.body ? 'application/json' : 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();

  if (!res.ok) {
    const asJson = contentType.includes('application/json') ? safeJsonParse(text) : null;
    const err: ApiError = {
      status: res.status,
      code: asJson?.error?.code ?? asJson?.code ?? 'HTTP_ERROR',
      message: asJson?.error?.message ?? asJson?.message ?? `Request failed (${res.status})`,
      request_id: asJson?.request_id ?? asJson?.requestId ?? undefined,
      raw: text,
    };
    throw err;
  }

  if (contentType.includes('application/json')) {
    const asJson = safeJsonParse(text);
    if (asJson === null) throw { status: res.status, code: 'NON_JSON', message: 'Server returned non-JSON response', raw: text } as ApiError;
    return asJson as T;
  }

  throw { status: res.status, code: 'NON_JSON', message: 'Server returned non-JSON response', raw: text } as ApiError;
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-white/10 bg-slate-950/40 shadow-[0_12px_50px_-20px_rgba(0,0,0,.7)] backdrop-blur',
        className
      )}
    >
      {children}
    </div>
  );
}

function Button({
  children,
  onClick,
  variant = 'primary',
  className,
  disabled,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const base =
    'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-sky-400/40 disabled:cursor-not-allowed disabled:opacity-60';
  const v =
    variant === 'primary'
      ? 'bg-sky-500/90 text-white hover:bg-sky-500'
      : variant === 'secondary'
      ? 'bg-white/10 text-slate-100 hover:bg-white/15'
      : variant === 'danger'
      ? 'bg-red-500/80 text-white hover:bg-red-500'
      : 'bg-transparent text-slate-100 hover:bg-white/10';
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={cx(base, v, className)}>
      {children}
    </button>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cx(
        'h-10 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400/30',
        className
      )}
    />
  );
}

function ErrorState({ err, onRetry }: { err: ApiError; onRetry: () => void }) {
  const human =
    err.code === 'BFF_DENY'
      ? 'Access blocked by BFF policy (forbidden backend target). This is a routing/allowlist or RBAC issue.'
      : err.message ?? 'Request failed';

  const rawPreview = (err.raw ?? '').slice(0, 900);

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-red-500/15 p-2 text-red-300">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">Integrations failed</div>
              <div className="mt-1 text-sm text-slate-300">{human}</div>
              <div className="mt-2 text-xs text-slate-400">
                <span className="mr-3">status: {err.status ?? '-'}</span>
                <span className="mr-3">code: {err.code ?? '-'}</span>
                <span>request_id: {err.request_id ?? '-'}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="secondary" onClick={onRetry}>
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  navigator.clipboard.writeText(
                    JSON.stringify({ status: err.status, code: err.code, request_id: err.request_id, raw: err.raw }, null, 2)
                  )
                }
              >
                <Copy className="h-4 w-4" />
                Copy
              </Button>
            </div>
          </div>

          {rawPreview ? (
            <pre className="mt-3 max-h-[220px] overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-slate-200">
              {rawPreview}
            </pre>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function parseDate(s?: string): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}
function fmtDateTime(s?: string) {
  const t = parseDate(s);
  if (!t) return '—';
  return new Date(t).toLocaleString();
}

function StatusPill({ s }: { s: DeliveryLog['status'] }) {
  const cls =
    s === 'SENT'
      ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
      : s === 'FAILED'
      ? 'border-red-400/25 bg-red-500/10 text-red-200'
      : 'border-amber-400/25 bg-amber-500/10 text-amber-200';
  return <span className={cx('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', cls)}>{s}</span>;
}

type Toast = { kind: 'success' | 'error'; title: string; detail?: string };
function ToastView({ toast, onClose }: { toast: Toast | null; onClose: () => void }) {
  if (!toast) return null;
  const cls =
    toast.kind === 'success'
      ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
      : 'border-red-400/25 bg-red-500/10 text-red-200';
  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[380px]">
      <div className={cx('rounded-2xl border p-3 shadow-2xl backdrop-blur', cls)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{toast.title}</div>
            {toast.detail ? <div className="mt-1 text-xs opacity-90">{toast.detail}</div> : null}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function KindIcon({ kind }: { kind: string }) {
  const k = kind.toLowerCase();
  if (k.includes('slack')) return <MessageSquare className="h-4 w-4 text-slate-400" />;
  if (k.includes('teams')) return <Phone className="h-4 w-4 text-slate-400" />;
  if (k.includes('email')) return <Mail className="h-4 w-4 text-slate-400" />;
  return <Webhook className="h-4 w-4 text-slate-400" />;
}

export default function IntegrationsPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<ApiError | null>(null);

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryLog[]>([]);
  const lastFetchAt = useRef<number>(0);

  const [toast, setToast] = useState<Toast | null>(null);

  // test send form
  const [channel, setChannel] = useState<'slack' | 'teams' | 'email' | 'webhook'>('slack');
  const [target, setTarget] = useState('');
  const [message, setMessage] = useState('Test message from Fraud Ops Risk Console');
  const [sending, setSending] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [a, b] = await Promise.allSettled([
        apiFetch<Paged<Integration> | Integration[]>(API.notifications),
        apiFetch<Paged<DeliveryLog> | DeliveryLog[]>(API.notifications),
      ]);

      if (a.status === 'fulfilled') {
        const items = Array.isArray(a.value) ? a.value : a.value.items;
        const norm: Integration[] = items
          .map((x: any) => ({
            id: String(x.id ?? x.integration_id ?? x.key ?? ''),
            kind: (x.kind ?? x.type ?? x.channel ?? 'notification') as any,
            name: x.name ?? x.channel ?? x.kind ?? 'notification',
            enabled: typeof x.enabled === 'boolean' ? x.enabled : null,
            target: x.target ?? x.channel ?? x.email ?? x.webhook ?? '',
            updatedAt: x.updatedAt ?? x.updated_at ?? x.created_at,
          }))
          .filter((i) => i.id);
        setIntegrations(norm);
      } else {
        // not fatal; show empty list
        setIntegrations([]);
      }

      if (b.status === 'fulfilled') {
        const items = Array.isArray(b.value) ? b.value : b.value.items;
        const norm: DeliveryLog[] = items
          .map((x: any) => ({
            id: String(x.id ?? x.delivery_id ?? x.key ?? ''),
            at: String(x.at ?? x.ts ?? x.timestamp ?? x.created_at ?? ''),
            kind: String(x.kind ?? x.type ?? x.channel ?? 'notification'),
            target: x.target ?? x.channel ?? x.email ?? x.webhook ?? '',
            status: (x.status ?? 'UNKNOWN') as any,
            message: x.message ?? '',
            request_id: x.request_id ?? x.requestId ?? '',
            error: x.error ?? '',
          }))
          .filter((d) => d.id);
        setDeliveries(norm);
      } else {
        setDeliveries([]);
      }

      lastFetchAt.current = Date.now();
    } catch (e: any) {
      setErr(e as ApiError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendTest() {
    setSending(true);
    try {
      await apiFetch(API.testSend, {
        method: 'POST',
        body: JSON.stringify({
          channel,
          target: target.trim() || undefined,
          message: message.trim() || 'Test message',
        }),
      });
      setToast({ kind: 'success', title: 'Test sent', detail: `Sent via ${channel}${target ? ` to ${target}` : ''}` });
      await load();
    } catch (e: any) {
      const ae = e as ApiError;
      setToast({
        kind: 'error',
        title: `Send failed (${ae.code ?? 'ERROR'})`,
        detail: `${ae.message ?? 'Request failed'}${ae.request_id ? ` • request_id=${ae.request_id}` : ''}`,
      });
    } finally {
      setSending(false);
    }
  }

  const grouped = useMemo(() => {
    const by = new Map<string, Integration[]>();
    integrations.forEach((i) => {
      const k = String(i.kind ?? 'webhook');
      by.set(k, [...(by.get(k) ?? []), i]);
    });
    return Array.from(by.entries());
  }, [integrations]);

  return (
    <div className="min-h-[calc(100vh-140px)] bg-[radial-gradient(1200px_circle_at_20%_-10%,rgba(56,189,248,0.18),transparent_40%),radial-gradient(900px_circle_at_90%_0%,rgba(168,85,247,0.14),transparent_35%),radial-gradient(800px_circle_at_50%_120%,rgba(34,197,94,0.10),transparent_45%)] px-5 py-5">
      <ToastView toast={toast} onClose={() => setToast(null)} />

      <div className="mx-auto max-w-[1400px]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold tracking-wide text-slate-400">NOTIFICATIONS</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-100">Integrations</h1>
            <p className="mt-1 text-sm text-slate-400">
              Send test notifications and inspect persisted notification history.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-4">
          {err ? (
            <ErrorState err={err} onRetry={load} />
          ) : (
            <div className="grid grid-cols-12 gap-4">
              {/* Integrations cards */}
              <div className="col-span-12 lg:col-span-7 space-y-4">
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-100">Observed notification channels</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {integrations.length} event row(s) • updated{' '}
                        {lastFetchAt.current ? new Date(lastFetchAt.current).toLocaleTimeString() : '—'}
                      </div>
                    </div>
                    <Settings2 className="h-4 w-4 text-slate-400" />
                  </div>

                  <div className="mt-4 grid grid-cols-12 gap-3">
                    {integrations.length === 0 ? (
                      <div className="col-span-12 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                        No notification history returned from <code className="rounded bg-black/30 px-1 py-0.5">{API.notifications}</code>.
                      </div>
                    ) : (
                      grouped.map(([kind, items]) => (
                        <div key={kind} className="col-span-12">
                          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-100">
                            <KindIcon kind={kind} />
                            {kind.toUpperCase()}
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300">
                              {items.length}
                            </span>
                          </div>

                          <div className="grid grid-cols-12 gap-3">
                            {items.slice(0, 6).map((i) => (
                              <Card key={i.id} className="col-span-12 md:col-span-6 p-4">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-slate-100">{i.name || i.kind}</div>
                                    <div className="mt-1 truncate text-xs text-slate-400">{i.target || '—'}</div>
                                    <div className="mt-2 text-xs text-slate-400">Updated: {fmtDateTime(i.updatedAt)}</div>
                                  </div>
                                  <span
                                    className={cx(
                                      'rounded-full border px-2 py-0.5 text-[11px] font-medium',
                                      i.enabled === true
                                        ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
                                        : i.enabled === false
                                        ? 'border-slate-400/30 bg-slate-500/10 text-slate-200'
                                        : 'border-amber-400/25 bg-amber-500/10 text-amber-200'
                                    )}
                                  >
                                    {i.enabled === true ? 'ENABLED' : i.enabled === false ? 'DISABLED' : 'UNKNOWN'}
                                  </span>
                                </div>
                              </Card>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              </div>

              {/* Test send + delivery logs */}
              <div className="col-span-12 lg:col-span-5 space-y-4">
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-100">Send test notification</div>
                      <div className="mt-1 text-xs text-slate-400">
                        Calls <code className="rounded bg-black/30 px-1 py-0.5">{API.testSend}</code>
                      </div>
                    </div>
                    <Send className="h-4 w-4 text-slate-400" />
                  </div>

                  <div className="mt-4 space-y-2">
                    <select
                      value={channel}
                      onChange={(e) => setChannel(e.target.value as any)}
                      className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                    >
                      <option value="slack">slack</option>
                      <option value="teams">teams</option>
                      <option value="email">email</option>
                      <option value="webhook">webhook</option>
                    </select>

                    <Input value={target} onChange={setTarget} placeholder="Target (optional): #channel / email / URL" />

                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="min-h-[88px] w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                      placeholder="Message"
                    />

                    <Button onClick={sendTest} disabled={sending}>
                      {sending ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Sending…
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Send test
                        </>
                      )}
                    </Button>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-100">Notification history</div>
                      <div className="mt-1 text-xs text-slate-400">
                        Uses persisted notification records. Delivery status is shown only when the backend stores it.
                      </div>
                    </div>
                    <Clock className="h-4 w-4 text-slate-400" />
                  </div>

                  <div className="mt-4 space-y-2">
                    {deliveries.length === 0 ? (
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                        No notification history returned.
                      </div>
                    ) : (
                      deliveries.slice(0, 10).map((d) => (
                        <div key={d.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                              <KindIcon kind={d.kind} />
                              {d.kind}
                            </div>
                            <StatusPill s={d.status} />
                          </div>

                          <div className="mt-1 text-xs text-slate-400">{fmtDateTime(d.at)}</div>
                          {d.target ? <div className="mt-1 truncate text-xs text-slate-300">{d.target}</div> : null}
                          {d.message ? <div className="mt-2 text-xs text-slate-300">{d.message}</div> : null}
                          {d.error ? <div className="mt-2 text-xs text-red-200">{d.error}</div> : null}

                          <div className="mt-2 flex items-center justify-between">
                            <div className="text-xs text-slate-400">request_id: {d.request_id || '—'}</div>
                            <Button
                              variant="ghost"
                              onClick={() =>
                                navigator.clipboard.writeText(
                                  JSON.stringify({ ...d }, null, 2)
                                )
                              }
                            >
                              <Copy className="h-4 w-4" />
                              Copy
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
