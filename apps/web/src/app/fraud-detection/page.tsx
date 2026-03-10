'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, Legend } from 'recharts';
import { Button, Card, EmptyState, FraudPage } from '../../components/fraud/FraudUi';
import { useFraudServerWorkspace } from '../../hooks/useFraudServerWorkspace';
import type { FlaggedDetailResponse, FlaggedQuery, ServerFlaggedRow } from '../../lib/fraud/server-types';

const STATUS_OPTIONS = ['new', 'under_investigation', 'confirmed_fraud', 'false_positive', 'closed'] as const;

function compactEntityLabel(value: string) {
  const text = String(value ?? '');
  if (text.length <= 10) return text;
  return `${text.slice(0, 4)}...${text.slice(-3)}`;
}

export default function FraudDetectionPage() {
  const { activeDataset, latestRun, getFlaggedDetail, getFlaggedPage, mutateFlaggedRow, ready, runDetection, runDetectionError, workspace } = useFraudServerWorkspace();
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ServerFlaggedRow[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<FlaggedQuery>({ sortBy: 'combinedRiskScore', sortDir: 'desc' });
  const [selectedRow, setSelectedRow] = useState<ServerFlaggedRow | null>(null);
  const [detail, setDetail] = useState<FlaggedDetailResponse | null>(null);
  const [noteText, setNoteText] = useState('');
  const pageSize = 50;
  const activeReport = activeDataset ? workspace?.reports.find((item) => item.datasetId === activeDataset.id) ?? null : null;

  useEffect(() => {
    if (!activeDataset?.id) return;
    const nextQuery = { ...filters, query: query || undefined };
    void getFlaggedPage(activeDataset.id, page, pageSize, nextQuery).then((result) => {
      setRows(result.rows);
      setTotal(result.total);
      if (selectedRow) {
        const refreshed = result.rows.find((row) => row.id === selectedRow.id);
        if (refreshed) setSelectedRow(refreshed);
      }
    });
  }, [activeDataset?.id, filters, getFlaggedPage, page, query, selectedRow]);

  useEffect(() => {
    if (!activeDataset?.id || !selectedRow?.id) {
      setDetail(null);
      return;
    }
    void getFlaggedDetail(activeDataset.id, selectedRow.id).then(setDetail);
  }, [activeDataset?.id, getFlaggedDetail, selectedRow?.id]);

  const topMerchants = useMemo(
    () => (latestRun?.topRiskEntities ?? []).filter((item) => item.entityType === 'Merchant').slice(0, 6).map((item) => ({ label: item.value, suspiciousCount: item.suspiciousCount })),
    [latestRun?.topRiskEntities]
  );
  const topCustomers = useMemo(
    () => (latestRun?.topRiskEntities ?? []).filter((item) => item.entityType === 'Customer').slice(0, 6).map((item) => ({ label: item.value, suspiciousCount: item.suspiciousCount })),
    [latestRun?.topRiskEntities]
  );
  const anomalyDistribution = latestRun?.anomalyScoreDistribution ?? [];
  const riskBandDistribution = latestRun?.riskBandDistribution ?? [];
  const featuresUsed = latestRun?.featuresUsed ?? [];
  const thresholdPreview = useMemo(() => {
    const currentThreshold = latestRun?.threshold ?? workspace?.settings.anomalyThreshold ?? 0.92;
    const previewThreshold = Math.max(0.1, Number((currentThreshold - 0.1).toFixed(2)));
    const estimatedCount = anomalyDistribution.reduce((sum, bucket) => {
      const start = Number(bucket.bucket.split('-')[0]);
      return start >= previewThreshold ? sum + bucket.count : sum;
    }, 0);
    return { currentThreshold, previewThreshold, estimatedCount };
  }, [anomalyDistribution, latestRun?.threshold, workspace?.settings.anomalyThreshold]);

  async function applyRowAction(rowId: string, payload: Parameters<typeof mutateFlaggedRow>[2]) {
    if (!activeDataset?.id) return;
    await mutateFlaggedRow(activeDataset.id, rowId, payload);
    const result = await getFlaggedPage(activeDataset.id, page, pageSize, { ...filters, query: query || undefined });
    setRows(result.rows);
    setTotal(result.total);
    if (selectedRow?.id === rowId) {
      const refreshed = result.rows.find((row) => row.id === rowId) ?? selectedRow;
      setSelectedRow(refreshed);
      const nextDetail = await getFlaggedDetail(activeDataset.id, rowId);
      setDetail(nextDetail);
    }
  }

  return (
    <FraudPage
      eyebrow="INVESTIGATION WORKSPACE"
      title="Fraud Detection"
      description="Server-backed suspicious-row investigation with search, filters, sorting, drill-down analysis, and case actions."
      actions={
        <>
          <Button onClick={() => activeDataset && void runDetection(activeDataset.id)} disabled={!activeDataset}>Run detection</Button>
          {activeReport ? (
            <a href={`/api/fraud/reports/${activeReport.id}/download`} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/90 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500">
              Download full report
            </a>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-400">
              Run detection to generate a downloadable report
            </span>
          )}
        </>
      }
    >
      {!ready ? <EmptyState title="Loading fraud workspace" detail="Restoring the active dataset, suspicious-row pages, and latest analysis summaries." /> : null}
      {ready && !activeDataset ? <EmptyState title="No dataset available" detail="Upload a dataset before running fraud detection." ctaHref="/data-upload" ctaLabel="Open Data Upload" /> : null}
      {ready && activeDataset && !latestRun ? <EmptyState title="No analysis run yet" detail="Run fraud detection to compute large-scale anomaly and rule-based fraud risk." /> : null}
      {ready && activeDataset && runDetectionError ? <Card className="border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">{runDetectionError}</Card> : null}
      {latestRun ? (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Run summary</div>
                <div className="mt-1 text-xs text-slate-400">Algorithm: {latestRun.algorithm} | Features: {featuresUsed.join(', ') || 'No usable features recorded'} | label mode {latestRun.metrics.labelMode ?? 'derived_only'}</div>
              </div>
              <div className="text-xs text-slate-400">{latestRun.metrics.totalTransactions.toLocaleString()} rows | {latestRun.metrics.suspiciousTransactions.toLocaleString()} suspicious | anomaly rate {latestRun.metrics.anomalyRate === null ? 'Not available' : `${(latestRun.metrics.anomalyRate * 100).toFixed(1)}%`}</div>
            </div>
            <div className="mt-3 rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-3 text-sm text-sky-100">{latestRun.metrics.labelExplanation ?? 'Derived risk labels were generated because no source fraud label column was provided.'}</div>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100">Anomaly threshold: {latestRun.threshold.toFixed(2)}</div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100">Contamination: {latestRun.contamination.toFixed(2)}</div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100">Derived high-risk threshold: {workspace?.settings.derivedHighRiskThreshold ?? 'n/a'}</div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100">Enabled rules: {workspace?.settings.enabledRules.length ?? 0}</div>
            </div>
            <div className="mt-3 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-3 text-sm text-amber-950">
              Threshold preview: lowering anomaly threshold from {thresholdPreview.currentThreshold.toFixed(2)} to {thresholdPreview.previewThreshold.toFixed(2)} would expose roughly {thresholdPreview.estimatedCount.toLocaleString()} rows from the current anomaly-score distribution.
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-4">
            <Card>
              <div className="text-sm font-semibold text-slate-100">Anomaly score histogram</div>
              <div className="mt-4 h-56">
                {anomalyDistribution.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={anomalyDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="bucket" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#22c55e" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="flex h-full items-center justify-center text-sm text-slate-400">No anomaly histogram is available yet.</div>}
              </div>
            </Card>
            <Card>
              <div className="text-sm font-semibold text-slate-100">Risk band distribution</div>
              <div className="mt-4 h-56">
                {riskBandDistribution.some((item) => item.count > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={riskBandDistribution} dataKey="count" nameKey="band" innerRadius={45} outerRadius={78}>
                        {riskBandDistribution.map((item) => <Cell key={item.band} fill={{ critical: '#ef4444', high: '#f97316', medium: '#facc15', low: '#22c55e' }[item.band]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <div className="flex h-full items-center justify-center text-sm text-slate-400">No risk-band breakdown is available yet.</div>}
              </div>
            </Card>
            <Card>
              <div className="text-sm font-semibold text-slate-100">Top suspicious merchants</div>
              <div className="mt-4 h-56">
                {topMerchants.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topMerchants}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="label" stroke="#94a3b8" interval={0} angle={-25} textAnchor="end" height={72} tickFormatter={compactEntityLabel} />
                      <YAxis stroke="#94a3b8" allowDecimals={false} />
                      <Tooltip formatter={(value) => [value, 'Suspicious rows']} labelFormatter={(label) => `Merchant: ${label}`} />
                      <Bar dataKey="suspiciousCount" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="flex h-full items-center justify-center text-sm text-slate-400">No merchant aggregates are available for this run.</div>}
              </div>
            </Card>
            <Card>
              <div className="text-sm font-semibold text-slate-100">Top suspicious customers</div>
              <div className="mt-4 h-56">
                {topCustomers.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topCustomers}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="label" stroke="#94a3b8" interval={0} angle={-25} textAnchor="end" height={72} tickFormatter={compactEntityLabel} />
                      <YAxis stroke="#94a3b8" allowDecimals={false} />
                      <Tooltip formatter={(value) => [value, 'Suspicious rows']} labelFormatter={(label) => `Customer: ${label}`} />
                      <Bar dataKey="suspiciousCount" fill="#a78bfa" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="flex h-full items-center justify-center text-sm text-slate-400">No customer aggregates are available for this run.</div>}
              </div>
            </Card>
          </div>

          <Card>
            <div className="grid gap-3 xl:grid-cols-7">
              <input value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder="Search transaction, customer, merchant, or device id" className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none xl:col-span-2" />
              <select value={filters.riskBand ?? ''} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, riskBand: event.target.value || undefined })); }} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100 outline-none">
                <option value="">All risk bands</option>
                <option value="critical">critical</option>
                <option value="high">high</option>
                <option value="medium">medium</option>
                <option value="low">low</option>
              </select>
              <select value={filters.confidence ?? ''} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, confidence: event.target.value || undefined })); }} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100 outline-none">
                <option value="">All confidence</option>
                <option value="high">high</option>
                <option value="medium">medium</option>
                <option value="low">low</option>
              </select>
              <input value={String(filters.minAmount ?? '')} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, minAmount: event.target.value ? Number(event.target.value) : undefined })); }} placeholder="Min amount" type="number" className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100 outline-none" />
              <input value={String(filters.maxAmount ?? '')} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, maxAmount: event.target.value ? Number(event.target.value) : undefined })); }} placeholder="Max amount" type="number" className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100 outline-none" />
              <input value={filters.merchant ?? ''} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, merchant: event.target.value || undefined })); }} placeholder="Merchant" className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100 outline-none" />
              <input value={filters.customer ?? ''} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, customer: event.target.value || undefined })); }} placeholder="Customer" className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100 outline-none" />
            </div>
            <div className="mt-3 grid gap-3 xl:grid-cols-5">
              <input value={filters.timeFrom ?? ''} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, timeFrom: event.target.value || undefined })); }} type="date" className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100 outline-none" />
              <input value={filters.timeTo ?? ''} onChange={(event) => { setPage(1); setFilters((current) => ({ ...current, timeTo: event.target.value || undefined })); }} type="date" className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100 outline-none" />
              <select value={filters.sortBy ?? 'combinedRiskScore'} onChange={(event) => setFilters((current) => ({ ...current, sortBy: event.target.value as FlaggedQuery['sortBy'] }))} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100 outline-none">
                <option value="combinedRiskScore">Sort by risk score</option>
                <option value="anomalyScore">Sort by anomaly score</option>
                <option value="amount">Sort by amount</option>
                <option value="timestamp">Sort by timestamp</option>
              </select>
              <select value={filters.sortDir ?? 'desc'} onChange={(event) => setFilters((current) => ({ ...current, sortDir: event.target.value as FlaggedQuery['sortDir'] }))} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100 outline-none">
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
              <Button variant="secondary" onClick={() => { setQuery(''); setPage(1); setFilters({ sortBy: 'combinedRiskScore', sortDir: 'desc' }); }}>Reset filters</Button>
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[1.45fr_0.9fr]">
            <Card>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-100">Suspicious rows</div>
                <div className="text-xs text-slate-400">Server-side page {page} of {Math.max(1, Math.ceil(total / pageSize))} | {total.toLocaleString()} filtered suspicious rows</div>
              </div>
              {total === 0 ? (
                <div className="mt-4 text-sm text-slate-400">No suspicious rows matched the current filters.</div>
              ) : (
                <div className="mt-4 space-y-3">
                  {rows.map((row) => (
                    <div key={row.id} className={`rounded-2xl border p-4 ${selectedRow?.id === row.id ? 'border-sky-400/35 bg-sky-500/10' : 'border-white/10 bg-white/5'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <button type="button" onClick={() => setSelectedRow(row)} className="text-left">
                          <div className="text-sm font-semibold text-slate-100">{row.transactionId}</div>
                          <div className="mt-1 text-xs text-slate-400">{row.customerId ?? 'Unknown customer'} • {row.merchantId ?? 'Unknown merchant'} • {row.deviceId ?? 'Unknown device'} • {row.amount ?? 'No amount'}</div>
                        </button>
                        <div className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-100">{row.finalRecommendation}</div>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-5">
                        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100">Anomaly: {row.anomalyScore}</div>
                        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100">Risk: {row.combinedRiskScore}</div>
                        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100">Band: {row.riskBand}</div>
                        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100">Confidence: {row.confidenceLevel}</div>
                        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100">Status: {row.investigationStatus ?? 'new'}</div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => void applyRowAction(row.id, { action: 'create_case' })}>Create Case</Button>
                        <Button variant="secondary" onClick={() => void applyRowAction(row.id, { action: 'mark_fraud' })}>Mark Fraud</Button>
                        <Button variant="secondary" onClick={() => void applyRowAction(row.id, { action: 'mark_legitimate' })}>Mark Legitimate</Button>
                      </div>
                    </div>
                  ))}
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <Button variant="secondary" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>Previous</Button>
                    <div className="text-xs text-slate-400">Filtering, searching, sorting, and paging stay server-side for large suspicious populations.</div>
                    <Button variant="secondary" onClick={() => setPage((value) => (value * pageSize < total ? value + 1 : value))} disabled={page * pageSize >= total}>Next</Button>
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <div className="text-sm font-semibold text-slate-100">Transaction drill-down</div>
              {!selectedRow ? (
                <div className="mt-4 text-sm text-slate-400">Select a suspicious row to inspect transaction metadata, history, related suspicious activity, and case actions.</div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
                    <div className="font-semibold text-slate-100">{selectedRow.transactionId}</div>
                    <div className="mt-1 text-xs text-slate-400">{selectedRow.timestamp ?? 'No timestamp'} | {selectedRow.location ?? 'No location'} | label source {selectedRow.labelSource}</div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">Customer history: {detail?.customerHistory.length ?? 0} suspicious rows sharing {selectedRow.customerId ?? 'this customer'}.</div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">Device history: {detail?.deviceHistory.length ?? 0} suspicious rows sharing {selectedRow.deviceId ?? 'this device'}.</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
                    Merchant profile: {detail?.merchantProfile.suspiciousCount ?? 0} suspicious rows | total suspicious amount {(detail?.merchantProfile.suspiciousAmount ?? 0).toLocaleString()}
                  </div>
                  <div className="rounded-xl border border-red-400/15 bg-red-500/5 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-red-200">Why Flagged</div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">{selectedRow.whyFlagged.map((item) => <li key={`${selectedRow.id}-${item}`}>{item}</li>)}</ul>
                  </div>
                  <div className="rounded-xl border border-emerald-400/15 bg-emerald-500/5 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Why It May Be Legitimate</div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-200">{selectedRow.whyLegit.map((item) => <li key={`${selectedRow.id}-legit-${item}`}>{item}</li>)}</ul>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Related suspicious transactions</div>
                    <div className="mt-2 space-y-2 text-sm text-slate-200">
                      {detail?.relatedTransactions.length ? detail.relatedTransactions.map((item) => (
                        <div key={item.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">{item.transactionId} | {item.customerId ?? 'Unknown customer'} | risk {item.combinedRiskScore}</div>
                      )) : <div className="text-slate-400">No related suspicious transactions were found for this row.</div>}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Investigation status</div>
                    <select value={selectedRow.investigationStatus ?? 'new'} onChange={(event) => void applyRowAction(selectedRow.id, { action: 'update_status', status: event.target.value as typeof STATUS_OPTIONS[number] })} className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none">
                      {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Evidence linking</div>
                    <div className="mt-2 space-y-2">
                      <textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Attach investigation note, PDF reference, or screenshot reference" className="min-h-[96px] w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none" />
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => { if (!noteText.trim()) return; void applyRowAction(selectedRow.id, { action: 'attach_evidence', evidenceType: 'note', evidenceValue: noteText.trim() }); setNoteText(''); }}>Attach note</Button>
                        <Button variant="secondary" onClick={() => { if (!noteText.trim()) return; void applyRowAction(selectedRow.id, { action: 'attach_evidence', evidenceType: 'document', evidenceValue: noteText.trim() }); setNoteText(''); }}>Attach PDF reference</Button>
                        <Button variant="secondary" onClick={() => { if (!noteText.trim()) return; void applyRowAction(selectedRow.id, { action: 'attach_evidence', evidenceType: 'screenshot_reference', evidenceValue: noteText.trim() }); setNoteText(''); }}>Attach screenshot reference</Button>
                      </div>
                      <div className="space-y-2 text-sm text-slate-200">
                        {(detail?.row?.evidenceLinks ?? selectedRow.evidenceLinks ?? []).length ? (detail?.row?.evidenceLinks ?? selectedRow.evidenceLinks ?? []).map((item, index) => (
                          <div key={`${item.type}-${item.at}-${index}`} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">{item.type}: {item.value}</div>
                        )) : <div className="text-slate-400">No evidence or investigation notes attached to this transaction yet.</div>}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </>
      ) : null}
    </FraudPage>
  );
}
