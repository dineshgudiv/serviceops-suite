'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, FileText, Play, RotateCcw, Upload } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button, Card, EmptyState, FraudPage } from '../../components/fraud/FraudUi';
import { useFraudServerWorkspace } from '../../hooks/useFraudServerWorkspace';
import type { FraudCanonicalField } from '../../lib/fraud/types';

const CANONICAL_FIELDS: Array<{ value?: FraudCanonicalField; label: string }> = [
  { label: 'Unmapped' },
  { value: 'transaction_id', label: 'transaction_id' },
  { value: 'timestamp', label: 'timestamp' },
  { value: 'amount', label: 'amount' },
  { value: 'customer_id', label: 'customer_id' },
  { value: 'merchant_id', label: 'merchant_id' },
  { value: 'device_id', label: 'device_id' },
  { value: 'location', label: 'location' },
  { value: 'fraud_label', label: 'fraud_label' },
];

function formatBytes(value?: number) {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export default function DataUploadPage() {
  const { activeDataset, cancelJob, cancelUpload, deleteDataset, getDatasetPreview, jobs, latestRun, normalizeResumablePickerError, pickResumableFile, refresh, resumableSessions, resumeUpload, runDetection, runDetectionError, setRunDetectionError, updateDatasetConfig, uploadState, uploadDataset, workspace, workspacePermissions } = useFraudServerWorkspace();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deletingDatasetId, setDeletingDatasetId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; page: number; pageSize: number; total: number; rows: Array<Record<string, string | number | boolean | null>> }>({ headers: [], page: 1, pageSize: 20, total: 0, rows: [] });
  const activeJob = useMemo(() => (activeDataset ? jobs.find((item) => item.id === activeDataset.latestJobId) ?? jobs[0] ?? null : jobs[0] ?? null), [activeDataset, jobs]);
  const activeReport = activeDataset ? workspace?.reports.find((item) => item.datasetId === activeDataset.id) ?? null : null;
  const canDeleteDatasets = workspacePermissions?.canDeleteDatasets ?? true;
  const criticalWarnings = useMemo(() => {
    if (!activeDataset) return [];
    const hasAmount = activeDataset.schema.some((field) => field.mappedTo === 'amount');
    const hasTimestamp = activeDataset.schema.some((field) => field.mappedTo === 'timestamp');
    const hasCustomer = activeDataset.schema.some((field) => field.mappedTo === 'customer_id');
    const hasMerchant = activeDataset.schema.some((field) => field.mappedTo === 'merchant_id');
    return [
      !hasAmount ? 'Amount column is missing. Map one before running analysis.' : null,
      !hasTimestamp ? 'Timestamp column is missing. Map one before running analysis.' : null,
      !hasCustomer ? 'Customer id is missing. Entity summaries will be limited.' : null,
      !hasMerchant ? 'Merchant id is missing. Merchant risk panels will be limited.' : null,
    ].filter(Boolean) as string[];
  }, [activeDataset]);
  const canRunDetection = Boolean(activeDataset && activeDataset.schema.some((field) => field.mappedTo === 'amount') && activeDataset.schema.some((field) => field.mappedTo === 'timestamp') && (activeDataset.selectedFeatures?.length ?? 0) > 0 && activeDataset.analysisReadiness !== 'parsing');

  useEffect(() => {
    if (!activeDataset?.id) return;
    void getDatasetPreview(activeDataset.id, previewPage, 20).then(setPreview).catch(() => {
      setPreview({ headers: [], page: 1, pageSize: 20, total: 0, rows: [] });
    });
  }, [activeDataset?.id, getDatasetPreview, previewPage]);

  async function onDatasetSelected(file?: File) {
    if (!file) return;
    setError(null);
    setMessage(null);
    setRunDetectionError(null);
    try {
      await uploadDataset(file, 'dataset');
      setMessage('Dataset upload started. Parse and readiness details will update automatically.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed.');
    }
  }

  async function onResumeEnabledPicker() {
    setError(null);
    setMessage(null);
    setRunDetectionError(null);
    try {
      const { file, handle } = await pickResumableFile();
      await uploadDataset(file, 'dataset', handle);
      setMessage('Resume-enabled upload started.');
    } catch (cause) {
      setError(normalizeResumablePickerError(cause));
    }
  }

  async function updateMapping(columnName: string, mappedTo?: FraudCanonicalField) {
    if (!activeDataset) return;
    setError(null);
    const mapping = activeDataset.schema.map((field) => ({
      columnName: field.name,
      mappedTo: field.name === columnName ? mappedTo : field.mappedTo,
    }));
    try {
      await updateDatasetConfig({ datasetId: activeDataset.id, mapping });
      setMessage('Column mapping saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save mapping.');
    }
  }

  async function updateSelectedFeatures(columnName: string, enabled: boolean) {
    if (!activeDataset) return;
    setError(null);
    const next = new Set(activeDataset.selectedFeatures ?? []);
    if (enabled) next.add(columnName);
    else next.delete(columnName);
    try {
      await updateDatasetConfig({ datasetId: activeDataset.id, selectedFeatures: [...next] });
      setMessage('Feature selection saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save feature selection.');
    }
  }

  async function updateLabelColumn(columnName: string) {
    if (!activeDataset) return;
    setError(null);
    try {
      await updateDatasetConfig({ datasetId: activeDataset.id, labelColumn: columnName || undefined });
      setMessage(columnName ? 'Label column saved.' : 'Label column cleared. Derived labels will be generated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to update label column.');
    }
  }

  async function confirmDeleteDataset(datasetId: string) {
    const dataset = workspace?.datasets.find((item) => item.id === datasetId);
    if (!dataset) return;
    setDeletingDatasetId(datasetId);
    setError(null);
    setMessage(null);
    try {
      const response = await deleteDataset(datasetId, true);
      setDeleteTargetId(null);
      setMessage(`Deleted ${response.datasetName}. Removed ${response.removed.runs} runs, ${response.removed.cases} cases, ${response.removed.reports} reports, ${response.removed.jobs} jobs, and ${response.removed.documents} documents.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to delete dataset.');
    } finally {
      setDeletingDatasetId(null);
    }
  }

  return (
    <FraudPage
      eyebrow="LARGE-SCALE INGESTION"
      title="Data Upload"
      description="Upload, validate, map, preview, and prepare fraud datasets before running detection."
      actions={
        <>
          <Button onClick={() => activeDataset && void runDetection(activeDataset.id)} disabled={!canRunDetection}>
            <Play className="h-4 w-4" />
            Run detection
          </Button>
          <Button variant="secondary" onClick={() => refresh()}>
            <RotateCcw className="h-4 w-4" />
            Refresh jobs
          </Button>
          {activeReport ? (
            <a href={`/api/fraud/reports/${activeReport.id}/download`} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/90 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500">
              <FileText className="h-4 w-4" />
              Download full report
            </a>
          ) : null}
        </>
      }
    >
      <Card className="p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Workflow guide</div>
        <div className="mt-3 grid gap-3 md:grid-cols-5">
          {['Upload dataset', 'Validate schema', 'Map columns', 'Select features', 'Run detection'].map((step, index) => (
            <div key={step} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100">
              <div className="text-xs text-slate-400">Step {index + 1}</div>
              <div className="mt-1 font-semibold">{step}</div>
            </div>
          ))}
        </div>
      </Card>
      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-8 space-y-4">
          <Card>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <FileSpreadsheet className="h-4 w-4 text-sky-300" />
              Large dataset upload
            </div>
            <div className="mt-1 text-sm text-slate-400">CSV is the preferred production-scale path. Uploads are chunked into 8 MB blocks, staged on the server, and can be resumed after refresh when the browser supports the File System Access API.</div>
            <label className="mt-4 flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-8 text-sm text-slate-300 hover:bg-white/10">
              <input type="file" accept=".csv,.xlsx,.xls,.xlsm,.xlsb" className="hidden" onChange={(event) => void onDatasetSelected(event.target.files?.[0])} />
              <span className="inline-flex items-center gap-2"><Upload className="h-4 w-4" />Select CSV or Excel file</span>
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void onResumeEnabledPicker()}>Resume-enabled picker (Chromium)</Button>
              {uploadState.uploadId && uploadState.status === 'uploading' ? <Button variant="ghost" onClick={() => void cancelUpload()}>Cancel upload</Button> : null}
            </div>
            {uploadState.status !== 'idle' ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-100">Upload status</div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">{uploadState.status}</div>
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-900/80">
                  <div className="h-full rounded-full bg-sky-400" style={{ width: `${uploadState.progressPct}%` }} />
                </div>
                <div className="mt-2 text-xs text-slate-400">{uploadState.filename ?? 'Upload'} | {formatBytes(uploadState.size)} | {uploadState.progressPct}% | {uploadState.jobId ?? 'Pending job id'}</div>
                {uploadState.error ? <div className="mt-2 text-xs text-red-200">{uploadState.error}</div> : null}
              </div>
            ) : null}
            {resumableSessions.length ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-slate-100">Unfinished uploads</div>
                <div className="mt-3 space-y-2">
                  {resumableSessions.slice(0, 4).map((session) => (
                    <div key={session.uploadId} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                      <div className="text-sm font-semibold text-slate-100">{session.originalFilename}</div>
                      <div className="mt-1 text-xs text-slate-400">{formatBytes(session.uploadedBytes)} of {formatBytes(session.size)} | {session.status}</div>
                      <div className="mt-2 flex gap-2">
                        <Button variant="secondary" onClick={() => void resumeUpload(session.uploadId)}>Resume</Button>
                        <Button variant="ghost" onClick={() => void cancelUpload(session.uploadId)}>Cancel</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {message ? <div className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</div> : null}
            {error ? <div className="mt-4 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
            {runDetectionError ? <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{runDetectionError}</div> : null}
          </Card>

          {!activeDataset ? (
            <EmptyState title="No active dataset" detail="Upload a CSV or Excel file to create a staged server-side dataset, preview rows, map columns, select features, and enable background analysis." />
          ) : (
            <>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">Dataset readiness</div>
                    <div className="mt-1 text-xs text-slate-400">{activeDataset.name} | {formatBytes(activeDataset.fileSizeBytes)} | {activeDataset.rowCount.toLocaleString()} rows | {activeDataset.columnCount} columns</div>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-wide text-slate-200">{activeDataset.analysisReadiness.replace(/_/g, ' ')}</div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3"><div className="text-xs text-slate-400">Selected sheet</div><div className="mt-1 text-sm text-slate-100">{activeDataset.selectedSheet ?? 'Sheet1'}</div></div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3"><div className="text-xs text-slate-400">Mapping completeness</div><div className="mt-1 text-sm text-slate-100">{Math.round(activeDataset.mappingCompleteness * 100)}%</div></div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3"><div className="text-xs text-slate-400">True fraud label mapped</div><div className="mt-1 text-sm text-slate-100">{activeDataset.labelColumnMapped ? activeDataset.labelColumn : 'No'}</div></div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3"><div className="text-xs text-slate-400">Selected features</div><div className="mt-1 text-sm text-slate-100">{activeDataset.selectedFeatures?.length ?? 0}</div></div>
                </div>
                <div className="mt-3 rounded-xl border border-sky-300/70 bg-sky-50 px-4 py-3 text-sm text-sky-950">
                  {activeDataset.labelColumnMapped ? `Source fraud label column: ${activeDataset.labelColumn}` : 'No fraud label column detected. Derived labels will be generated.'}
                </div>
                {criticalWarnings.length ? (
                  <div className="mt-4 space-y-2">
                    {criticalWarnings.map((warning) => <div key={warning} className="rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950">{warning}</div>)}
                  </div>
                ) : null}
              </Card>

              <Card>
                <div className="text-sm font-semibold text-slate-100">Column mapping</div>
                <div className="mt-1 text-xs text-slate-400">Map incoming columns to fraud system fields before running detection.</div>
                <div className="mt-4 overflow-x-auto">
                  <div className="min-w-[860px] overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                    <div className="grid grid-cols-12 gap-3 border-b border-white/10 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      <div className="col-span-3">Column</div>
                      <div className="col-span-2">Type</div>
                      <div className="col-span-3">Mapped field</div>
                      <div className="col-span-1">Count</div>
                      <div className="col-span-3">Sample values</div>
                    </div>
                    {activeDataset.schema.map((field) => (
                      <div key={field.name} className="grid grid-cols-12 gap-3 border-b border-white/5 px-4 py-3 text-sm text-slate-200 last:border-b-0">
                        <div className="col-span-3">{field.name}</div>
                        <div className="col-span-2">{field.dataType}</div>
                        <div className="col-span-3">
                          <select value={field.mappedTo ?? ''} onChange={(event) => void updateMapping(field.name, (event.target.value || undefined) as FraudCanonicalField | undefined)} className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none">
                            {CANONICAL_FIELDS.map((option) => <option key={option.label} value={option.value ?? ''}>{option.label}</option>)}
                          </select>
                        </div>
                        <div className="col-span-1">{field.nonEmptyCount}</div>
                        <div className="col-span-3 text-xs text-slate-400">{field.sampleValues.join(', ') || 'No sample values'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <Card>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">Label column control</div>
                    <div className="mt-1 text-xs text-slate-400">Choose a source fraud label if one exists. Otherwise derived labels remain the analyst-support path.</div>
                  </div>
                  <select value={activeDataset.labelColumn ?? ''} onChange={(event) => void updateLabelColumn(event.target.value)} className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none">
                    <option value="">No label column</option>
                    {activeDataset.schema.map((field) => <option key={field.name} value={field.name}>{field.name}</option>)}
                  </select>
                </div>
              </Card>

              <Card>
                <div className="text-sm font-semibold text-slate-100">Feature selection</div>
                <div className="mt-1 text-xs text-slate-400">Enable or disable numeric columns used for anomaly detection.</div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {activeDataset.schema.filter((field) => ['numeric', 'mixed'].includes(field.dataType) && field.mappedTo !== 'fraud_label').map((field) => {
                    const checked = (activeDataset.selectedFeatures ?? []).includes(field.name);
                    return (
                      <label key={field.name} className={`rounded-xl border px-4 py-3 ${checked ? 'border-sky-400/25 bg-sky-500/10' : 'border-white/10 bg-white/5'}`}>
                        <div className="flex items-start gap-3">
                          <input type="checkbox" checked={checked} onChange={(event) => void updateSelectedFeatures(field.name, event.target.checked)} className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950/60 text-sky-400" />
                          <div>
                            <div className="text-sm font-semibold text-slate-100">{field.name}</div>
                            <div className="mt-1 text-xs text-slate-400">{field.dataType}{field.mappedTo ? ` | ${field.mappedTo}` : ''}</div>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </Card>

              <Card>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">Dataset preview</div>
                    <div className="mt-1 text-xs text-slate-400">Server-side preview of the first rows. Scroll horizontally for wide schemas.</div>
                  </div>
                  <div className="text-xs text-slate-400">Page {preview.page} of {Math.max(1, Math.ceil(preview.total / preview.pageSize))}</div>
                </div>
                <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
                  <table className="min-w-[980px] w-full text-left text-sm">
                    <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
                      <tr>{preview.headers.map((header) => <th key={header} className="px-3 py-3">{header}</th>)}</tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, rowIndex) => (
                        <tr key={`${preview.page}-${rowIndex}`} className="border-b border-white/5 last:border-b-0">
                          {preview.headers.map((header) => <td key={`${rowIndex}-${header}`} className="px-3 py-3 text-slate-200">{String(row[header] ?? '')}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <Button variant="secondary" onClick={() => setPreviewPage((value) => Math.max(1, value - 1))} disabled={previewPage <= 1}>Previous</Button>
                  <div className="text-xs text-slate-400">Preview is paged server-side to avoid loading the full dataset into the browser.</div>
                  <Button variant="secondary" onClick={() => setPreviewPage((value) => (value * preview.pageSize < preview.total ? value + 1 : value))} disabled={previewPage * preview.pageSize >= preview.total}>Next</Button>
                </div>
              </Card>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <div className="text-sm font-semibold text-slate-100">Dataset statistics</div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3"><div className="text-xs text-slate-400">Total rows</div><div className="mt-1 text-sm text-slate-100">{activeDataset.rowCount.toLocaleString()}</div></div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3"><div className="text-xs text-slate-400">Total columns</div><div className="mt-1 text-sm text-slate-100">{activeDataset.columnCount}</div></div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3"><div className="text-xs text-slate-400">Time span</div><div className="mt-1 text-sm text-slate-100">{activeDataset.statistics?.timeSpanStart && activeDataset.statistics?.timeSpanEnd ? `${new Date(activeDataset.statistics.timeSpanStart).toLocaleDateString()} -> ${new Date(activeDataset.statistics.timeSpanEnd).toLocaleDateString()}` : 'Not available'}</div></div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3"><div className="text-xs text-slate-400">Unique customers</div><div className="mt-1 text-sm text-slate-100">{activeDataset.statistics?.uniqueCustomers?.toLocaleString() ?? 'Not available'}</div></div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3"><div className="text-xs text-slate-400">Unique merchants</div><div className="mt-1 text-sm text-slate-100">{activeDataset.statistics?.uniqueMerchants?.toLocaleString() ?? 'Not available'}</div></div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3"><div className="text-xs text-slate-400">Average amount</div><div className="mt-1 text-sm text-slate-100">{activeDataset.statistics?.averageAmount == null ? 'Not available' : activeDataset.statistics.averageAmount.toFixed(2)}</div></div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3"><div className="text-xs text-slate-400">Max amount</div><div className="mt-1 text-sm text-slate-100">{activeDataset.statistics?.maxAmount == null ? 'Not available' : activeDataset.statistics.maxAmount.toFixed(2)}</div></div>
                  </div>
                </Card>

                <Card>
                  <div className="text-sm font-semibold text-slate-100">Ingestion analytics</div>
                  <div className="mt-4 space-y-4">
                    <div className="h-48">
                      {activeDataset.chartSummary?.amountDistribution?.length ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={activeDataset.chartSummary.amountDistribution}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="bucket" stroke="#94a3b8" />
                            <YAxis stroke="#94a3b8" allowDecimals={false} />
                            <Tooltip />
                            <Bar dataKey="count" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : <div className="flex h-full items-center justify-center text-sm text-slate-400">No amount distribution is available until an amount column is mapped.</div>}
                    </div>
                    <div className="h-48">
                      {activeDataset.chartSummary?.transactionTimeDistribution?.length ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={activeDataset.chartSummary.transactionTimeDistribution}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="bucket" stroke="#94a3b8" />
                            <YAxis stroke="#94a3b8" allowDecimals={false} />
                            <Tooltip />
                            <Bar dataKey="count" fill="#22c55e" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : <div className="flex h-full items-center justify-center text-sm text-slate-400">No transaction-time distribution is available until a timestamp column is mapped.</div>}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {activeDataset.chartSummary?.featureCorrelation?.length ? activeDataset.chartSummary.featureCorrelation.map((item) => (
                        <div key={`${item.featureX}-${item.featureY}`} className="rounded-xl border border-white/10 px-3 py-3" style={{ backgroundColor: `rgba(${item.correlation >= 0 ? '56,189,248' : '239,68,68'}, ${Math.min(0.85, Math.abs(item.correlation))})` }}>
                          <div className="text-xs text-white/80">{item.featureX} × {item.featureY}</div>
                          <div className="mt-1 text-sm font-semibold text-white">{item.correlation}</div>
                        </div>
                      )) : <div className="col-span-2 flex h-28 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm text-slate-400">Not enough numeric columns are available to calculate feature correlations.</div>}
                    </div>
                  </div>
                </Card>
              </div>

              {activeDataset.fileKind === 'excel' ? <div className="rounded-xl border border-sky-300/70 bg-sky-50 px-4 py-3 text-sm text-sky-950">Excel is supported for normal workbook sizes. Oversized workbooks should be converted to CSV for production-scale fraud ingestion.</div> : null}
              {activeDataset.quality.insufficientFeatureWarning ? <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950">{activeDataset.quality.insufficientFeatureWarning}</div> : null}
            </>
          )}
        </div>

        <div className="col-span-12 xl:col-span-4 space-y-4">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-100">Uploaded datasets</div>
              <div className="text-xs text-slate-400">{workspace?.datasets.length ?? 0} dataset(s) in this workspace</div>
            </div>
            <div className="mt-3 space-y-2">
              {!(workspace?.datasets.length) ? (
                <div className="text-sm text-slate-400">No uploaded datasets are available yet.</div>
              ) : (
                workspace!.datasets.map((dataset) => {
                  const relatedRuns = (workspace?.runs ?? []).filter((item) => item.datasetId === dataset.id).length;
                  const relatedCases = (workspace?.cases ?? []).filter((item) => item.datasetId === dataset.id).length;
                  const relatedReports = (workspace?.reports ?? []).filter((item) => item.datasetId === dataset.id).length;
                  const relatedJobs = (workspace?.jobs ?? []).filter((item) => item.datasetId === dataset.id).length;
                  const isDeleteTarget = deleteTargetId === dataset.id;
                  const isActive = activeDataset?.id === dataset.id;
                  return (
                    <div key={dataset.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-100">{dataset.name}</div>
                          <div className="mt-1 text-xs text-slate-400">{dataset.id} | {dataset.rowCount.toLocaleString()} rows | {dataset.columnCount} columns | {dataset.status}</div>
                        </div>
                        {isActive ? <div className="rounded-full border border-sky-300/60 bg-sky-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-950">Active</div> : null}
                      </div>
                      <div className="mt-2 text-xs text-slate-400">{relatedRuns} runs | {relatedCases} cases | {relatedReports} reports | {relatedJobs} jobs</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {!isActive ? <Button variant="secondary" onClick={() => void updateDatasetConfig({ datasetId: dataset.id, active: true })}>Set active</Button> : null}
                        {canDeleteDatasets ? (
                          <Button variant="ghost" onClick={() => setDeleteTargetId(isDeleteTarget ? null : dataset.id)} disabled={deletingDatasetId === dataset.id}>
                            Delete dataset
                          </Button>
                        ) : (
                          <div className="text-xs text-slate-400">Delete requires admin role.</div>
                        )}
                      </div>
                      {isDeleteTarget ? (
                        <div className="mt-3 rounded-xl border border-red-300/70 bg-red-50 px-4 py-3 text-sm text-red-900">
                          <div className="font-semibold">Confirm dataset deletion</div>
                          <div className="mt-2 text-sm">Delete <span className="font-semibold">{dataset.name}</span> and remove its derived runs, cases, reports, jobs, and server-staged artifacts.</div>
                          {isActive ? <div className="mt-2 text-sm">This dataset is currently active. Deleting it will switch the workspace to the next available dataset or clear the active dataset selection.</div> : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button variant="ghost" onClick={() => setDeleteTargetId(null)} disabled={deletingDatasetId === dataset.id}>Cancel</Button>
                            <Button onClick={() => void confirmDeleteDataset(dataset.id)} disabled={deletingDatasetId === dataset.id}>
                              {deletingDatasetId === dataset.id ? 'Deleting...' : 'Confirm delete'}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          <Card>
            <div className="text-sm font-semibold text-slate-100">Job timeline</div>
            <div className="mt-3 space-y-2">
              {jobs.length === 0 ? <div className="text-sm text-slate-400">No jobs recorded yet.</div> : jobs.slice(0, 8).map((job) => (
                <div key={job.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-100">{job.type}</div>
                    <div className="text-xs uppercase tracking-wide text-slate-400">{job.status}</div>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-900/80"><div className="h-full rounded-full bg-sky-400" style={{ width: `${job.progressPct}%` }} /></div>
                  <div className="mt-2 text-xs text-slate-400">{job.progressPct}% | {new Date(job.startedAt).toLocaleString()}</div>
                  {job.failureReason ? <div className="mt-2 text-xs text-red-200">{job.failureReason}</div> : null}
                  {['queued', 'uploading', 'uploaded', 'parsing', 'waiting_for_mapping', 'ready_for_analysis', 'analyzing', 'report_generating'].includes(job.status) ? (
                    <div className="mt-2"><Button variant="ghost" onClick={() => void cancelJob(job.id)}>Cancel</Button></div>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              Data quality
            </div>
            {activeDataset ? (
              <div className="mt-3 space-y-2 text-sm text-slate-300">
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">Duplicate rows: {activeDataset.quality.duplicateRows.toLocaleString()}</div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">Invalid amount rows: {activeDataset.quality.invalidAmountRows.toLocaleString()}</div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">Negative amount rows: {activeDataset.quality.negativeAmountRows.toLocaleString()}</div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">Null-heavy columns: {activeDataset.quality.nullHeavyColumns.length ? activeDataset.quality.nullHeavyColumns.map((item) => `${item.column} (${Math.round(item.nullRate * 100)}%)`).join(', ') : 'None detected'}</div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">High-cardinality warnings: {activeDataset.quality.highCardinalityColumns.length}</div>
              </div>
            ) : (
              <div className="mt-3 text-sm text-slate-400">Upload a dataset to compute large-scale ingestion quality checks.</div>
            )}
          </Card>

          <Card>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <FileText className="h-4 w-4 text-amber-300" />
              Report state
            </div>
            <div className="mt-3 text-sm text-slate-300">{latestRun?.reportGenerated ? 'A report is available for the latest background analysis run.' : 'Reports are generated after the background analysis job completes.'}</div>
            <div className="mt-2 text-xs text-slate-400">{activeReport ? `${activeReport.filename} | ${new Date(activeReport.generatedAt).toLocaleString()}` : 'No report generated yet.'}</div>
            {activeReport ? <a href={`/api/fraud/reports/${activeReport.id}/download`} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-500/90 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500">Download full report</a> : null}
            {activeJob ? <div className="mt-3 text-xs text-slate-400">Next action: {activeJob.status === 'completed' ? 'Open Fraud Detection or download the full report.' : 'Wait for the active background job to complete, then review the dashboard.'}</div> : null}
          </Card>
        </div>
      </section>
    </FraudPage>
  );
}
