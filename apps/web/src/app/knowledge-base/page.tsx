 'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  Download,
  FileText,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';

/**
 * IMPORTANT:
 * Update these endpoints to match your real BFF routes.
 * This page uses evidence-only rendering: answers must include citations/spans if provided.
 */
const API = {
  listDocs: '/api/bff/knowledge/documents',
  uploadDoc: '/api/bff/knowledge/documents',
  ask: '/api/bff/knowledge/ask', // POST { question }
};

type ApiError = {
  status?: number;
  code?: string;
  message?: string;
  request_id?: string;
  raw?: string;
};

type DocItem = {
  id: string;
  title: string;
  source?: string; // runbook/wiki/upload
  approvalStatus?: string;
  visibility?: string;
  tags?: string[];
  updatedAt?: string;
  createdAt?: string;
  excerpt?: string;
};

type EvidenceSpan = {
  doc_id?: string;
  doc_title?: string;
  start?: number;
  end?: number;
  text: string; // support span preview
};

type AskResponse = {
  answer: string;
  citations?: Array<{ doc_id: string; doc_title?: string; quote?: string }>;
  evidence_spans?: EvidenceSpan[];
  refusal?: { code: string; message: string };
  request_id?: string;
  latency_ms?: number;
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
              <div className="text-sm font-semibold text-slate-100">Knowledge Base failed</div>
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

export default function KnowledgeBasePage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<ApiError | null>(null);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const lastFetchAt = useRef<number>(0);

  const [q, setQ] = useState('');
  const [tag, setTag] = useState('ALL');

  const [selected, setSelected] = useState<DocItem | null>(null);

  // Ask panel state
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [askErr, setAskErr] = useState<ApiError | null>(null);
  const [answer, setAnswer] = useState<AskResponse | null>(null);

  async function loadDocs() {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiFetch<Paged<DocItem> | DocItem[]>(API.listDocs);
      const items = Array.isArray(res) ? res : res.items;

      const norm: DocItem[] = items
        .map((x: any) => ({
          id: String(x.id ?? x.doc_id ?? x.key ?? ''),
          title: String(x.title ?? x.name ?? 'Untitled doc'),
          source: x.source ?? x.kind ?? 'unknown',
          approvalStatus: x.approval_status ?? x.approvalStatus ?? 'approved',
          visibility: x.visibility ?? 'viewer',
          tags: Array.isArray(x.tags) ? x.tags : [],
          updatedAt: x.updatedAt ?? x.updated_at,
          createdAt: x.createdAt ?? x.created_at,
          excerpt: x.excerpt ?? x.summary ?? '',
        }))
        .filter((d) => d.id);

      setDocs(norm);
      lastFetchAt.current = Date.now();
      if (!selected && norm.length) setSelected(norm[0]);
    } catch (e: any) {
      setErr(e as ApiError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tags = useMemo(() => {
    const s = new Set<string>();
    docs.forEach((d) => (d.tags ?? []).forEach((t) => s.add(String(t))));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [docs]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return docs.filter((d) => {
      if (tag !== 'ALL' && !(d.tags ?? []).includes(tag)) return false;
      if (!qq) return true;
      const hay = `${d.id} ${d.title} ${(d.tags ?? []).join(' ')} ${d.source ?? ''} ${d.excerpt ?? ''}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [docs, q, tag]);

  async function ask() {
    setAskErr(null);
    setAnswer(null);
    const qn = question.trim();
    if (!qn) return;
    setAsking(true);
    try {
      const res = await apiFetch<AskResponse>(API.ask, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: qn }),
      });
      setAnswer(res);
    } catch (e: any) {
      setAskErr(e as ApiError);
    } finally {
      setAsking(false);
    }
  }

  function exportEvidence() {
    if (!answer) return;
    const obj = {
      question,
      answer: answer.answer,
      citations: answer.citations ?? [],
      evidence_spans: answer.evidence_spans ?? [],
      request_id: answer.request_id,
      latency_ms: answer.latency_ms,
    };
    const text = JSON.stringify(obj, null, 2);
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kb-ask-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="min-h-[calc(100vh-140px)] bg-[radial-gradient(1200px_circle_at_20%_-10%,rgba(56,189,248,0.18),transparent_40%),radial-gradient(900px_circle_at_90%_0%,rgba(168,85,247,0.14),transparent_35%),radial-gradient(800px_circle_at_50%_120%,rgba(34,197,94,0.10),transparent_45%)] px-5 py-5">
      <div className="mx-auto max-w-[1400px]">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold tracking-wide text-slate-400">KNOWLEDGE</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-100">Knowledge Base</h1>
            <p className="mt-1 text-sm text-slate-400">
              Runbooks, postmortems, and operational docs with evidence-only RAG answering.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={loadDocs} disabled={loading}>
              <RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-12 gap-4">
          {/* LEFT: docs */}
          <div className="col-span-12 lg:col-span-5 space-y-4">
            <Card className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full max-w-[420px]">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input value={q} onChange={setQ} placeholder="Search docs by title, tag, excerpt…" className="pl-9" />
                </div>

                <select
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  className="h-10 rounded-xl border border-white/10 bg-slate-950/50 px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                >
                  <option value="ALL" className="bg-slate-950">
                    All tags
                  </option>
                  {tags.map((t) => (
                    <option key={t} value={t} className="bg-slate-950">
                      {t}
                    </option>
                  ))}
                </select>

                <div className="ml-auto text-xs text-slate-400">
                  {filtered.length} doc(s) • updated {lastFetchAt.current ? new Date(lastFetchAt.current).toLocaleTimeString() : '—'}
                </div>
              </div>

              <div className="mt-3">
                {err ? (
                  <ErrorState err={err} onRetry={loadDocs} />
                ) : loading ? (
                  <div className="p-3">
                    <SkeletonLines />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="py-10 text-center">
                    <div className="text-sm font-semibold text-slate-200">No docs found</div>
                    <div className="mt-1 text-sm text-slate-400">Try changing the search or tag filter.</div>
                  </div>
                ) : (
                  <div className="max-h-[560px] overflow-auto rounded-2xl border border-white/10 bg-white/5">
                    {filtered.map((d) => {
                      const active = selected?.id === d.id;
                      return (
                        <button
                          key={d.id}
                          onClick={() => setSelected(d)}
                          className={cx(
                            'w-full border-b border-white/5 px-4 py-3 text-left hover:bg-white/5',
                            active && 'bg-sky-500/10'
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-slate-400" />
                               <div className="truncate text-sm font-semibold text-slate-100">{d.title}</div>
                              </div>
                              <div className="mt-1 line-clamp-2 text-xs text-slate-400">{d.excerpt ?? '—'}</div>
                            </div>
                            <div className="shrink-0 text-right text-xs text-slate-400">
                              <div>{d.source ?? '—'}</div>
                              <div>{d.approvalStatus ?? 'approved'} • {d.visibility ?? 'viewer'}</div>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(d.tags ?? []).slice(0, 4).map((t) => (
                              <span key={t} className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] text-slate-200">
                                {t}
                              </span>
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>

            {/* Upload stub (UI only unless endpoint exists) */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-100">Upload document</div>
                  <div className="mt-1 text-xs text-slate-400">
                    Upload endpoint is configured and can accept document payloads.
                  </div>
                </div>
                <Upload className="h-4 w-4 text-slate-400" />
              </div>

              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
                This UI is intentionally safe: it does not fake uploads. Implement the backend route, then we wire it.
              </div>
            </Card>
          </div>

          {/* RIGHT: Ask panel + selected doc preview */}
          <div className="col-span-12 lg:col-span-7 space-y-4">
            <Card className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-100">Ask the Knowledge Base</div>
                  <div className="mt-1 text-xs text-slate-400">
                    Evidence-only: answers must include citations/spans when available.
                  </div>
                </div>
                <Sparkles className="h-4 w-4 text-slate-400" />
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g., How do we mitigate database timeout errors safely?"
                  className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') ask();
                  }}
                />
                <Button onClick={ask} disabled={asking || !question.trim()}>
                  {asking ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Asking…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Ask
                    </>
                  )}
                </Button>
              </div>

              {askErr ? (
                <div className="mt-4">
                  <ErrorState err={askErr} onRetry={ask} />
                </div>
              ) : null}

              {answer ? (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-slate-400">
                      request_id: <span className="text-slate-200">{answer.request_id ?? '—'}</span> • latency:{' '}
                      <span className="text-slate-200">{answer.latency_ms ?? '—'}ms</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        onClick={() =>
                          navigator.clipboard.writeText(
                            JSON.stringify(
                              {
                                question,
                                answer: answer.answer,
                                citations: answer.citations,
                                evidence_spans: answer.evidence_spans,
                                request_id: answer.request_id,
                                latency_ms: answer.latency_ms,
                              },
                              null,
                              2
                            )
                          )
                        }
                      >
                        <Copy className="h-4 w-4" />
                        Copy
                      </Button>
                      <Button variant="secondary" onClick={exportEvidence}>
                        <Download className="h-4 w-4" />
                        Export
                      </Button>
                    </div>
                  </div>

                  <Card className="p-4">
                    <div className="text-xs font-semibold text-slate-400">Answer</div>
                    {answer.refusal ? (
                      <div className="mt-2 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-200">
                        {answer.refusal.code}: {answer.refusal.message}
                      </div>
                    ) : (
                      <div className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{answer.answer}</div>
                    )}
                  </Card>

                  <Card className="p-4">
                    <div className="text-xs font-semibold text-slate-400">Citations</div>
                    {(answer.citations ?? []).length ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                        {answer.citations!.slice(0, 10).map((c, idx) => (
                          <li key={idx}>
                            <span className="font-semibold text-slate-200">{c.doc_title ?? c.doc_id}</span>
                            {c.quote ? <span className="text-slate-400"> — “{c.quote}”</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-2 text-sm text-slate-400">No citations returned.</div>
                    )}
                  </Card>

                  <Card className="p-4">
                    <div className="text-xs font-semibold text-slate-400">Evidence spans</div>
                    {(answer.evidence_spans ?? []).length ? (
                      <div className="mt-2 space-y-2">
                        {answer.evidence_spans!.slice(0, 8).map((s, idx) => (
                          <div key={idx} className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="text-xs text-slate-400">
                              <span className="text-slate-200">{s.doc_title ?? s.doc_id ?? 'doc'}</span>
                            </div>
                            <div className="mt-2 whitespace-pre-wrap text-xs text-slate-200">{s.text}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-slate-400">No evidence spans returned.</div>
                    )}
                  </Card>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  Ask a question to see an evidence-backed answer. If your backend returns no citations/spans, you should treat
                  that as a quality failure and fix retrieval/evidence wiring.
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-100">Selected doc preview</div>
                  <div className="mt-1 text-xs text-slate-400">Shows excerpt metadata only (safe preview).</div>
                </div>
                <FileText className="h-4 w-4 text-slate-400" />
              </div>

              {!selected ? (
                <div className="mt-3 text-sm text-slate-400">Select a document on the left.</div>
              ) : (
                <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-sm font-semibold text-slate-100">{selected.title}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {selected.source ?? '—'} • updated {fmtDateTime(selected.updatedAt ?? selected.createdAt)}
                  </div>
                  <div className="mt-3 whitespace-pre-wrap text-sm text-slate-200">{selected.excerpt ?? '—'}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(selected.tags ?? []).map((t) => (
                      <span key={t} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-200">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
