'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Download,
  X,
  ShieldAlert,
  ChevronDown,
  ExternalLink,
  Copy,
  Pencil,
  Trash2,
  ClipboardList,
} from 'lucide-react';

/**
 * ✅ IMPORTANT: Adjust these endpoints to your repo’s real BFF routes.
 * Right now your UI is getting {"code":"BFF_DENY","message":"Forbidden target"}.
 * This page will show that professionally instead of dumping JSON.
 */
const API = {
  listServices: '/api/bff/itsm/catalog',
  listRequests: '/api/bff/itsm/service-requests',
  assignRequest: (id: string) => `/api/bff/itsm/service-requests/${encodeURIComponent(id)}/assign`,
  approveRequest: (id: string) => `/api/bff/itsm/service-requests/${encodeURIComponent(id)}/approve`,
  rejectRequest: (id: string) => `/api/bff/itsm/service-requests/${encodeURIComponent(id)}/reject`,
  fulfillRequest: (id: string) => `/api/bff/itsm/service-requests/${encodeURIComponent(id)}/fulfill`,
  closeRequest: (id: string) => `/api/bff/itsm/service-requests/${encodeURIComponent(id)}/close`,
  commentRequest: (id: string) => `/api/bff/itsm/service-requests/${encodeURIComponent(id)}/comments`,
  createService: '/api/bff/itsm/catalog',
  updateService: (id: string) => `/api/bff/itsm/catalog/${encodeURIComponent(id)}`,
  deleteService: (id: string) => `/api/bff/itsm/catalog/${encodeURIComponent(id)}`,
  getService: (id: string) => `/api/bff/itsm/catalog/${encodeURIComponent(id)}`,
};

type ApiError = {
  status?: number;
  code?: string;
  message?: string;
  request_id?: string;
  raw?: string;
};

type ServiceTier = 'TIER_0' | 'TIER_1' | 'TIER_2' | 'TIER_3';

type ServiceItem = {
  id: string;
  name: string;
  owner?: string;
  tier: ServiceTier;
  onCall?: string;
  sloPct?: number; // 0..100
  createdAt?: string;
  updatedAt?: string;
  dependenciesCount?: number;
  status?: 'ACTIVE' | 'DEPRECATED';
  tags?: string[];
  description?: string;
};

type ServiceRequestItem = {
  id: string;
  service_key: string;
  short_description: string;
  justification: string;
  requester?: string;
  approval_target?: string;
  status: string;
  assigned_to?: string | null;
  resolution_summary?: string | null;
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
    if (asJson === null) {
      const err: ApiError = {
        status: res.status,
        code: 'NON_JSON',
        message: 'Server returned non-JSON response',
        raw: text,
      };
      throw err;
    }
    return asJson as T;
  }

  // If your backend returns non-json on success, force-fail to keep UI predictable
  const err: ApiError = {
    status: res.status,
    code: 'NON_JSON',
    message: 'Server returned non-JSON response',
    raw: text,
  };
  throw err;
}

function toCsv(rows: ServiceItem[], columns: Array<keyof ServiceItem>) {
  const esc = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.map((c) => esc(c)).join(',');
  const body = rows.map((r) => columns.map((c) => esc((r as any)[c])).join(',')).join('\n');
  return `${header}\n${body}\n`;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function TierBadge({ tier }: { tier: ServiceTier }) {
  const map: Record<ServiceTier, string> = {
    TIER_0: 'border-red-400/40 bg-red-500/10 text-red-200',
    TIER_1: 'border-orange-400/40 bg-orange-500/10 text-orange-200',
    TIER_2: 'border-yellow-400/40 bg-yellow-500/10 text-yellow-200',
    TIER_3: 'border-slate-400/30 bg-slate-500/10 text-slate-200',
  };
  return (
    <span className={cx('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', map[tier])}>
      {tier.replace('_', ' ')}
    </span>
  );
}

function StatusBadge({ status }: { status?: ServiceItem['status'] }) {
  const s = status ?? 'ACTIVE';
  const cls =
    s === 'ACTIVE'
      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
      : 'border-slate-400/30 bg-slate-500/10 text-slate-200';
  return (
    <span className={cx('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', cls)}>
      {s}
    </span>
  );
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
  const details = { status: err.status, code: err.code, request_id: err.request_id };
  const rawPreview = (err.raw ?? '').slice(0, 800);

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-red-500/15 p-2 text-red-300">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">Catalog failed to load</div>
              <div className="mt-1 text-sm text-slate-300">{human}</div>
              <div className="mt-2 text-xs text-slate-400">
                <span className="mr-3">status: {details.status ?? '-'}</span>
                <span className="mr-3">code: {details.code ?? '-'}</span>
                <span>request_id: {details.request_id ?? '-'}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="secondary" onClick={onRetry}>
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigator.clipboard.writeText(JSON.stringify({ ...details, raw: err.raw }, null, 2))}
              >
                <Copy className="h-4 w-4" />
                Copy details
              </Button>
            </div>
          </div>

          {rawPreview ? (
            <pre className="mt-3 max-h-[220px] overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-slate-200">
              {rawPreview}
            </pre>
          ) : null}

          {err.code === 'BFF_DENY' ? (
            <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-200">
              Fix path: check your Next.js BFF route allowlist/target mapping. The UI is calling{' '}
              <code className="rounded bg-black/30 px-1 py-0.5">{API.listServices}</code> but BFF is denying the backend
              target.
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
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
      <div
        className={cx('absolute inset-0 bg-black/50 transition-opacity', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      <div
        className={cx(
          'absolute right-0 top-0 h-full w-full max-w-[560px] border-l border-white/10 bg-slate-950/80 backdrop-blur-xl transition-transform',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div className="text-sm font-semibold text-slate-100">{title}</div>
          <Button variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="h-[calc(100%-60px)] overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}

function Modal({
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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-[640px] rounded-2xl border border-white/10 bg-slate-950/90 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div className="text-sm font-semibold text-slate-100">{title}</div>
          <Button variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="grid grid-cols-12 gap-3 border-b border-white/5 py-3">
      <div className="col-span-4 h-3 animate-pulse rounded bg-white/10" />
      <div className="col-span-2 h-3 animate-pulse rounded bg-white/10" />
      <div className="col-span-2 h-3 animate-pulse rounded bg-white/10" />
      <div className="col-span-2 h-3 animate-pulse rounded bg-white/10" />
      <div className="col-span-2 h-3 animate-pulse rounded bg-white/10" />
    </div>
  );
}

export default function CatalogPage() {
  const sp = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<ApiError | null>(null);
  const [data, setData] = useState<ServiceItem[]>([]);
  const [requests, setRequests] = useState<ServiceRequestItem[]>([]);
  const [requestActionBusy, setRequestActionBusy] = useState<string | null>(null);

  // UI state
  const [q, setQ] = useState('');
  const [tier, setTier] = useState<string>('ALL');
  const [status, setStatus] = useState<string>('ALL');
  const [sort, setSort] = useState<'name' | 'tier' | 'slo' | 'deps' | 'updatedAt'>('updatedAt');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // columns
  const allCols: Array<{ key: keyof ServiceItem; label: string }> = [
    { key: 'name', label: 'Service' },
    { key: 'tier', label: 'Tier' },
    { key: 'owner', label: 'Owner' },
    { key: 'onCall', label: 'On-Call' },
    { key: 'sloPct', label: 'SLO%' },
    { key: 'dependenciesCount', label: 'Deps' },
    { key: 'status', label: 'Status' },
    { key: 'updatedAt', label: 'Updated' },
  ];

  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(allCols.map((c) => [c.key, true]))
  );
  const [colsOpen, setColsOpen] = useState(false);

  // details + edit
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ServiceItem | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceItem | null>(null);

  const lastFetchAt = useRef<number>(0);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [res, requestsRes] = await Promise.all([
        apiFetch<Paged<ServiceItem> | ServiceItem[]>(API.listServices),
        apiFetch<ServiceRequestItem[]>(API.listRequests),
      ]);
      const items = Array.isArray(res) ? res : res.items;
      const normalized = items.map((s) => ({
        ...s,
        tier: (s.tier ?? 'TIER_2') as ServiceTier,
        status: (s.status ?? 'ACTIVE') as any,
        dependenciesCount: s.dependenciesCount ?? 0,
      }));
      setRequests((requestsRes ?? []).map((item) => ({ ...item, id: String(item.id) })));
      setData(normalized);
      lastFetchAt.current = Date.now();
    } catch (e: any) {
      setErr(e as ApiError);
    } finally {
      setLoading(false);
    }
  }

  async function runRequestAction(id: string, action: 'assign' | 'approve' | 'reject' | 'fulfill' | 'close' | 'comment') {
    try {
      setRequestActionBusy(`${id}:${action}`);
      if (action === 'assign') {
        await apiFetch(API.assignRequest(id), { method: 'POST', body: JSON.stringify({}) });
      } else if (action === 'approve') {
        await apiFetch(API.approveRequest(id), { method: 'POST' });
      } else if (action === 'reject') {
        await apiFetch(API.rejectRequest(id), { method: 'POST' });
      } else if (action === 'close') {
        await apiFetch(API.closeRequest(id), { method: 'POST' });
      } else if (action === 'fulfill') {
        const resolution = window.prompt('Fulfillment summary');
        if (!resolution) return;
        await apiFetch(API.fulfillRequest(id), { method: 'POST', body: JSON.stringify({ resolution_summary: resolution }) });
      } else {
        const summary = window.prompt('Public note summary');
        if (summary === null) return;
        const details = window.prompt('Public note details') ?? '';
        await apiFetch(API.commentRequest(id), { method: 'POST', body: JSON.stringify({ summary, details }) });
      }
      await load();
    } finally {
      setRequestActionBusy(null);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return data.filter((s) => {
      if (tier !== 'ALL' && s.tier !== tier) return false;
      if (status !== 'ALL' && (s.status ?? 'ACTIVE') !== status) return false;
      if (!qq) return true;
      const hay = `${s.name} ${s.owner ?? ''} ${s.onCall ?? ''} ${(s.tags ?? []).join(' ')} ${s.description ?? ''}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [data, q, tier, status]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const mul = dir === 'asc' ? 1 : -1;
      const va: any =
        sort === 'deps'
          ? a.dependenciesCount ?? 0
          : sort === 'slo'
          ? a.sloPct ?? -1
          : sort === 'updatedAt'
          ? a.updatedAt ?? a.createdAt ?? ''
          : sort === 'tier'
          ? a.tier
          : a.name;
      const vb: any =
        sort === 'deps'
          ? b.dependenciesCount ?? 0
          : sort === 'slo'
          ? b.sloPct ?? -1
          : sort === 'updatedAt'
          ? b.updatedAt ?? b.createdAt ?? ''
          : sort === 'tier'
          ? b.tier
          : b.name;

      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul;
      return String(va).localeCompare(String(vb)) * mul;
    });
    return copy;
  }, [filtered, sort, dir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = useMemo(() => {
    const p = Math.min(page, totalPages);
    const start = (p - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize, totalPages]);

  function openDetails(s: ServiceItem) {
    setSelected(s);
    setDrawerOpen(true);
  }

  async function onDelete(s: ServiceItem) {
    if (!confirm(`Delete service "${s.name}"?`)) return;
    try {
      await apiFetch(API.deleteService(s.id), { method: 'DELETE' });
      await load();
    } catch (e: any) {
      setErr(e as ApiError);
    }
  }

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(s: ServiceItem) {
    setEditing(s);
    setModalOpen(true);
  }

  async function saveService(payload: Partial<ServiceItem>) {
    const isEdit = Boolean(editing?.id);
    const url = isEdit ? API.updateService(editing!.id) : API.createService;
    const method = isEdit ? 'PUT' : 'POST';
    await apiFetch(url, { method, body: JSON.stringify(payload) });
    setModalOpen(false);
    setEditing(null);
    await load();
  }

  const visibleColumns = allCols.filter((c) => visibleCols[c.key]);

  return (
    <div className="min-h-[calc(100vh-140px)] bg-[radial-gradient(1200px_circle_at_20%_-10%,rgba(56,189,248,0.18),transparent_40%),radial-gradient(900px_circle_at_90%_0%,rgba(168,85,247,0.14),transparent_35%),radial-gradient(800px_circle_at_50%_120%,rgba(34,197,94,0.10),transparent_45%)] px-5 py-5">
      <div className="mx-auto max-w-[1280px]">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold tracking-wide text-slate-400">SERVICE CATALOG</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-100">Catalog</h1>
            <p className="mt-1 text-sm text-slate-400">
              Services, ownership, tiers, SLOs, on-call, dependency topology, and service requests.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/catalog/request" className="inline-flex items-center gap-2 rounded-xl bg-sky-500/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-500">
              <ClipboardList className="h-4 w-4" />
              Request Service
            </Link>
            <Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </Button>

            <Button
              variant="secondary"
              onClick={() => {
                const cols: Array<keyof ServiceItem> = [
                  'id',
                  'name',
                  'tier',
                  'owner',
                  'onCall',
                  'sloPct',
                  'dependenciesCount',
                  'status',
                  'updatedAt',
                ];
                downloadText(
                  `service-catalog-${new Date().toISOString().slice(0, 10)}.csv`,
                  toCsv(sorted, cols)
                );
              }}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>

            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add service
            </Button>
          </div>
        </div>

        {sp.get('created') ? (
          <Card className="mt-4 border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            {sp.get('created')} created. The request was persisted through the real service request flow and appears below.
          </Card>
        ) : null}

        <Card className="mt-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">Recent Service Requests</div>
              <div className="mt-1 text-sm text-slate-400">Catalog-backed requests created through the shared create flow.</div>
            </div>
            <Link href="/catalog/request" className="text-sm font-medium text-sky-300 underline underline-offset-4">
              Open request form
            </Link>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {requests.slice(0, 4).map((request) => (
              <div key={request.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-slate-400">SR-{request.id} · {request.status}</div>
                <div className="mt-1 text-sm font-semibold text-slate-100">{request.short_description}</div>
                <div className="mt-2 text-sm text-slate-400">{request.justification}</div>
                <div className="mt-1 text-xs text-slate-500">Assignee {request.assigned_to ?? 'Unassigned'}</div>
                {request.resolution_summary ? <div className="mt-2 text-xs text-emerald-300">Resolution: {request.resolution_summary}</div> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="secondary" disabled={requestActionBusy !== null} onClick={() => runRequestAction(request.id, 'assign')}>Assign to me</Button>
                  {request.status === 'SUBMITTED' ? <Button disabled={requestActionBusy !== null} onClick={() => runRequestAction(request.id, 'approve')}>Approve</Button> : null}
                  {request.status === 'SUBMITTED' ? <Button variant="danger" disabled={requestActionBusy !== null} onClick={() => runRequestAction(request.id, 'reject')}>Reject</Button> : null}
                  {request.status === 'APPROVED' ? <Button disabled={requestActionBusy !== null} onClick={() => runRequestAction(request.id, 'fulfill')}>Fulfill</Button> : null}
                  {(request.status === 'FULFILLED' || request.status === 'REJECTED') ? <Button variant="secondary" disabled={requestActionBusy !== null} onClick={() => runRequestAction(request.id, 'close')}>Close</Button> : null}
                  <Button variant="ghost" disabled={requestActionBusy !== null} onClick={() => runRequestAction(request.id, 'comment')}>Public note</Button>
                </div>
                <div className="mt-3 text-xs text-slate-500">Service {request.service_key} · Requester {request.requester ?? '—'}</div>
              </div>
            ))}
            {!requests.length ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                No service requests yet. Use “Request Service” to create the first one.
              </div>
            ) : null}
          </div>
        </Card>

        {/* Toolbar */}
        <Card className="mt-4 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-[420px]">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <Input value={q} onChange={setQ} placeholder="Search services, owner, on-call, tags…" className="pl-9" />
            </div>

            <Select
              value={tier}
              onChange={(v) => setTier(v)}
              options={[
                { value: 'ALL', label: 'All tiers' },
                { value: 'TIER_0', label: 'Tier 0 (Critical)' },
                { value: 'TIER_1', label: 'Tier 1' },
                { value: 'TIER_2', label: 'Tier 2' },
                { value: 'TIER_3', label: 'Tier 3' },
              ]}
            />

            <Select
              value={status}
              onChange={(v) => setStatus(v)}
              options={[
                { value: 'ALL', label: 'All statuses' },
                { value: 'ACTIVE', label: 'Active' },
                { value: 'DEPRECATED', label: 'Deprecated' },
              ]}
            />

            <Select
              value={sort}
              onChange={(v) => setSort(v as any)}
              options={[
                { value: 'updatedAt', label: 'Sort: Updated' },
                { value: 'name', label: 'Sort: Name' },
                { value: 'tier', label: 'Sort: Tier' },
                { value: 'slo', label: 'Sort: SLO%' },
                { value: 'deps', label: 'Sort: Dependencies' },
              ]}
            />

            <Select
              value={dir}
              onChange={(v) => setDir(v as any)}
              options={[
                { value: 'desc', label: 'Desc' },
                { value: 'asc', label: 'Asc' },
              ]}
            />

            <div className="ml-auto flex items-center gap-2">
              <div className="text-xs text-slate-400">
                {sorted.length} result(s) • updated{' '}
                {lastFetchAt.current ? new Date(lastFetchAt.current).toLocaleTimeString() : '—'}
              </div>

              <div className="relative">
                <Button variant="secondary" onClick={() => setColsOpen((s) => !s)}>
                  <SlidersHorizontal className="h-4 w-4" />
                  Columns
                  <ChevronDown className="h-4 w-4 opacity-80" />
                </Button>
                {colsOpen ? (
                  <div className="absolute right-0 mt-2 w-[240px] rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur">
                    {allCols.map((c) => (
                      <label
                        key={c.key}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm text-slate-200 hover:bg-white/5"
                      >
                        <span>{c.label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(visibleCols[c.key])}
                          onChange={(e) =>
                            setVisibleCols((prev) => ({ ...prev, [c.key]: e.target.checked }))
                          }
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
                {visibleColumns.map((c) => (
                  <div
                    key={c.key}
                    className={cx(
                      c.key === 'name' ? 'col-span-4' : 'col-span-1',
                      c.key === 'updatedAt' ? 'col-span-2' : '',
                      c.key === 'owner' ? 'col-span-2' : '',
                      c.key === 'onCall' ? 'col-span-2' : '',
                      c.key === 'status' ? 'col-span-2' : ''
                    )}
                  >
                    {c.label}
                  </div>
                ))}
                <div className="col-span-2 text-right">Actions</div>
              </div>

              <div className="px-4">
                {loading ? (
                  <>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </>
                ) : paged.length === 0 ? (
                  <div className="py-10 text-center">
                    <div className="text-sm font-semibold text-slate-200">No services found</div>
                    <div className="mt-1 text-sm text-slate-400">Try adjusting filters or create a new service.</div>
                    <div className="mt-4 flex justify-center">
                      <Button onClick={openCreate}>
                        <Plus className="h-4 w-4" />
                        Add service
                      </Button>
                    </div>
                  </div>
                ) : (
                  paged.map((s) => (
                    <div
                      key={s.id}
                      className="grid cursor-pointer grid-cols-12 items-center gap-3 border-b border-white/5 py-3 text-sm text-slate-200 hover:bg-white/5"
                      onClick={() => openDetails(s)}
                    >
                      {visibleCols.name ? (
                        <div className="col-span-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-100">{s.name}</span>
                            <TierBadge tier={s.tier} />
                          </div>
                          <div className="mt-0.5 line-clamp-1 text-xs text-slate-400">{s.description ?? '—'}</div>
                        </div>
                      ) : null}

                      {visibleCols.tier ? <div className="col-span-1 text-xs text-slate-400">{s.tier}</div> : null}
                      {visibleCols.owner ? <div className="col-span-2 text-xs text-slate-300">{s.owner ?? '—'}</div> : null}
                      {visibleCols.onCall ? <div className="col-span-2 text-xs text-slate-300">{s.onCall ?? '—'}</div> : null}
                      {visibleCols.sloPct ? (
                        <div className="col-span-1 text-xs text-slate-300">
                          {typeof s.sloPct === 'number' ? `${s.sloPct.toFixed(2)}%` : '—'}
                        </div>
                      ) : null}
                      {visibleCols.dependenciesCount ? (
                        <div className="col-span-1 text-xs text-slate-300">{s.dependenciesCount ?? 0}</div>
                      ) : null}
                      {visibleCols.status ? (
                        <div className="col-span-2">
                          <StatusBadge status={s.status} />
                        </div>
                      ) : null}
                      {visibleCols.updatedAt ? (
                        <div className="col-span-2 text-xs text-slate-400">
                          {(s.updatedAt ?? s.createdAt) ? new Date(s.updatedAt ?? s.createdAt!).toLocaleString() : '—'}
                        </div>
                      ) : null}

                      <div className="col-span-2 flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" onClick={() => openEdit(s)} className="px-2">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" onClick={() => onDelete(s)} className="px-2">
                          <Trash2 className="h-4 w-4 text-red-300" />
                        </Button>
                        <Button variant="ghost" onClick={() => openDetails(s)} className="px-2">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs text-slate-400">
                  Page {Math.min(page, totalPages)} of {totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={String(pageSize)}
                    onChange={(v) => {
                      setPageSize(Number(v));
                      setPage(1);
                    }}
                    options={[
                      { value: '12', label: '12 / page' },
                      { value: '24', label: '24 / page' },
                      { value: '48', label: '48 / page' },
                    ]}
                  />
                  <Button variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                    Prev
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Details Drawer */}
        <Drawer
          open={drawerOpen}
          title={selected ? `Service: ${selected.name}` : 'Service'}
          onClose={() => setDrawerOpen(false)}
        >
          {selected ? (
            <div className="space-y-4">
              <Card className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-slate-100">{selected.name}</div>
                    <div className="mt-1 text-sm text-slate-400">{selected.description ?? '—'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TierBadge tier={selected.tier} />
                    <StatusBadge status={selected.status} />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs font-semibold text-slate-400">Owner</div>
                    <div className="mt-1 text-slate-100">{selected.owner ?? '—'}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs font-semibold text-slate-400">On-Call</div>
                    <div className="mt-1 text-slate-100">{selected.onCall ?? '—'}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs font-semibold text-slate-400">SLO</div>
                    <div className="mt-1 text-slate-100">
                      {typeof selected.sloPct === 'number' ? `${selected.sloPct.toFixed(2)}%` : '—'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs font-semibold text-slate-400">Dependencies</div>
                    <div className="mt-1 text-slate-100">{selected.dependenciesCount ?? 0}</div>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <Button variant="secondary" onClick={() => openEdit(selected)}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                  <Button variant="danger" onClick={() => onDelete(selected)}>
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </Card>

              <Card className="p-4">
                <div className="text-sm font-semibold text-slate-100">Operational Notes</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                  <li>Link this service to CMDB CIs for impact analysis.</li>
                  <li>Track incidents/changes by service_id for accurate KPIs.</li>
                  <li>Enforce RBAC: only ADMIN can create/edit services.</li>
                </ul>
              </Card>
            </div>
          ) : null}
        </Drawer>

        {/* Create/Edit Modal */}
        <Modal
          open={modalOpen}
          title={editing ? `Edit service: ${editing.name}` : 'Add service'}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
        >
          <ServiceForm
            initial={editing ?? undefined}
            onCancel={() => {
              setModalOpen(false);
              setEditing(null);
            }}
            onSave={saveService}
          />
        </Modal>
      </div>
    </div>
  );
}

function ServiceForm({
  initial,
  onCancel,
  onSave,
}: {
  initial?: ServiceItem;
  onCancel: () => void;
  onSave: (payload: Partial<ServiceItem>) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [owner, setOwner] = useState(initial?.owner ?? '');
  const [tier, setTier] = useState<ServiceTier>(initial?.tier ?? 'TIER_2');
  const [onCall, setOnCall] = useState(initial?.onCall ?? '');
  const [sloPct, setSloPct] = useState(initial?.sloPct?.toString() ?? '');
  const [status, setStatus] = useState<ServiceItem['status']>(initial?.status ?? 'ACTIVE');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  async function submit() {
    setFormErr(null);
    if (name.trim().length < 3) {
      setFormErr('Service name must be at least 3 characters.');
      return;
    }
    const slo = sloPct.trim() ? Number(sloPct) : undefined;
    if (sloPct.trim() && (Number.isNaN(slo) || slo! < 0 || slo! > 100)) {
      setFormErr('SLO% must be a number between 0 and 100.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        owner: owner.trim() || undefined,
        tier,
        onCall: onCall.trim() || undefined,
        sloPct: slo,
        status: status ?? 'ACTIVE',
        description: description.trim() || undefined,
      });
    } catch (e: any) {
      const ae = e as ApiError;
      setFormErr(
        `${ae.code ?? 'ERROR'}: ${ae.message ?? 'Save failed'}${
          ae.request_id ? ` (request_id=${ae.request_id})` : ''
        }`
      );
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      {formErr ? (
        <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{formErr}</div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <div className="mb-1 text-xs font-semibold text-slate-400">Service name</div>
          <Input value={name} onChange={setName} placeholder="e.g., Payments API" />
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold text-slate-400">Owner</div>
          <Input value={owner} onChange={setOwner} placeholder="team or person" />
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold text-slate-400">On-call</div>
          <Input value={onCall} onChange={setOnCall} placeholder="rotation name" />
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold text-slate-400">Tier</div>
          <Select
            value={tier}
            onChange={(v) => setTier(v as ServiceTier)}
            options={[
              { value: 'TIER_0', label: 'Tier 0 (Critical)' },
              { value: 'TIER_1', label: 'Tier 1' },
              { value: 'TIER_2', label: 'Tier 2' },
              { value: 'TIER_3', label: 'Tier 3' },
            ]}
          />
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold text-slate-400">SLO %</div>
          <Input value={sloPct} onChange={setSloPct} placeholder="99.90" />
        </div>

        <div className="col-span-2">
          <div className="mb-1 text-xs font-semibold text-slate-400">Status</div>
          <Select
            value={status ?? 'ACTIVE'}
            onChange={(v) => setStatus(v as any)}
            options={[
              { value: 'ACTIVE', label: 'Active' },
              { value: 'DEPRECATED', label: 'Deprecated' },
            ]}
          />
        </div>

        <div className="col-span-2">
          <div className="mb-1 text-xs font-semibold text-slate-400">Description</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[90px] w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
            placeholder="What does this service do? Key dependencies, runbook links, etc."
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Save
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

