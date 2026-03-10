'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CalendarClock,
  ChevronDown,
  Copy,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  TerminalSquare,
  Undo2,
  UserCheck,
  X,
} from 'lucide-react';

/**
 * Adjust to your real BFF routes.
 */
const API = {
  listChanges: '/api/bff/itsm/changes',
  patchOwner: (id: string) => `/api/bff/itsm/changes/${encodeURIComponent(id)}`,
  submit: (id: string) => `/api/bff/itsm/changes/${encodeURIComponent(id)}/submit`,
  approve: (id: string) => `/api/bff/workflow/approvals/${encodeURIComponent(id)}/approve`,
  reject: (id: string) => `/api/bff/workflow/approvals/${encodeURIComponent(id)}/reject`,
  implement: (id: string) => `/api/bff/itsm/changes/${encodeURIComponent(id)}/implement`,
  review: (id: string) => `/api/bff/itsm/changes/${encodeURIComponent(id)}/review`,
};

type ApiError = {
  status?: number;
  code?: string;
  message?: string;
  request_id?: string;
  raw?: string;
};

type Priority = 'P1' | 'P2' | 'P3' | 'P4';
type ChangeStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'IMPLEMENTED' | 'REVIEWED';

type ChangeRequest = {
  id: string;
  title: string;
  service?: string;
  requester?: string;
  owner?: string;
  priority: Priority;
  status: ChangeStatus;
  createdAt?: string;
  updatedAt?: string;

  changeWindowStart?: string;
  changeWindowEnd?: string;

  plan?: string; // steps / plan
  rollbackPlan?: string;
  previewCommand?: string;

  approvals?: Array<{ approver: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; note?: string }>;
  activity?: Array<{ at: string; actor: string; action: string }>;
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
              <div className="text-sm font-semibold text-slate-100">Changes failed to load</div>
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

function PriorityBadge({ p }: { p: Priority }) {
  const cls =
    p === 'P1'
      ? 'border-red-400/40 bg-red-500/10 text-red-200'
      : p === 'P2'
      ? 'border-orange-400/40 bg-orange-500/10 text-orange-200'
      : p === 'P3'
      ? 'border-yellow-400/40 bg-yellow-500/10 text-yellow-200'
      : 'border-slate-400/30 bg-slate-500/10 text-slate-200';
  return <span className={cx('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', cls)}>{p}</span>;
}

function StatusBadge({ s }: { s: ChangeStatus }) {
  const cls =
    s === 'DRAFT'
      ? 'border-slate-400/30 bg-slate-500/10 text-slate-200'
      : s === 'SUBMITTED'
      ? 'border-sky-400/30 bg-sky-500/10 text-sky-200'
      : s === 'APPROVED'
      ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
      : s === 'IMPLEMENTED'
      ? 'border-amber-400/25 bg-amber-500/10 text-amber-200'
      : s === 'REVIEWED'
      ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
      : s === 'REJECTED'
      ? 'border-red-400/25 bg-red-500/10 text-red-200'
      : 'border-slate-400/30 bg-slate-500/10 text-slate-200';
  return <span className={cx('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', cls)}>{s}</span>;
}

function changeActions(status: ChangeStatus): Array<{ key: 'submit' | 'approve' | 'reject' | 'implement' | 'review'; label: string; variant?: 'primary' | 'secondary' | 'danger' }> {
  switch (status) {
    case 'DRAFT':
      return [{ key: 'submit', label: 'Submit', variant: 'secondary' }];
    case 'SUBMITTED':
      return [
        { key: 'approve', label: 'Approve', variant: 'secondary' },
        { key: 'reject', label: 'Reject', variant: 'danger' },
      ];
    case 'APPROVED':
      return [{ key: 'implement', label: 'Implement', variant: 'secondary' }];
    case 'IMPLEMENTED':
      return [{ key: 'review', label: 'Review', variant: 'secondary' }];
    default:
      return [];
  }
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
          'absolute right-0 top-0 h-full w-full max-w-[680px] border-l border-white/10 bg-slate-950/80 backdrop-blur-xl transition-transform',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-100">{title}</div>
            <div className="mt-1 text-xs text-slate-400">CAB approvals, plan/rollback, and execution preview.</div>
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

export default function ChangesPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const fromProblem = sp.get('from_problem') ?? '';

  const [q, setQ] = useState(() => sp.get('q') ?? '');
  const [priority, setPriority] = useState(() => sp.get('priority') ?? 'ALL');
  const [status, setStatus] = useState(() => sp.get('status') ?? 'ALL');
  const [sort, setSort] = useState(() => sp.get('sort') ?? 'updatedAt');
  const [dir, setDir] = useState(() => sp.get('dir') ?? 'desc');
  const [page, setPage] = useState(() => Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1));
  const [pageSize, setPageSize] = useState(() => Math.max(10, parseInt(sp.get('ps') ?? '20', 10) || 20));

  const colsAll = [
    { key: 'id', label: 'ID' },
    { key: 'title', label: 'Title' },
    { key: 'service', label: 'Service' },
    { key: 'owner', label: 'Owner' },
    { key: 'priority', label: 'Priority' },
    { key: 'status', label: 'Status' },
    { key: 'window', label: 'Window' },
    { key: 'updated', label: 'Updated' },
  ] as const;
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(colsAll.map((c) => [c.key, true]))
  );
  const [colsOpen, setColsOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<ApiError | null>(null);
  const [changes, setChanges] = useState<ChangeRequest[]>([]);
  const lastFetchAt = useRef<number>(0);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ChangeRequest | null>(null);

  const [toast, setToast] = useState<Toast | null>(null);

  // URL sync
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (q.trim()) p.set('q', q.trim());
      if (priority !== 'ALL') p.set('priority', priority);
      if (status !== 'ALL') p.set('status', status);
      if (sort !== 'updatedAt') p.set('sort', sort);
      if (dir !== 'desc') p.set('dir', dir);
      if (page !== 1) p.set('page', String(page));
      if (pageSize !== 20) p.set('ps', String(pageSize));
      if (fromProblem) p.set('from_problem', fromProblem);
      const qs = p.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    }, 200);
    return () => clearTimeout(t);
  }, [q, priority, status, sort, dir, page, pageSize, fromProblem, router]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiFetch<Paged<ChangeRequest> | ChangeRequest[]>(API.listChanges);
      const items = Array.isArray(res) ? res : res.items;

      const norm: ChangeRequest[] = items
        .map((x: any) => ({
          id: String(x.id ?? x.change_id ?? x.key ?? ''),
          title: String(x.title ?? x.summary ?? 'Untitled change'),
          service: x.service ?? x.serviceName ?? x.service_id ?? 'Unknown',
          requester: x.requester ?? x.createdBy ?? x.requested_by ?? '',
          owner: x.owner ?? x.assignee ?? '',
          priority: (x.priority ?? 'P3') as Priority,
          status: (x.status ?? 'DRAFT') as ChangeStatus,
          createdAt: x.createdAt ?? x.created_at,
          updatedAt: x.updatedAt ?? x.updated_at,
          changeWindowStart: x.changeWindowStart ?? x.window_start,
          changeWindowEnd: x.changeWindowEnd ?? x.window_end,
          plan: x.plan ?? x.steps ?? '',
          rollbackPlan: x.rollbackPlan ?? x.rollback_plan ?? '',
          previewCommand: x.previewCommand ?? x.preview_command ?? '',
          approvals: Array.isArray(x.approvals) ? x.approvals : [],
          activity: Array.isArray(x.activity) ? x.activity : [],
        }))
        .filter((x) => x.id);

      setChanges(norm);
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

  useEffect(() => {
    const created = sp.get('created');
    if (created) {
      setToast({ kind: 'success', title: `${created} created`, detail: 'The change record was persisted and is now part of the real lifecycle queue.' });
    }
  }, [sp]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return changes.filter((c) => {
      if (priority !== 'ALL' && c.priority !== priority) return false;
      if (status !== 'ALL' && c.status !== status) return false;
      if (!qq) return true;
      const hay = `${c.id} ${c.title} ${c.service ?? ''} ${c.owner ?? ''} ${c.requester ?? ''}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [changes, q, priority, status]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    const mul = dir === 'asc' ? 1 : -1;
    const prioRank: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };

    copy.sort((a, b) => {
      if (sort === 'priority') return (prioRank[a.priority] - prioRank[b.priority]) * mul;
      const va = a.updatedAt ?? a.createdAt ?? '';
      const vb = b.updatedAt ?? b.createdAt ?? '';
      return String(va).localeCompare(String(vb)) * mul;
    });
    return copy;
  }, [filtered, sort, dir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = useMemo(() => {
    const p = clamp(page, 1, totalPages);
    const start = (p - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize, totalPages]);

  function openRow(c: ChangeRequest) {
    setSelected(c);
    setDrawerOpen(true);
  }

  async function patchChangeOwner(id: string, owner: string) {
    try {
      await apiFetch(API.patchOwner(id), { method: 'PATCH', body: JSON.stringify({ owner }) });
      setToast({ kind: 'success', title: 'Updated', detail: `Change #${id} owner updated.` });
      await load();
    } catch (e: any) {
      const ae = e as ApiError;
      setToast({
        kind: 'error',
        title: `Update failed (${ae.code ?? 'ERROR'})`,
        detail: `${ae.message ?? 'Request failed'}${ae.request_id ? ` • request_id=${ae.request_id}` : ''}`,
      });
    }
  }

  async function approveChange(id: string) {
    try {
      await apiFetch(API.approve(id), { method: 'POST' });
      setToast({ kind: 'success', title: 'Approved', detail: `Change #${id} approved.` });
      await load();
    } catch (e: any) {
      const ae = e as ApiError;
      setToast({ kind: 'error', title: `Approve failed (${ae.code ?? 'ERROR'})`, detail: `${ae.message ?? 'Request failed'}${ae.request_id ? ` â€¢ request_id=${ae.request_id}` : ''}` });
    }
  }

  async function rejectChange(id: string) {
    try {
      await apiFetch(API.reject(id), { method: 'POST' });
      setToast({ kind: 'success', title: 'Rejected', detail: `Change #${id} rejected.` });
      await load();
    } catch (e: any) {
      const ae = e as ApiError;
      setToast({ kind: 'error', title: `Reject failed (${ae.code ?? 'ERROR'})`, detail: `${ae.message ?? 'Request failed'}${ae.request_id ? ` â€¢ request_id=${ae.request_id}` : ''}` });
    }
  }

  async function advanceChange(id: string, action: 'submit' | 'implement' | 'review') {
    try {
      const endpoint = action === 'submit' ? API.submit(id) : action === 'implement' ? API.implement(id) : API.review(id);
      await apiFetch(endpoint, { method: 'POST' });
      setToast({ kind: 'success', title: 'Lifecycle updated', detail: `Change #${id} moved to ${action.toUpperCase()}.` });
      await load();
    } catch (e: any) {
      const ae = e as ApiError;
      setToast({ kind: 'error', title: `Transition failed (${ae.code ?? 'ERROR'})`, detail: `${ae.message ?? 'Request failed'}${ae.request_id ? ` â€¢ request_id=${ae.request_id}` : ''}` });
    }
  }

  const [tab, setTab] = useState<'details' | 'approvals' | 'runbook'>('details');

  return (
    <div className="min-h-[calc(100vh-140px)] bg-[radial-gradient(1200px_circle_at_20%_-10%,rgba(56,189,248,0.18),transparent_40%),radial-gradient(900px_circle_at_90%_0%,rgba(168,85,247,0.14),transparent_35%),radial-gradient(800px_circle_at_50%_120%,rgba(34,197,94,0.10),transparent_45%)] px-5 py-5">
      <ToastView toast={toast} onClose={() => setToast(null)} />

      <div className="mx-auto max-w-[1400px]">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold tracking-wide text-slate-400">CHANGE MANAGEMENT</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-100">Changes</h1>
            <p className="mt-1 text-sm text-slate-400">
              CAB approvals, change windows, execution plan, rollback, and audit-ready activity.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/changes/new" className="inline-flex items-center gap-2 rounded-xl bg-sky-500/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-500">
              <CalendarClock className="h-4 w-4" />
              New Change
            </Link>
            <Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        {fromProblem ? (
          <Card className="mt-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Created from Problem</div>
                <div className="mt-1 text-sm text-slate-300">
                  You arrived from problem <span className="rounded bg-black/30 px-1.5 py-0.5">#{fromProblem}</span>. Open a
                  change request to review/approve.
                </div>
              </div>
              <Button variant="ghost" onClick={() => router.push('/changes')}>
                <X className="h-4 w-4" />
                Clear
              </Button>
            </div>
          </Card>
        ) : null}

        {/* Toolbar */}
        <Card className="mt-4 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-[440px]">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <Input value={q} onChange={setQ} placeholder="Search id/title/service/owner/requester…" className="pl-9" />
            </div>

            <Select
              value={priority}
              onChange={(v) => {
                setPriority(v);
                setPage(1);
              }}
              options={[
                { value: 'ALL', label: 'All priorities' },
                { value: 'P1', label: 'P1' },
                { value: 'P2', label: 'P2' },
                { value: 'P3', label: 'P3' },
                { value: 'P4', label: 'P4' },
              ]}
            />

            <Select
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              options={[
                { value: 'ALL', label: 'All statuses' },
                { value: 'DRAFT', label: 'DRAFT' },
                { value: 'SUBMITTED', label: 'SUBMITTED' },
                { value: 'APPROVED', label: 'APPROVED' },
                { value: 'IMPLEMENTED', label: 'IMPLEMENTED' },
                { value: 'REVIEWED', label: 'REVIEWED' },
                { value: 'REJECTED', label: 'REJECTED' },
              ]}
            />

            <div className="ml-auto flex items-center gap-2">
              <Select value={sort} onChange={(v) => setSort(v)} options={[{ value: 'updatedAt', label: 'Sort: Updated' }, { value: 'priority', label: 'Sort: Priority' }]} />
              <Select value={dir} onChange={(v) => setDir(v)} options={[{ value: 'desc', label: 'Desc' }, { value: 'asc', label: 'Asc' }]} />

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

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <div>
              Results: <span className="text-slate-200">{sorted.length}</span> • Last updated:{' '}
              <span className="text-slate-200">{lastFetchAt.current ? new Date(lastFetchAt.current).toLocaleTimeString() : '—'}</span>
            </div>
            <div>
              Page <span className="text-slate-200">{clamp(page, 1, totalPages)}</span> / <span className="text-slate-200">{totalPages}</span>
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
                {visibleCols.id ? <div className="col-span-1">ID</div> : null}
                {visibleCols.title ? <div className="col-span-4">Title</div> : null}
                {visibleCols.service ? <div className="col-span-2">Service</div> : null}
                {visibleCols.owner ? <div className="col-span-2">Owner</div> : null}
                {visibleCols.priority ? <div className="col-span-1">Pri</div> : null}
                {visibleCols.status ? <div className="col-span-1">Status</div> : null}
                {visibleCols.window ? <div className="col-span-2">Window</div> : null}
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
                    <div className="text-sm font-semibold text-slate-200">No changes found</div>
                    <div className="mt-1 text-sm text-slate-400">Try changing filters or search terms.</div>
                  </div>
                ) : (
                  paged.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => openRow(c)}
                      className="grid w-full grid-cols-12 items-center gap-3 border-b border-white/5 py-3 text-left text-sm text-slate-200 hover:bg-white/5"
                    >
                      {visibleCols.id ? <div className="col-span-1 text-xs text-slate-300">#{c.id}</div> : null}

                      {visibleCols.title ? (
                        <div className="col-span-4">
                          <div className="line-clamp-1 font-semibold text-slate-100">{c.title}</div>
                          <div className="mt-0.5 line-clamp-1 text-xs text-slate-400">{c.service ?? '—'}</div>
                        </div>
                      ) : null}

                      {visibleCols.service ? <div className="col-span-2 text-xs text-slate-300">{c.service ?? '—'}</div> : null}
                      {visibleCols.owner ? <div className="col-span-2 text-xs text-slate-300">{c.owner ?? 'Unassigned'}</div> : null}

                      {visibleCols.priority ? (
                        <div className="col-span-1">
                          <PriorityBadge p={c.priority} />
                        </div>
                      ) : null}

                      {visibleCols.status ? (
                        <div className="col-span-1">
                          <StatusBadge s={c.status} />
                        </div>
                      ) : null}

                      {visibleCols.window ? (
                        <div className="col-span-2 text-xs text-slate-400">
                          {c.changeWindowStart ? new Date(c.changeWindowStart).toLocaleString() : '—'}
                        </div>
                      ) : null}

                      {visibleCols.updated ? (
                        <div className="col-span-2 text-xs text-slate-400">{fmtDateTime(c.updatedAt ?? c.createdAt)}</div>
                      ) : null}

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
                  Showing <span className="text-slate-200">{paged.length}</span> of <span className="text-slate-200">{sorted.length}</span>
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
          title={selected ? `Change #${selected.id} — ${selected.title}` : 'Change'}
          onClose={() => setDrawerOpen(false)}
        >
          {!selected ? null : (
            <div className="space-y-4">
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold text-slate-100">{selected.title}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <PriorityBadge p={selected.priority} />
                      <StatusBadge s={selected.status} />
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300">
                        Service: {selected.service ?? '—'}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300">
                        Owner: {selected.owner ?? 'Unassigned'}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs font-semibold text-slate-400">Window start</div>
                        <div className="mt-1 text-slate-100">{fmtDateTime(selected.changeWindowStart)}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs font-semibold text-slate-400">Window end</div>
                        <div className="mt-1 text-slate-100">{fmtDateTime(selected.changeWindowEnd)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {changeActions(selected.status).length ? (
                      changeActions(selected.status).map((action) => (
                        <Button
                          key={action.key}
                          variant={action.variant ?? 'secondary'}
                          onClick={() =>
                            action.key === 'approve'
                              ? approveChange(selected.id)
                              : action.key === 'reject'
                              ? rejectChange(selected.id)
                              : advanceChange(selected.id, action.key)
                          }
                        >
                          {action.key === 'approve' ? <UserCheck className="h-4 w-4" /> : action.key === 'reject' ? <X className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
                          {action.label}
                        </Button>
                      ))
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                        No further lifecycle action is allowed from {selected.status}.
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* Tabs */}
              <Card className="p-2">
                <div className="flex flex-wrap gap-2">
                  {[
                    { k: 'details', label: 'Details' },
                    { k: 'approvals', label: 'Approvals' },
                    { k: 'runbook', label: 'Plan / Rollback' },
                  ].map((t) => (
                    <button
                      key={t.k}
                      onClick={() => setTab(t.k as any)}
                      className={cx(
                        'rounded-xl px-3 py-2 text-sm font-medium',
                        tab === t.k ? 'bg-white/10 text-slate-100' : 'text-slate-300 hover:bg-white/5'
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </Card>

              {tab === 'details' ? (
                <Card className="p-4">
                  <div className="text-sm font-semibold text-slate-100">Lifecycle / Owner</div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-xs font-semibold text-slate-400">Status</div>
                      <div className="mt-2 text-sm text-slate-100">{selected.status}</div>
                      <div className="mt-2 text-xs text-slate-400">
                        Legal path: DRAFT {'->'} SUBMITTED {'->'} APPROVED/REJECTED. APPROVED {'->'} IMPLEMENTED {'->'} REVIEWED.
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-xs font-semibold text-slate-400">Owner</div>
                      <div className="mt-2 flex gap-2">
                        <Input
                          value={selected.owner ?? ''}
                          onChange={(v) => setSelected((prev) => (prev ? { ...prev, owner: v } : prev))}
                          placeholder="e.g., platform-sre"
                        />
                        <Button variant="secondary" onClick={() => patchChangeOwner(selected.id, selected.owner ?? '')}>
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ) : null}

              {tab === 'approvals' ? (
                <Card className="p-4">
                  <div className="text-sm font-semibold text-slate-100">CAB Approvals</div>
                  <div className="mt-2 text-sm text-slate-400">
                    If you already have ApprovalFlow.tsx, replace this section with that component.
                  </div>

                  <div className="mt-4 space-y-2">
                    {(selected.approvals ?? []).length ? (
                      selected.approvals!.map((a, idx) => (
                        <div key={idx} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                          <div>
                            <div className="text-sm font-semibold text-slate-100">{a.approver}</div>
                            {a.note ? <div className="mt-0.5 text-xs text-slate-400">{a.note}</div> : null}
                          </div>
                          <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-xs text-slate-200">
                            {a.status}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-slate-400">No approvals in payload.</div>
                    )}
                  </div>
                </Card>
              ) : null}

              {tab === 'runbook' ? (
                <>
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-100">Preview Command</div>
                      <TerminalSquare className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                      <pre className="text-xs text-slate-200 whitespace-pre-wrap">
                        {selected.previewCommand?.trim()
                          ? selected.previewCommand
                          : 'No preview command available. Populate previewCommand from workflow tooling.'}
                      </pre>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => navigator.clipboard.writeText(selected.previewCommand ?? '')}
                        disabled={!selected.previewCommand}
                      >
                        <Copy className="h-4 w-4" />
                        Copy
                      </Button>
                    </div>
                  </Card>

                  <Card className="p-4">
                    <div className="text-sm font-semibold text-slate-100">Execution Plan</div>
                    <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                      <pre className="text-xs text-slate-200 whitespace-pre-wrap">
                        {selected.plan?.trim() ? selected.plan : 'No plan steps provided.'}
                      </pre>
                    </div>
                  </Card>

                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-100">Rollback Plan</div>
                      <Undo2 className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                      <pre className="text-xs text-slate-200 whitespace-pre-wrap">
                        {selected.rollbackPlan?.trim() ? selected.rollbackPlan : 'No rollback plan provided.'}
                      </pre>
                    </div>
                  </Card>
                </>
              ) : null}
            </div>
          )}
        </Drawer>
      </div>
    </div>
  );
}
