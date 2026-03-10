'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Copy,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  ChevronDown,
  X,
  Network,
  Radar,
  Layers,
} from 'lucide-react';

/**
 * IMPORTANT:
 * Update these endpoints to match your real BFF routes.
 * This page NEVER dumps raw JSON—clean ErrorState with code + request_id + retry + copy.
 */
const API = {
  listCis: '/api/bff/cmdb/cis', // TODO verify
  getCi: (id: string) => `/api/bff/cmdb/cis/${encodeURIComponent(id)}`, // optional
  relations: (id: string) => `/api/bff/cmdb/cis/${encodeURIComponent(id)}/relations`, // optional
  impact: (id: string) => `/api/bff/cmdb/impact?ciId=${encodeURIComponent(id)}`, // optional
  patchCi: (id: string) => `/api/bff/cmdb/cis/${encodeURIComponent(id)}`, // optional PATCH
};

type ApiError = {
  status?: number;
  code?: string;
  message?: string;
  request_id?: string;
  raw?: string;
};

type CiStatus = 'ACTIVE' | 'DEGRADED' | 'MAINTENANCE' | 'RETIRED';
type CiCriticality = 'CRIT' | 'HIGH' | 'MED' | 'LOW';

type CI = {
  id: string;
  name: string;
  type?: string; // e.g., SERVICE, HOST, DB, LB
  owner?: string;
  env?: 'PROD' | 'STAGE' | 'DEV' | string;
  status?: CiStatus;
  criticality?: CiCriticality;
  tags?: string[];
  updatedAt?: string;
  createdAt?: string;
  attributes?: Record<string, any>;
};

type Relation = {
  fromId: string;
  toId: string;
  type: string; // DEPENDS_ON, RUNS_ON, CONNECTS_TO, etc.
  fromName?: string;
  toName?: string;
};

type ImpactResult = {
  ciId: string;
  impactedServices?: Array<{ id: string; name: string }>;
  openIncidents?: Array<{ id: string; title?: string; priority?: string }>;
  openChanges?: Array<{ id: string; title?: string; status?: string }>;
  notes?: string;
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
  variant?: 'primary' | 'secondary' | 'ghost';
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

function Select({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cx(
        'h-10 rounded-xl border border-white/10 bg-slate-950/50 px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400/30',
        className
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-slate-950 text-slate-100">
          {o.label}
        </option>
      ))}
    </select>
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
              <div className="text-sm font-semibold text-slate-100">CMDB failed to load</div>
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

function StatusBadge({ s }: { s?: CiStatus }) {
  const st = s ?? 'ACTIVE';
  const cls =
    st === 'ACTIVE'
      ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
      : st === 'DEGRADED'
      ? 'border-amber-400/25 bg-amber-500/10 text-amber-200'
      : st === 'MAINTENANCE'
      ? 'border-sky-400/25 bg-sky-500/10 text-sky-200'
      : 'border-slate-400/30 bg-slate-500/10 text-slate-200';
  return <span className={cx('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', cls)}>{st}</span>;
}

function CritBadge({ c }: { c?: CiCriticality }) {
  const v = c ?? 'MED';
  const cls =
    v === 'CRIT'
      ? 'border-red-400/40 bg-red-500/10 text-red-200'
      : v === 'HIGH'
      ? 'border-orange-400/40 bg-orange-500/10 text-orange-200'
      : v === 'MED'
      ? 'border-yellow-400/40 bg-yellow-500/10 text-yellow-200'
      : 'border-slate-400/30 bg-slate-500/10 text-slate-200';
  return <span className={cx('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', cls)}>{v}</span>;
}

function Drawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={cx('fixed inset-0 z-50', open ? '' : 'pointer-events-none')}>
      <div className={cx('absolute inset-0 bg-black/50 transition-opacity', open ? 'opacity-100' : 'opacity-0')} onClick={onClose} />
      <div
        className={cx(
          'absolute right-0 top-0 h-full w-full max-w-[720px] border-l border-white/10 bg-slate-950/80 backdrop-blur-xl transition-transform',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-100">{title}</div>
            <div className="mt-1 text-xs text-slate-400">Relationships + impact analysis.</div>
          </div>
          <Button variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="h-[calc(100%-68px)] overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}

function SkeletonLines() {
  return (
    <div className="space-y-2">
      <div className="h-3 w-3/4 animate-pulse rounded bg-white/10" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-white/10" />
    </div>
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

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function MiniGraph({ center, relations }: { center: CI; relations: Relation[] }) {
  // Lightweight relationship visualization (no libs)
  const nodes = useMemo(() => {
    const set = new Map<string, { id: string; name: string }>();
    set.set(center.id, { id: center.id, name: center.name });
    relations.slice(0, 8).forEach((r) => {
      set.set(r.fromId, { id: r.fromId, name: r.fromName ?? r.fromId });
      set.set(r.toId, { id: r.toId, name: r.toName ?? r.toId });
    });
    return Array.from(set.values()).slice(0, 6);
  }, [center, relations]);

  const pos = useMemo(() => {
    const c = { x: 260, y: 85 };
    const ring = [
      { x: 80, y: 40 },
      { x: 440, y: 40 },
      { x: 80, y: 130 },
      { x: 440, y: 130 },
      { x: 260, y: 20 },
    ];
    const m = new Map<string, { x: number; y: number }>();
    m.set(center.id, c);
    let idx = 0;
    for (const n of nodes) {
      if (n.id === center.id) continue;
      m.set(n.id, ring[idx % ring.length]);
      idx++;
    }
    return m;
  }, [center.id, nodes]);

  const edges = relations
    .filter((r) => pos.has(r.fromId) && pos.has(r.toId))
    .slice(0, 8);

  return (
    <svg viewBox="0 0 520 170" className="w-full">
      <defs>
        <linearGradient id="edge" x1="0" x2="1">
          <stop offset="0" stopColor="rgba(56,189,248,0.40)" />
          <stop offset="1" stopColor="rgba(168,85,247,0.25)" />
        </linearGradient>
      </defs>

      {edges.map((e, i) => {
        const a = pos.get(e.fromId)!;
        const b = pos.get(e.toId)!;
        return (
          <g key={i}>
            <path d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} stroke="url(#edge)" strokeWidth="3" opacity="0.9" />
            <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle" fontSize="10" fill="rgba(226,232,240,0.65)">
              {e.type}
            </text>
          </g>
        );
      })}

      {nodes.map((n) => {
        const p = pos.get(n.id)!;
        const isCenter = n.id === center.id;
        return (
          <g key={n.id}>
            <rect
              x={p.x - (isCenter ? 86 : 78)}
              y={p.y - 18}
              width={isCenter ? 172 : 156}
              height={36}
              rx={12}
              fill={isCenter ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.06)'}
              stroke={isCenter ? 'rgba(56,189,248,0.35)' : 'rgba(255,255,255,0.12)'}
            />
            <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize="12" fill="rgba(226,232,240,0.92)">
              {n.name.length > 22 ? `${n.name.slice(0, 22)}…` : n.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function CmdbPage() {
  const router = useRouter();
  const sp = useSearchParams();

  // URL-backed filters
  const [q, setQ] = useState(() => sp.get('q') ?? '');
  const [type, setType] = useState(() => sp.get('type') ?? 'ALL');
  const [env, setEnv] = useState(() => sp.get('env') ?? 'ALL');
  const [status, setStatus] = useState(() => sp.get('status') ?? 'ALL');
  const [page, setPage] = useState(() => Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1));
  const [pageSize, setPageSize] = useState(() => Math.max(10, parseInt(sp.get('ps') ?? '20', 10) || 20));

  const colsAll = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type' },
    { key: 'owner', label: 'Owner' },
    { key: 'env', label: 'Env' },
    { key: 'status', label: 'Status' },
    { key: 'crit', label: 'Criticality' },
    { key: 'updated', label: 'Updated' },
  ] as const;

  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(colsAll.map((c) => [c.key, true]))
  );
  const [colsOpen, setColsOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<ApiError | null>(null);
  const [cis, setCis] = useState<CI[]>([]);
  const lastFetchAt = useRef<number>(0);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<CI | null>(null);

  // drawer data
  const [relLoading, setRelLoading] = useState(false);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impact, setImpact] = useState<ImpactResult | null>(null);

  // URL sync
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (q.trim()) p.set('q', q.trim());
      if (type !== 'ALL') p.set('type', type);
      if (env !== 'ALL') p.set('env', env);
      if (status !== 'ALL') p.set('status', status);
      if (page !== 1) p.set('page', String(page));
      if (pageSize !== 20) p.set('ps', String(pageSize));
      const qs = p.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    }, 200);
    return () => clearTimeout(t);
  }, [q, type, env, status, page, pageSize, router]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiFetch<Paged<CI> | CI[]>(API.listCis);
      const items = Array.isArray(res) ? res : res.items;

      const norm: CI[] = items
        .map((x: any) => ({
          id: String(x.id ?? x.ci_id ?? x.key ?? ''),
          name: String(x.name ?? x.displayName ?? x.title ?? 'Unnamed CI'),
          type: x.type ?? x.ciType ?? x.kind ?? 'UNKNOWN',
          owner: x.owner ?? x.team ?? x.assignee ?? '',
          env: x.env ?? x.environment ?? '',
          status: (x.status ?? 'ACTIVE') as any,
          criticality: (x.criticality ?? x.crit ?? 'MED') as any,
          tags: Array.isArray(x.tags) ? x.tags : [],
          updatedAt: x.updatedAt ?? x.updated_at,
          createdAt: x.createdAt ?? x.created_at,
          attributes: typeof x.attributes === 'object' && x.attributes ? x.attributes : undefined,
        }))
        .filter((x) => x.id);

      setCis(norm);
      lastFetchAt.current = Date.now();

      if (selected) {
        const fresh = norm.find((n) => n.id === selected.id);
        setSelected(fresh ?? null);
      }
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

  const distinctTypes = useMemo(() => {
    const s = new Set<string>();
    cis.forEach((c) => s.add(String(c.type ?? 'UNKNOWN')));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [cis]);

  const distinctEnvs = useMemo(() => {
    const s = new Set<string>();
    cis.forEach((c) => s.add(String(c.env ?? '')));
    const arr = Array.from(s).filter(Boolean).sort((a, b) => a.localeCompare(b));
    return arr;
  }, [cis]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return cis.filter((c) => {
      if (type !== 'ALL' && String(c.type ?? 'UNKNOWN') !== type) return false;
      if (env !== 'ALL' && String(c.env ?? '') !== env) return false;
      if (status !== 'ALL' && String(c.status ?? 'ACTIVE') !== status) return false;
      if (!qq) return true;
      const hay = `${c.id} ${c.name} ${c.type ?? ''} ${c.owner ?? ''} ${(c.tags ?? []).join(' ')}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [cis, q, type, env, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = useMemo(() => {
    const p = clamp(page, 1, totalPages);
    const start = (p - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize, totalPages]);

  async function openCi(ci: CI) {
    setSelected(ci);
    setDrawerOpen(true);

    // Reset drawer data
    setRelations([]);
    setImpact(null);

    // Load relations best-effort
    setRelLoading(true);
    try {
      const relRes = await apiFetch<{ items: Relation[] } | Relation[]>(API.relations(ci.id));
      const items = Array.isArray(relRes) ? relRes : relRes.items;
      const norm = items.map((r: any) => ({
        fromId: String(r.fromId ?? r.from_id ?? r.from ?? ''),
        toId: String(r.toId ?? r.to_id ?? r.to ?? ''),
        type: String(r.type ?? r.relation ?? 'DEPENDS_ON'),
        fromName: r.fromName ?? r.from_name,
        toName: r.toName ?? r.to_name,
      })).filter((r: Relation) => r.fromId && r.toId);
      setRelations(norm);
    } catch {
      // keep empty; UI will show note
    } finally {
      setRelLoading(false);
    }
  }

  async function runImpact(ciId: string) {
    setImpactLoading(true);
    setImpact(null);
    try {
      const res = await apiFetch<ImpactResult>(API.impact(ciId));
      setImpact(res);
    } catch (e: any) {
      // show impact failure inline as “notes”
      const ae = e as ApiError;
      setImpact({
        ciId,
        notes: `Impact query failed: ${ae.code ?? 'ERROR'} ${ae.message ?? ''}${ae.request_id ? ` (request_id=${ae.request_id})` : ''}`,
      });
    } finally {
      setImpactLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-140px)] bg-[radial-gradient(1200px_circle_at_20%_-10%,rgba(56,189,248,0.18),transparent_40%),radial-gradient(900px_circle_at_90%_0%,rgba(168,85,247,0.14),transparent_35%),radial-gradient(800px_circle_at_50%_120%,rgba(34,197,94,0.10),transparent_45%)] px-5 py-5">
      <div className="mx-auto max-w-[1400px]">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold tracking-wide text-slate-400">CONFIGURATION</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-100">CMDB</h1>
            <p className="mt-1 text-sm text-slate-400">
              Inventory CIs, model dependencies, and run impact analysis before changes.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <Card className="mt-4 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-[440px]">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <Input value={q} onChange={setQ} placeholder="Search id/name/type/owner/tags…" className="pl-9" />
            </div>

            <Select
              value={type}
              onChange={(v) => {
                setType(v);
                setPage(1);
              }}
              options={[{ value: 'ALL', label: 'All types' }, ...distinctTypes.map((t) => ({ value: t, label: t }))]}
              className="min-w-[190px]"
            />

            <Select
              value={env}
              onChange={(v) => {
                setEnv(v);
                setPage(1);
              }}
              options={[{ value: 'ALL', label: 'All envs' }, ...distinctEnvs.map((e) => ({ value: e, label: e }))]}
              className="min-w-[150px]"
            />

            <Select
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              options={[
                { value: 'ALL', label: 'All statuses' },
                { value: 'ACTIVE', label: 'ACTIVE' },
                { value: 'DEGRADED', label: 'DEGRADED' },
                { value: 'MAINTENANCE', label: 'MAINTENANCE' },
                { value: 'RETIRED', label: 'RETIRED' },
              ]}
              className="min-w-[170px]"
            />

            <div className="ml-auto flex items-center gap-2">
              <div className="text-xs text-slate-400">
                Results: <span className="text-slate-200">{filtered.length}</span> • updated{' '}
                <span className="text-slate-200">{lastFetchAt.current ? new Date(lastFetchAt.current).toLocaleTimeString() : '—'}</span>
              </div>

              <div className="relative">
                <Button variant="secondary" onClick={() => setColsOpen((s) => !s)}>
                  <SlidersHorizontal className="h-4 w-4" />
                  Columns
                  <ChevronDown className="h-4 w-4 opacity-80" />
                </Button>
                {colsOpen ? (
                  <div className="absolute right-0 mt-2 w-[240px] rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur">
                    {colsAll.map((c) => (
                      <label
                        key={c.key}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm text-slate-200 hover:bg-white/5"
                      >
                        <span>{c.label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(visibleCols[c.key])}
                          onChange={(e) => setVisibleCols((prev) => ({ ...prev, [c.key]: e.target.checked }))}
                        />
                      </label>
                    ))}
                    <div className="px-2 pt-2">
                      <Button variant="ghost" onClick={() => setColsOpen(false)} className="w-full justify-center">
                        Close
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </Card>

        {/* Body */}
        <div className="mt-4">
          {err ? (
            <ErrorState err={err} onRetry={load} />
          ) : (
            <Card className="overflow-hidden">
              <div className="grid grid-cols-12 gap-3 border-b border-white/10 bg-white/5 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {visibleCols.id ? <div className="col-span-2">ID</div> : null}
                {visibleCols.name ? <div className="col-span-4">Name</div> : null}
                {visibleCols.type ? <div className="col-span-1">Type</div> : null}
                {visibleCols.owner ? <div className="col-span-2">Owner</div> : null}
                {visibleCols.env ? <div className="col-span-1">Env</div> : null}
                {visibleCols.status ? <div className="col-span-1">Status</div> : null}
                {visibleCols.crit ? <div className="col-span-1">Crit</div> : null}
                {visibleCols.updated ? <div className="col-span-2">Updated</div> : null}
                <div className="col-span-1 text-right">Open</div>
              </div>

              <div className="px-4">
                {loading ? (
                  <div className="p-4">
                    <SkeletonLines />
                  </div>
                ) : paged.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="text-sm font-semibold text-slate-200">No CIs found</div>
                    <div className="mt-1 text-sm text-slate-400">Try changing filters or search terms.</div>
                  </div>
                ) : (
                  paged.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => openCi(c)}
                      className="grid w-full grid-cols-12 items-center gap-3 border-b border-white/5 py-3 text-left text-sm text-slate-200 hover:bg-white/5"
                    >
                      {visibleCols.id ? <div className="col-span-2 text-xs text-slate-300">{c.id}</div> : null}
                      {visibleCols.name ? (
                        <div className="col-span-4">
                          <div className="line-clamp-1 font-semibold text-slate-100">{c.name}</div>
                          <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-slate-400">
                            {(c.tags ?? []).slice(0, 3).map((t) => (
                              <span key={t} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {visibleCols.type ? <div className="col-span-1 text-xs text-slate-300">{c.type ?? '—'}</div> : null}
                      {visibleCols.owner ? <div className="col-span-2 text-xs text-slate-300">{c.owner ?? '—'}</div> : null}
                      {visibleCols.env ? <div className="col-span-1 text-xs text-slate-300">{c.env ?? '—'}</div> : null}
                      {visibleCols.status ? (
                        <div className="col-span-1">
                          <StatusBadge s={c.status} />
                        </div>
                      ) : null}
                      {visibleCols.crit ? (
                        <div className="col-span-1">
                          <CritBadge c={c.criticality} />
                        </div>
                      ) : null}
                      {visibleCols.updated ? <div className="col-span-2 text-xs text-slate-400">{fmtDateTime(c.updatedAt ?? c.createdAt)}</div> : null}
                      <div className="col-span-1 text-right text-xs text-slate-400">
                        <ExternalLink className="inline h-4 w-4" />
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs text-slate-400">
                  Page <span className="text-slate-200">{clamp(page, 1, totalPages)}</span> / <span className="text-slate-200">{totalPages}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={String(pageSize)}
                    onChange={(v) => {
                      setPageSize(Number(v));
                      setPage(1);
                    }}
                    options={[
                      { value: '20', label: '20 / page' },
                      { value: '50', label: '50 / page' },
                      { value: '100', label: '100 / page' },
                    ]}
                  />
                  <Button variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                    Prev
                  </Button>
                  <Button variant="secondary" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                    Next
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Drawer */}
        <Drawer
          open={drawerOpen}
          title={selected ? `CI ${selected.name} (${selected.id})` : 'CI'}
          onClose={() => setDrawerOpen(false)}
        >
          {!selected ? null : (
            <div className="space-y-4">
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold text-slate-100">{selected.name}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300">
                        Type: {selected.type ?? '—'}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300">
                        Owner: {selected.owner ?? '—'}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300">
                        Env: {selected.env ?? '—'}
                      </span>
                      <StatusBadge s={selected.status} />
                      <CritBadge c={selected.criticality} />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs font-semibold text-slate-400">Created</div>
                        <div className="mt-1 text-slate-100">{fmtDateTime(selected.createdAt)}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs font-semibold text-slate-400">Updated</div>
                        <div className="mt-1 text-slate-100">{fmtDateTime(selected.updatedAt)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="ghost" onClick={() => navigator.clipboard.writeText(selected.id)}>
                      <Copy className="h-4 w-4" />
                      Copy ID
                    </Button>
                    <Button variant="secondary" onClick={() => runImpact(selected.id)} disabled={impactLoading}>
                      <Radar className={cx('h-4 w-4', impactLoading && 'animate-spin')} />
                      Run impact
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Relations */}
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-100">Relationships</div>
                  <Network className="h-4 w-4 text-slate-400" />
                </div>

                <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                  {relLoading ? (
                    <SkeletonLines />
                  ) : relations.length ? (
                    <MiniGraph center={selected} relations={relations} />
                  ) : (
                    <div className="text-sm text-slate-400">
                      No relationships were returned for this CI.
                    </div>
                  )}
                </div>

                {relations.length ? (
                  <div className="mt-3 space-y-2">
                    {relations.slice(0, 10).map((r, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        <div className="text-sm text-slate-200">
                          <span className="font-semibold">{r.fromName ?? r.fromId}</span> —{' '}
                          <span className="rounded bg-black/30 px-1.5 py-0.5 text-xs">{r.type}</span> →{' '}
                          <span className="font-semibold">{r.toName ?? r.toId}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Card>

              {/* Impact */}
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-100">Impact Analysis</div>
                  <Layers className="h-4 w-4 text-slate-400" />
                </div>

                <div className="mt-3">
                  {impactLoading ? (
                    <SkeletonLines />
                  ) : !impact ? (
                    <div className="text-sm text-slate-400">
                      Click <span className="text-slate-200">Run impact</span> to fetch impacted services + open incidents/changes.
                    </div>
                  ) : impact.notes ? (
                    <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-200">
                      {impact.notes}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs font-semibold text-slate-400">Impacted services</div>
                        {(impact.impactedServices ?? []).length ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {impact.impactedServices!.slice(0, 20).map((s) => (
                              <span key={s.id} className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-xs text-slate-200">
                                {s.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 text-sm text-slate-400">None reported.</div>
                        )}
                      </div>

                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs font-semibold text-slate-400">Open incidents</div>
                        {(impact.openIncidents ?? []).length ? (
                          <div className="mt-2 space-y-2">
                            {impact.openIncidents!.slice(0, 10).map((i) => (
                              <div key={i.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-100">#{i.id}</div>
                                  <div className="mt-0.5 truncate text-xs text-slate-400">{i.title ?? '—'}</div>
                                </div>
                                <Button variant="ghost" onClick={() => router.push(`/incidents?q=${encodeURIComponent(i.id)}`)}>
                                  <ExternalLink className="h-4 w-4" />
                                  Open
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 text-sm text-slate-400">None reported.</div>
                        )}
                      </div>

                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs font-semibold text-slate-400">Open changes</div>
                        {(impact.openChanges ?? []).length ? (
                          <div className="mt-2 space-y-2">
                            {impact.openChanges!.slice(0, 10).map((c) => (
                              <div key={c.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-100">#{c.id}</div>
                                  <div className="mt-0.5 truncate text-xs text-slate-400">{c.title ?? '—'}</div>
                                </div>
                                <Button variant="ghost" onClick={() => router.push(`/changes?q=${encodeURIComponent(c.id)}`)}>
                                  <ExternalLink className="h-4 w-4" />
                                  Open
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 text-sm text-slate-400">None reported.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-3 text-xs text-slate-400">
                  Endpoint expected: <code className="rounded bg-black/30 px-1 py-0.5">{API.impact(selected.id)}</code>
                </div>
              </Card>
            </div>
          )}
        </Drawer>
      </div>
    </div>
  );
}

