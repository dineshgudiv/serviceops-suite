'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, Legend } from 'recharts';
import { Button, Card, EmptyState, FraudPage } from '../../components/fraud/FraudUi';
import { useFraudServerWorkspace } from '../../hooks/useFraudServerWorkspace';
import type { ServerCaseRecord } from '../../lib/fraud/server-types';

const CASE_STATUSES = ['new', 'under_review', 'escalated', 'confirmed_fraud', 'false_positive', 'closed'] as const;

export default function CasesPage() {
  const { activeDataset, getCasesPage, latestRun, mutateCase, ready, workspace } = useFraudServerWorkspace();
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ServerCaseRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [savingCaseId, setSavingCaseId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const pageSize = 24;
  const allCases = useMemo(() => (activeDataset ? (workspace?.cases ?? []).filter((item) => item.datasetId === activeDataset.id) : []), [activeDataset, workspace?.cases]);

  useEffect(() => {
    if (!activeDataset?.id) return;
    void getCasesPage(activeDataset.id, page, pageSize).then((result) => {
      setRows(result.rows);
      setTotal(result.total);
    });
  }, [activeDataset?.id, getCasesPage, page]);

  const statusData = ['new', 'under_review', 'escalated', 'confirmed_fraud', 'false_positive', 'closed']
    .map((status) => ({ status, count: allCases.filter((item) => item.status === status).length }))
    .filter((item) => item.count > 0);
  const severityData = ['critical', 'high', 'medium', 'low']
    .map((severity) => ({ severity, count: allCases.filter((item) => item.severity === severity).length }))
    .filter((item) => item.count > 0);
  const labelSourceData = ['ground_truth', 'derived_only']
    .map((source) => ({ source, count: allCases.filter((item) => item.caseLabelSource === source).length }))
    .filter((item) => item.count > 0);
  const resolutionData = [
    { label: 'Confirmed fraud', count: allCases.filter((item) => item.status === 'confirmed_fraud').length },
    { label: 'False positive', count: allCases.filter((item) => item.status === 'false_positive').length },
  ].filter((item) => item.count > 0);

  async function refreshCases(nextPage = page) {
    if (!activeDataset?.id) return;
    const result = await getCasesPage(activeDataset.id, nextPage, pageSize);
    setRows(result.rows);
    setTotal(result.total);
  }

  async function applyCaseUpdate(caseId: string, payload: { status?: typeof CASE_STATUSES[number]; note?: string }) {
    if (!activeDataset?.id) return;
    setSavingCaseId(caseId);
    try {
      await mutateCase(activeDataset.id, caseId, payload);
      if (payload.note) {
        setDraftNotes((current) => ({ ...current, [caseId]: '' }));
      }
      await refreshCases();
    } finally {
      setSavingCaseId(null);
    }
  }

  return (
    <FraudPage eyebrow="CASES AT SCALE" title="Cases" description="Paged fraud investigations with status analytics, severity mix, and linked reasoning from suspicious rows.">
      {!ready ? <EmptyState title="Loading case workspace" detail="Restoring the active dataset and server-side case summaries." /> : null}
      {ready && !activeDataset ? <EmptyState title="No active dataset" detail="Upload and analyze a dataset before reviewing generated cases." ctaHref="/data-upload" ctaLabel="Open Data Upload" /> : null}
      {ready && activeDataset && total === 0 ? <EmptyState title="No cases generated" detail="Run fraud detection to create investigation cases from suspicious transactions." ctaHref="/fraud-detection" ctaLabel="Open Fraud Detection" /> : null}
      {total > 0 ? (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <Card>
              <div className="text-sm font-semibold text-slate-100">Case status distribution</div>
              <div className="mt-1 text-xs text-slate-400">Generated from active dataset cases only.</div>
              <div className="mt-4 h-64">
                {statusData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusData} dataKey="count" nameKey="status" innerRadius={50} outerRadius={85}>
                        {statusData.map((entry, index) => <Cell key={entry.status} fill={['#38bdf8', '#22c55e', '#f97316', '#ef4444', '#facc15', '#94a3b8'][index % 6]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">No status distribution available yet.</div>
                )}
              </div>
            </Card>
            <Card>
              <div className="text-sm font-semibold text-slate-100">Severity / risk band mix</div>
              <div className="mt-1 text-xs text-slate-400">Shows how case severity is distributed across the queue.</div>
              <div className="mt-4 h-64">
                {severityData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={severityData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="severity" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#a78bfa" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">No case severity distribution is available yet.</div>
                )}
              </div>
            </Card>
            <Card>
              <div className="text-sm font-semibold text-slate-100">Resolution outcomes</div>
              <div className="mt-1 text-xs text-slate-400">Shows the current fraud-vs-false-positive split for resolved investigations.</div>
              <div className="mt-4 h-64">
                {resolutionData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={resolutionData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="label" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#22c55e" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">No resolved case outcomes are available yet.</div>
                )}
              </div>
            </Card>
            <Card>
              <div className="text-sm font-semibold text-slate-100">Case label source</div>
              <div className="mt-1 text-xs text-slate-400">Shows whether cases were generated from ground truth or derived-only risk labels.</div>
              <div className="mt-4 h-64">
                {labelSourceData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={labelSourceData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="source" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">No case source breakdown is available yet.</div>
                )}
              </div>
            </Card>
          </div>

          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Generated cases</div>
                <div className="mt-1 text-xs text-slate-400">{latestRun?.metrics.labelExplanation ?? 'Derived risk labels are analyst-support outputs when no source fraud label column is available.'}</div>
              </div>
              <div className="text-xs text-slate-400">{total.toLocaleString()} cases | page {page} of {Math.max(1, Math.ceil(total / pageSize))}</div>
            </div>
            <div className="mt-4 space-y-3">
              {rows.map((item: ServerCaseRecord) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-100">{item.title}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.id} | {item.transactionId} | {item.customerId ?? 'Unknown customer'} | {item.merchantId ?? 'Unknown merchant'}</div>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs uppercase tracking-wide text-slate-100">{item.status}</div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100">Severity: {item.severity}</div>
                    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100">Combined risk: {item.combinedRiskScore}</div>
                    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100">Anomaly score: {item.anomalyScore}</div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100">Derived label: {item.derivedRiskLabel ?? 'Not generated'}</div>
                    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100">Case source: {item.caseLabelSource ?? 'derived_only'}</div>
                    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100">Final risk position: {item.finalRecommendation}</div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100">Resolution outcome: {item.status === 'confirmed_fraud' ? 'Confirmed fraud' : item.status === 'false_positive' ? 'False positive' : 'Open investigation'}</div>
                    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100">Linked transaction: {item.transactionId}</div>
                    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100">Linked evidence references: {item.linkedDocumentIds.length}</div>
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-xl border border-red-400/15 bg-red-500/5 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-red-200">Why Flagged</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">{item.whyFlagged.map((reason) => <li key={`${item.id}-${reason}`}>{reason}</li>)}</ul>
                    </div>
                    <div className="rounded-xl border border-emerald-400/15 bg-emerald-500/5 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Why It May Be Legitimate</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">{item.whyLegit.map((reason) => <li key={`${item.id}-legit-${reason}`}>{reason}</li>)}</ul>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">Recommended Action: {item.recommendedAction}</div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Case workflow</div>
                      <select
                        value={item.status}
                        onChange={(event) => void applyCaseUpdate(item.id, { status: event.target.value as typeof CASE_STATUSES[number] })}
                        disabled={savingCaseId === item.id}
                        className="mt-3 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none disabled:opacity-50"
                      >
                        {CASE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                      <div className="mt-3 text-xs text-slate-400">Reviewed by: {item.reviewedBy ?? 'Not reviewed yet'} | {item.reviewedAt ? new Date(item.reviewedAt).toLocaleString() : 'No review timestamp'}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Analyst notes</div>
                      <textarea
                        value={draftNotes[item.id] ?? item.note ?? ''}
                        onChange={(event) => setDraftNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                        placeholder="Capture analyst observations, linked evidence references, or resolution details"
                        className="mt-3 min-h-[96px] w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none"
                      />
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="text-xs text-slate-400">Latest note is stored in the shared server-backed case workspace.</div>
                        <Button
                          variant="secondary"
                          onClick={() => void applyCaseUpdate(item.id, { note: draftNotes[item.id] ?? item.note ?? '' })}
                          disabled={savingCaseId === item.id || !((draftNotes[item.id] ?? item.note ?? '').trim())}
                        >
                          Save note
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Disposition history</div>
                    <div className="mt-2 space-y-2 text-sm text-slate-300">
                      {item.dispositionHistory.length ? item.dispositionHistory.slice(0, 4).map((event) => (
                        <div key={`${item.id}-${event.at}-${event.disposition}`} className="rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2">
                          {new Date(event.at).toLocaleString()} | {event.actor} | {event.disposition}{event.note ? ` | ${event.note}` : ''}
                        </div>
                      )) : <div className="text-slate-400">No disposition history recorded for this case yet.</div>}
                    </div>
                  </div>
                </div>
              ))}
              <div className="mt-4 flex items-center justify-between gap-3">
                <Button variant="secondary" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>Previous</Button>
                <div className="text-xs text-slate-400">Cases are paged to avoid rendering large DOM trees.</div>
                <Button variant="secondary" onClick={() => setPage((value) => (value * pageSize < total ? value + 1 : value))} disabled={page * pageSize >= total}>Next</Button>
              </div>
            </div>
          </Card>
        </>
      ) : null}
    </FraudPage>
  );
}
