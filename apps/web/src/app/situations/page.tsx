'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';

type ApiError = {
  status?: number;
  code?: string;
  message?: string;
  request_id?: string;
};

type Situation = {
  id: number;
  title: string;
  severity: string;
  status: string;
  service_key?: string;
  environment?: string;
  alert_count?: number;
  alerts?: Array<{ alert_key: string; title: string; severity: string; source: string }>;
  evidence?: Array<{ source_type: string; summary: string; payload: string }>;
  recent_change_refs?: Array<{ payload: string }>;
};

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw {
      status: res.status,
      code: data?.error?.code ?? data?.code,
      message: data?.error?.message ?? data?.message,
      request_id: data?.request_id,
    } satisfies ApiError;
  }
  return data as T;
}

export default function SituationsPage() {
  const [rows, setRows] = useState<Situation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await apiFetch<Situation[]>('/api/bff/itsm/situations'));
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="min-h-[calc(100vh-140px)] bg-[radial-gradient(1200px_circle_at_20%_-10%,rgba(56,189,248,0.18),transparent_40%),radial-gradient(900px_circle_at_90%_0%,rgba(168,85,247,0.14),transparent_35%),radial-gradient(800px_circle_at_50%_120%,rgba(34,197,94,0.10),transparent_45%)] px-5 py-5">
      <div className="mx-auto max-w-[1280px]">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold tracking-wide text-slate-400">AIOPS</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-100">Situations</h1>
            <p className="mt-1 text-sm text-slate-400">Correlated alerts grouped by service, environment, topology, and recent change context.</p>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-100">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-red-200">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5" />
              <div>
                <div className="font-semibold">Situations failed to load</div>
                <div className="mt-1 text-sm">{error.message ?? error.code ?? 'Unknown error'}</div>
                <div className="mt-1 text-xs text-red-100/80">request_id: {error.request_id ?? '-'}</div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-4">
          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-300">Loading situations…</div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-300">No situations have been correlated yet.</div>
          ) : (
            rows.map((row) => (
              <div key={row.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-slate-100">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{row.title}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{row.severity}</span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{row.status}</span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{row.service_key || 'unmapped-service'}</span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{row.environment || 'prod'}</span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{row.alert_count ?? 0} alerts</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs font-semibold text-slate-400">Correlated Alerts</div>
                    <div className="mt-2 space-y-2 text-sm">
                      {(row.alerts ?? []).length ? row.alerts!.map((alert) => (
                        <div key={alert.alert_key} className="rounded-lg border border-white/10 bg-black/20 p-2">
                          <div className="font-medium">{alert.title}</div>
                          <div className="mt-1 text-xs text-slate-400">{alert.severity} • {alert.source} • {alert.alert_key}</div>
                        </div>
                      )) : <div className="text-slate-400">Alert details load on detail view.</div>}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs font-semibold text-slate-400">Evidence</div>
                    <div className="mt-2 space-y-2 text-sm">
                      {(row.evidence ?? []).length ? row.evidence!.map((item, index) => (
                        <div key={index} className="rounded-lg border border-white/10 bg-black/20 p-2">
                          <div className="font-medium">{item.summary}</div>
                          <div className="mt-1 text-xs text-slate-400">{item.source_type}</div>
                        </div>
                      )) : <div className="text-slate-400">No evidence recorded yet.</div>}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs font-semibold text-slate-400">Recent Change Context</div>
                    <div className="mt-2 space-y-2 text-sm">
                      {(row.recent_change_refs ?? []).length ? row.recent_change_refs!.map((item, index) => (
                        <div key={index} className="rounded-lg border border-white/10 bg-black/20 p-2">
                          {item.payload}
                        </div>
                      )) : <div className="text-slate-400">No recent change evidence attached.</div>}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
