'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ChevronDown,
  Copy,
  ExternalLink,
  Link2,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from 'lucide-react';

/**
 * Adjust to your real BFF routes.
 */
const API = {
  listProblems: '/api/bff/itsm/problems', // TODO verify
  createProblem: '/api/bff/itsm/problems', // POST
  patchProblem: (id: string) => `/api/bff/itsm/problems/${encodeURIComponent(id)}`, // PATCH
  linkIncident: (problemId: string) =>
    `/api/bff/itsm/problems/${encodeURIComponent(problemId)}/link-incident`, // POST { incidentId }
  rootCause: (problemId: string) =>
    `/api/bff/itsm/problems/${encodeURIComponent(problemId)}/root-cause`, // POST
  knownError: (problemId: string) =>
    `/api/bff/itsm/problems/${encodeURIComponent(problemId)}/known-error`, // POST
  closeProblem: (problemId: string) =>
    `/api/bff/itsm/problems/${encodeURIComponent(problemId)}/close`, // POST
};

type ApiError = {
  status?: number;
  code?: string;
  message?: string;
  request_id?: string;
  raw?: string;
};

type Priority = 'P1' | 'P2' | 'P3' | 'P4';
type ProblemStatus = 'CREATED' | 'INCIDENT_LINKED' | 'ROOT_CAUSE_IDENTIFIED' | 'KNOWN_ERROR' | 'CLOSED';

type Problem = {
  id: string;
  title: string;
  service?: string;
  owner?: string;
  priority: Priority;
  status: ProblemStatus;
  createdAt?: string;
  updatedAt?: string;

  summary?: string;
  rcaSummary?: string;

  linkedIncidents?: Array<{ id: string; title?: string }>;
  affectedCis?: string[];

  // optional
  evidence?: string;
  citations?: string[];
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
              <div className="text-sm font-semibold text-slate-100">Problems failed to load</div>
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

function StatusBadge({ s }: { s: ProblemStatus }) {
  const cls =
    s === 'CREATED'
      ? 'border-sky-400/30 bg-sky-500/10 text-sky-200'
      : s === 'INCIDENT_LINKED'
      ? 'border-amber-400/25 bg-amber-500/10 text-amber-200'
      : s === 'ROOT_CAUSE_IDENTIFIED'
      ? 'border-purple-400/25 bg-purple-500/10 text-purple-200'
      : s === 'KNOWN_ERROR'
      ? 'border-rose-400/25 bg-rose-500/10 text-rose-200'
      : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200';
  return <span className={cx('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', cls)}>{s}</span>;
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
          'absolute right-0 top-0 h-full w-full max-w-[640px] border-l border-white/10 bg-slate-950/80 backdrop-blur-xl transition-transform',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-100">{title}</div>
            <div className="mt-1 text-xs text-slate-400">RCA, linked incidents, and remediation planning.</div>
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

export default function ProblemsPage() {
  const router = useRouter();
  const sp = useSearchParams();

  // Support deep link from incidents page: /problems?from=INCIDENT_ID
  const fromIncident = sp.get('from') ?? '';

  // URL state
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
    { key: 'updated', label: 'Updated' },
  ] as const;
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(colsAll.map((c) => [c.key, true]))
  );
  const [colsOpen, setColsOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<ApiError | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const lastFetchAt = useRef<number>(0);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<Problem | null>(null);

  const [toast, setToast] = useState<Toast | null>(null);
  const [createForm, setCreateForm] = useState({ title: '', serviceKey: '', owner: '', summary: '' });
  const [creating, setCreating] = useState(false);
  const [linkIncidentId, setLinkIncidentId] = useState(fromIncident);
  const [rootCauseDraft, setRootCauseDraft] = useState('');
  const [knownErrorDraft, setKnownErrorDraft] = useState('');

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
      if (fromIncident) p.set('from', fromIncident);
      const qs = p.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    }, 200);
    return () => clearTimeout(t);
  }, [q, priority, status, sort, dir, page, pageSize, fromIncident, router]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiFetch<Paged<Problem> | Problem[]>(API.listProblems);
      const items = Array.isArray(res) ? res : res.items;

      const norm: Problem[] = items
        .map((x: any) => ({
          id: String(x.id ?? x.problem_id ?? x.key ?? ''),
          title: String(x.title ?? x.summary ?? 'Untitled problem'),
          service: x.service ?? x.serviceName ?? x.service_id ?? 'Unknown',
          owner: x.owner ?? x.assignee ?? 'Unassigned',
          priority: (x.priority ?? 'P3') as Priority,
          status: (x.status ?? 'CREATED') as ProblemStatus,
          createdAt: x.createdAt ?? x.created_at,
          updatedAt: x.updatedAt ?? x.updated_at,

          summary: x.summary ?? x.description ?? '',
          rcaSummary: x.rcaSummary ?? x.rca_summary ?? '',
          linkedIncidents: Array.isArray(x.linkedIncidents ?? x.linked_incidents)
            ? (x.linkedIncidents ?? x.linked_incidents)
            : [],
          affectedCis: Array.isArray(x.affectedCis ?? x.affected_cis) ? (x.affectedCis ?? x.affected_cis) : [],
          evidence: x.evidence ?? '',
          citations: Array.isArray(x.citations) ? x.citations : [],
        }))
        .filter((x) => x.id);

      setProblems(norm);
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
      setToast({ kind: 'success', title: `${created} created`, detail: 'The problem record was persisted and is now available for root-cause investigation.' });
    }
  }, [sp]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return problems.filter((p) => {
      if (priority !== 'ALL' && p.priority !== priority) return false;
      if (status !== 'ALL' && p.status !== status) return false;
      if (!qq) return true;
      const hay = `${p.id} ${p.title} ${p.service ?? ''} ${p.owner ?? ''} ${p.summary ?? ''} ${p.rcaSummary ?? ''}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [problems, q, priority, status]);

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

  function openRow(p: Problem) {
    setSelected(p);
    setLinkIncidentId(fromIncident);
    setRootCauseDraft(p.rcaSummary ?? '');
    setKnownErrorDraft('');
    setDrawerOpen(true);
  }

  async function createProblem() {
    if (!createForm.title.trim()) {
      setToast({ kind: 'error', title: 'Create failed', detail: 'Problem title is required.' });
      return;
    }
    setCreating(true);
    try {
      const created = await apiFetch<Problem>(API.createProblem, {
        method: 'POST',
        body: JSON.stringify({
          title: createForm.title.trim(),
          service_key: createForm.serviceKey.trim(),
          owner: createForm.owner.trim(),
          summary: createForm.summary.trim(),
        }),
      });
      setToast({ kind: 'success', title: 'Problem created', detail: `Problem #${String((created as any).id ?? '')} created.` });
      setCreateForm({ title: '', serviceKey: '', owner: '', summary: '' });
      await load();
    } catch (e: any) {
      const ae = e as ApiError;
      setToast({
        kind: 'error',
        title: `Create failed (${ae.code ?? 'ERROR'})`,
        detail: `${ae.message ?? 'Request failed'}${ae.request_id ? ` | request_id=${ae.request_id}` : ''}`,
      });
    } finally {
      setCreating(false);
    }
  }

  async function patchProblem(id: string, patch: Partial<Pick<Problem, 'owner'>>) {
    try {
      await apiFetch(API.patchProblem(id), { method: 'PATCH', body: JSON.stringify(patch) });
      setToast({ kind: 'success', title: 'Updated', detail: `Problem #${id} updated.` });
      await load();
    } catch (e: any) {
      const ae = e as ApiError;
      setToast({
        kind: 'error',
        title: `Update failed (${ae.code ?? 'ERROR'})`,
        detail: `${ae.message ?? 'Request failed'}${ae.request_id ? ` | request_id=${ae.request_id}` : ''}`,
      });
    }
  }

  async function transitionProblem(problemId: string, action: 'rootCause' | 'knownError' | 'close', body?: Record<string, string>) {
    const endpoint =
      action === 'rootCause' ? API.rootCause(problemId) : action === 'knownError' ? API.knownError(problemId) : API.closeProblem(problemId);
    try {
      await apiFetch(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      const title =
        action === 'rootCause' ? 'Root cause recorded' : action === 'knownError' ? 'Known error marked' : 'Problem closed';
      setToast({ kind: 'success', title, detail: `Problem #${problemId} updated.` });
      await load();
    } catch (e: any) {
      const ae = e as ApiError;
      setToast({
        kind: 'error',
        title: `Update failed (${ae.code ?? 'ERROR'})`,
        detail: `${ae.message ?? 'Request failed'}${ae.request_id ? ` | request_id=${ae.request_id}` : ''}`,
      });
    }
  }

  async function linkIncident(problemId: string, incidentId: string) {
    try {
      await apiFetch(API.linkIncident(problemId), { method: 'POST', body: JSON.stringify({ incidentId }) });
      setToast({ kind: 'success', title: 'Linked incident', detail: `Incident #${incidentId} linked.` });
      await load();
    } catch (e: any) {
      const ae = e as ApiError;
      setToast({
        kind: 'error',
        title: `Link failed (${ae.code ?? 'ERROR'})`,
        detail: `${ae.message ?? 'Request failed'}${ae.request_id ? ` | request_id=${ae.request_id}` : ''}`,
      });
    }
  }

  // details tab
  const [tab, setTab] = useState<'rca' | 'incidents' | 'impact' | 'evidence'>('rca');

  // small RCA graph (SVG) - lightweight, no deps
  function RcaGraph({ service }: { service?: string }) {
    const s = service ?? 'Service';
    return (
      <svg viewBox="0 0 520 170" className="w-full">
        <defs>
          <linearGradient id="g" x1="0" x2="1">
            <stop offset="0" stopColor="rgba(56,189,248,0.35)" />
            <stop offset="1" stopColor="rgba(168,85,247,0.20)" />
          </linearGradient>
        </defs>
        <rect x="10" y="20" width="150" height="44" rx="12" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" />
        <text x="85" y="48" textAnchor="middle" fontSize="12" fill="rgba(226,232,240,0.95)">
          Gateway
        </text>

        <rect x="185" y="20" width="150" height="44" rx="12" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" />
        <text x="260" y="48" textAnchor="middle" fontSize="12" fill="rgba(226,232,240,0.95)">
          {s}
        </text>

        <rect x="360" y="20" width="150" height="44" rx="12" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" />
        <text x="435" y="48" textAnchor="middle" fontSize="12" fill="rgba(226,232,240,0.95)">
          Database
        </text>

        <path d="M160 42 L185 42" stroke="url(#g)" strokeWidth="3" />
        <path d="M335 42 L360 42" stroke="url(#g)" strokeWidth="3" />

        <rect x="185" y="92" width="150" height="58" rx="14" fill="rgba(239,68,68,0.12)" stroke="rgba(239,68,68,0.35)" />
        <text x="260" y="118" textAnchor="middle" fontSize="12" fill="rgba(254,202,202,0.95)">
          Symptom cluster
        </text>
        <text x="260" y="138" textAnchor="middle" fontSize="11" fill="rgba(254,202,202,0.85)">
          timeouts / retries / saturation
        </text>

        <path d="M260 64 L260 92" stroke="rgba(56,189,248,0.5)" strokeWidth="3" />
      </svg>
    );
  }

  return (
    <div className="min-h-[calc(100vh-140px)] bg-[radial-gradient(1200px_circle_at_20%_-10%,rgba(56,189,248,0.18),transparent_40%),radial-gradient(900px_circle_at_90%_0%,rgba(168,85,247,0.14),transparent_35%),radial-gradient(800px_circle_at_50%_120%,rgba(34,197,94,0.10),transparent_45%)] px-5 py-5">
      <ToastView toast={toast} onClose={() => setToast(null)} />

      <div className="mx-auto max-w-[1400px]">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold tracking-wide text-slate-400">ROOT CAUSE</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-100">Problems</h1>
            <p className="mt-1 text-sm text-slate-400">
              Aggregate incidents, enforce root-cause workflow, and close problems only after known-error capture.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/problems/new" className="inline-flex items-center gap-2 rounded-xl bg-sky-500/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-500">
              <AlertTriangle className="h-4 w-4" />
              New Problem
            </Link>
            <Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Deep link helper */}
        {fromIncident ? (
          <Card className="mt-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Link from Incident</div>
                <div className="mt-1 text-sm text-slate-300">
                  You arrived from incident <span className="rounded bg-black/30 px-1.5 py-0.5">#{fromIncident}</span>. Open a
                  problem and link it in the drawer.
                </div>
              </div>
              <Button variant="ghost" onClick={() => router.push('/problems')}>
                <X className="h-4 w-4" />
                Clear
              </Button>
            </div>
          </Card>
        ) : null}

        <Card className="mt-4 p-4">
          <div className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr]">
            <div>
              <div className="text-sm font-semibold text-slate-100">Create problem</div>
              <div className="mt-1 text-sm text-slate-400">Persist a new problem in CREATED state before linking incidents.</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Input value={createForm.title} onChange={(v) => setCreateForm((prev) => ({ ...prev, title: v }))} placeholder="Problem title" />
                <Input value={createForm.serviceKey} onChange={(v) => setCreateForm((prev) => ({ ...prev, serviceKey: v }))} placeholder="Service key" />
                <Input value={createForm.owner} onChange={(v) => setCreateForm((prev) => ({ ...prev, owner: v }))} placeholder="Owner" />
                <Input value={createForm.summary} onChange={(v) => setCreateForm((prev) => ({ ...prev, summary: v }))} placeholder="Initial summary" />
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
              <div className="text-xs font-semibold text-slate-400">Lifecycle</div>
              <div className="mt-2">CREATED {'->'} INCIDENT_LINKED {'->'} ROOT_CAUSE_IDENTIFIED {'->'} KNOWN_ERROR {'->'} CLOSED</div>
            </div>
            <div className="flex items-end justify-end">
              <Button onClick={createProblem} disabled={creating}>
                <AlertTriangle className="h-4 w-4" />
                {creating ? 'Creating...' : 'Create problem'}
              </Button>
            </div>
          </div>
        </Card>

        {/* Toolbar */}
        <Card className="mt-4 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-[440px]">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <Input value={q} onChange={setQ} placeholder="Search id/title/service/owner/rca…" className="pl-9" />
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
                { value: 'CREATED', label: 'CREATED' },
                { value: 'INCIDENT_LINKED', label: 'INCIDENT_LINKED' },
                { value: 'ROOT_CAUSE_IDENTIFIED', label: 'ROOT_CAUSE_IDENTIFIED' },
                { value: 'KNOWN_ERROR', label: 'KNOWN_ERROR' },
                { value: 'CLOSED', label: 'CLOSED' },
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
                  <div className="absolute right-0 mt-2 w-[220px] rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur">
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
                    <div className="text-sm font-semibold text-slate-200">No problems found</div>
                    <div className="mt-1 text-sm text-slate-400">Try changing filters or search terms.</div>
                  </div>
                ) : (
                  paged.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => openRow(p)}
                      className="grid w-full grid-cols-12 items-center gap-3 border-b border-white/5 py-3 text-left text-sm text-slate-200 hover:bg-white/5"
                    >
                      {visibleCols.id ? <div className="col-span-1 text-xs text-slate-300">#{p.id}</div> : null}
                      {visibleCols.title ? (
                        <div className="col-span-4">
                          <div className="line-clamp-1 font-semibold text-slate-100">{p.title}</div>
                          <div className="mt-0.5 line-clamp-1 text-xs text-slate-400">{p.rcaSummary?.trim() ? p.rcaSummary : 'RCA pending…'}</div>
                        </div>
                      ) : null}
                      {visibleCols.service ? <div className="col-span-2 text-xs text-slate-300">{p.service ?? '—'}</div> : null}
                      {visibleCols.owner ? <div className="col-span-2 text-xs text-slate-300">{p.owner ?? 'Unassigned'}</div> : null}
                      {visibleCols.priority ? (
                        <div className="col-span-1">
                          <PriorityBadge p={p.priority} />
                        </div>
                      ) : null}
                      {visibleCols.status ? (
                        <div className="col-span-1">
                          <StatusBadge s={p.status} />
                        </div>
                      ) : null}
                      {visibleCols.updated ? <div className="col-span-2 text-xs text-slate-400">{fmtDateTime(p.updatedAt ?? p.createdAt)}</div> : null}

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
          title={selected ? `Problem #${selected.id} — ${selected.title}` : 'Problem'}
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
                        <div className="text-xs font-semibold text-slate-400">Created</div>
                        <div className="mt-1 text-slate-100">{fmtDateTime(selected.createdAt)}</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs font-semibold text-slate-400">Updated</div>
                        <div className="mt-1 text-slate-100">{fmtDateTime(selected.updatedAt)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                    Next legal action: {
                      selected.status === 'CREATED'
                        ? 'Link incident'
                        : selected.status === 'INCIDENT_LINKED'
                        ? 'Record root cause'
                        : selected.status === 'ROOT_CAUSE_IDENTIFIED'
                        ? 'Mark known error'
                        : selected.status === 'KNOWN_ERROR'
                        ? 'Close problem'
                        : 'No further actions'
                    }
                  </div>
                </div>
              </Card>

              {/* Tabs */}
              <Card className="p-2">
                <div className="flex flex-wrap gap-2">
                  {[
                    { k: 'rca', label: 'RCA' },
                    { k: 'incidents', label: 'Linked incidents' },
                    { k: 'impact', label: 'Impact' },
                    { k: 'evidence', label: 'Evidence' },
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

              {tab === 'rca' ? (
                <>
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-100">RCA Graph</div>
                      <AlertTriangle className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                      <RcaGraph service={selected.service} />
                    </div>
                    <div className="mt-3 text-sm text-slate-300">
                      {selected.rcaSummary?.trim()
                        ? selected.rcaSummary
                        : 'RCA summary not provided. Populate rcaSummary from your workflow/KB pipeline.'}
                    </div>
                  </Card>

                  <Card className="p-4">
                    <div className="text-sm font-semibold text-slate-100">Owner and lifecycle actions</div>
                    <div className="mt-3 space-y-3">
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs font-semibold text-slate-400">Owner</div>
                        <div className="mt-2 flex gap-2">
                          <Input
                            value={selected.owner ?? ''}
                            onChange={(v) => setSelected((prev) => (prev ? { ...prev, owner: v } : prev))}
                            placeholder="e.g., platform-sre"
                          />
                          <Button variant="secondary" onClick={() => patchProblem(selected.id, { owner: selected.owner ?? '' })}>
                            Save
                          </Button>
                        </div>
                      </div>

                      {selected.status === 'INCIDENT_LINKED' ? (
                        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                          <div className="text-xs font-semibold text-slate-400">Record root cause</div>
                          <div className="mt-2 flex gap-2">
                            <Input
                              value={rootCauseDraft}
                              onChange={setRootCauseDraft}
                              placeholder="Summarize the identified root cause"
                            />
                            <Button variant="secondary" onClick={() => transitionProblem(selected.id, 'rootCause', { rootCause: rootCauseDraft })}>
                              Record
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      {selected.status === 'ROOT_CAUSE_IDENTIFIED' ? (
                        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                          <div className="text-xs font-semibold text-slate-400">Mark known error</div>
                          <div className="mt-2 flex gap-2">
                            <Input
                              value={knownErrorDraft}
                              onChange={setKnownErrorDraft}
                              placeholder="Document the known error statement"
                            />
                            <Button variant="secondary" onClick={() => transitionProblem(selected.id, 'knownError', { knownError: knownErrorDraft })}>
                              Mark
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      {selected.status === 'KNOWN_ERROR' ? (
                        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                          <div className="text-xs font-semibold text-slate-400">Close problem</div>
                          <div className="mt-2 flex items-center justify-between gap-2 text-sm text-slate-300">
                            <span>Close only after the known error has been captured.</span>
                            <Button variant="secondary" onClick={() => transitionProblem(selected.id, 'close')}>
                              Close problem
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </Card>
                </>
              ) : null}

              {tab === 'incidents' ? (
                <Card className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-100">Linked incidents</div>
                      <div className="mt-1 text-sm text-slate-400">Attach persisted incidents before root-cause analysis can advance.</div>
                    </div>
                    {selected.status === 'CREATED' ? (
                      <div className="flex items-center gap-2">
                        <Input value={linkIncidentId} onChange={setLinkIncidentId} placeholder="Incident id" className="w-[160px]" />
                        <Button variant="secondary" onClick={() => linkIncident(selected.id, linkIncidentId)} disabled={!linkIncidentId.trim()}>
                          <Link2 className="h-4 w-4" />
                          Link incident
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 space-y-2">
                    {(selected.linkedIncidents ?? []).length ? (
                      selected.linkedIncidents!.slice(0, 20).map((li) => (
                        <div key={li.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-100">#{li.id}</div>
                            <div className="mt-0.5 truncate text-xs text-slate-400">{li.title ?? '—'}</div>
                          </div>
                          <Button variant="ghost" onClick={() => router.push(`/incidents?q=${encodeURIComponent(li.id)}`)}>
                            <ExternalLink className="h-4 w-4" />
                            Open
                          </Button>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-slate-400">No linked incidents.</div>
                    )}
                  </div>

                  {!fromIncident ? (
                    <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-200">
                      Tip: open an incident and click “Create problem”, then you’ll land here with <code className="rounded bg-black/30 px-1 py-0.5">?from=INCIDENT</code>.
                    </div>
                  ) : null}
                </Card>
              ) : null}

              {tab === 'impact' ? (
                <Card className="p-4">
                  <div className="text-sm font-semibold text-slate-100">Impact</div>
                  <div className="mt-2 text-sm text-slate-300">
                    Affected CIs from this problem payload:
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(selected.affectedCis ?? []).length ? (
                      selected.affectedCis!.slice(0, 30).map((ci) => (
                        <span key={ci} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200">
                          {ci}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-slate-400">No affected CIs provided.</span>
                    )}
                  </div>
                  <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
                    Use CMDB impact analysis for expanded relationship traversal.
                  </div>
                </Card>
              ) : null}

              {tab === 'evidence' ? (
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-100">Evidence</div>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        navigator.clipboard.writeText(JSON.stringify({ id: selected.id, evidence: selected.evidence, citations: selected.citations }, null, 2))
                      }
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </Button>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs font-semibold text-slate-400">Evidence blob</div>
                    <pre className="mt-2 max-h-[240px] overflow-auto whitespace-pre-wrap text-xs text-slate-200">
                      {selected.evidence?.trim() ? selected.evidence : 'No evidence attached.'}
                    </pre>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs font-semibold text-slate-400">Citations</div>
                    {selected.citations?.length ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                        {selected.citations.slice(0, 10).map((c, idx) => (
                          <li key={idx}>{c}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-2 text-sm text-slate-400">No citations attached.</div>
                    )}
                  </div>
                </Card>
              ) : null}
            </div>
          )}
        </Drawer>
      </div>
    </div>
  );
}

