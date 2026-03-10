'use client';

import Link from 'next/link';
import { Database, Download, FileText, Info, Play } from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, EmptyState, FraudPage, MetricCard, formatCurrency, formatPct } from '../../components/fraud/FraudUi';
import { useFraudServerWorkspace } from '../../hooks/useFraudServerWorkspace';
import type { FraudJobStatus, ServerAnalysisRun } from '../../lib/fraud/server-types';

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

function StageRow({ label, status, detail }: { label: string; status: FraudJobStatus | 'pending' | 'running'; detail: string }) {
  const tone =
    status === 'completed'
      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
      : status === 'failed' || status === 'cancelled'
      ? 'border-red-400/30 bg-red-500/10 text-red-100'
      : status === 'running' || status === 'uploading' || status === 'parsing' || status === 'analyzing' || status === 'report_generating'
      ? 'border-sky-400/30 bg-sky-500/10 text-sky-100'
      : 'border-white/10 bg-white/5 text-slate-200';
  return (
    <div className={`rounded-xl border px-4 py-3 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs uppercase tracking-[0.18em]">{status}</div>
      </div>
      <div className="mt-2 text-xs text-slate-300">{detail}</div>
    </div>
  );
}

function MetricTitle({ label, help }: { label: string; help: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
      <span>{label}</span>
      <span title={help} className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300">
        <Info className="h-3 w-3" />
      </span>
    </div>
  );
}

function ExplainedMetric({ label, value, hint, help }: { label: string; value: string; hint: string; help: string }) {
  return (
    <Card>
      <MetricTitle label={label} help={help} />
      <div className="mt-2 text-3xl font-semibold text-slate-100">{value}</div>
      <div className="mt-2 text-sm text-slate-400">{hint}</div>
    </Card>
  );
}

function ChartCard({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">{title}</div>
          <div className="mt-1 text-xs text-slate-400">{detail}</div>
        </div>
      </div>
      <div className="mt-4 h-72">{children}</div>
    </Card>
  );
}

function getStageStatus(activeDataset: any, latestRun: ServerAnalysisRun | null, activeReport: any) {
  const uploadStatus: FraudJobStatus | 'pending' = activeDataset ? 'completed' : 'pending';
  const parseStatus: FraudJobStatus | 'pending' =
    !activeDataset ? 'pending' : activeDataset.analysisReadiness === 'parsing' ? 'parsing' : activeDataset.rowCount > 0 || activeDataset.status === 'ready' ? 'completed' : 'pending';
  const analysisStatus: FraudJobStatus | 'pending' =
    !latestRun
      ? activeDataset?.analysisReadiness === 'analysis_blocked'
        ? 'failed'
        : 'pending'
      : latestRun.status === 'completed'
      ? 'completed'
      : latestRun.status;
  const reportStatus: FraudJobStatus | 'pending' =
    !latestRun ? 'pending' : activeReport ? 'completed' : latestRun.status === 'report_generating' ? 'report_generating' : 'pending';
  return [
    { label: 'Upload', status: uploadStatus, detail: activeDataset ? `${activeDataset.name} staged on the server.` : 'No dataset uploaded yet.' },
    { label: 'Parse', status: parseStatus, detail: activeDataset ? `${activeDataset.rowCount.toLocaleString()} rows and ${activeDataset.columnCount} columns profiled.` : 'Waiting for upload.' },
    { label: 'Analysis', status: analysisStatus, detail: latestRun ? `${latestRun.metrics.suspiciousTransactions.toLocaleString()} suspicious rows on the latest run.` : activeDataset?.analysisReadiness === 'analysis_blocked' ? 'Analysis blocked by insufficient usable features.' : 'Run detection to start analysis.' },
    { label: 'Report', status: reportStatus, detail: activeReport ? `${activeReport.filename} generated ${new Date(activeReport.generatedAt).toLocaleString()}.` : 'Report is generated automatically after successful analysis.' },
  ];
}

export default function DashboardPage() {
  const { activeDataset, latestRun, ready, workspace, runDetection, runDetectionError } = useFraudServerWorkspace();
  const jobs = workspace?.jobs ?? [];
  const activeReport = activeDataset ? workspace?.reports.find((item) => item.datasetId === activeDataset.id) ?? null : null;
  const reportReady = Boolean(activeReport);
  const reportOutdated = Boolean(activeReport && latestRun?.completedAt) && new Date(activeReport.generatedAt).getTime() < new Date(latestRun.completedAt).getTime();
  const labelExplanation =
    latestRun?.metrics?.labelExplanation ??
    (activeDataset?.labelColumnMapped
      ? `Ground-truth fraud labels come from the mapped source column ${activeDataset.labelColumn}.`
      : 'Derived risk labels were generated because no source fraud label column was provided.');
  const derivedCounts = latestRun?.metrics?.derivedLabelCounts ?? { high_risk: 0, medium_risk: 0, low_risk: 0 };
  const relevantCases = activeDataset ? (workspace?.cases ?? []).filter((item) => item.datasetId === activeDataset.id) : [];
  const recentRuns = activeDataset ? (workspace?.runs ?? []).filter((item) => item.datasetId === activeDataset.id).slice(0, 3) : [];
  const stageRows = getStageStatus(activeDataset, latestRun, activeReport);
  const topEntities = (latestRun?.topRiskEntities ?? []).slice(0, 8);
  const caseStatusData = ['new', 'under_review', 'escalated', 'confirmed_fraud', 'false_positive', 'closed']
    .map((status) => ({ status, count: relevantCases.filter((item) => item.status === status).length }))
    .filter((item) => item.count > 0);
  const workflowBanner = !latestRun
    ? 'Dataset is ready. Run detection to generate suspicious rows, cases, and a downloadable full report.'
    : latestRun.metrics.suspiciousTransactions > 0
    ? `${latestRun.metrics.suspiciousTransactions.toLocaleString()} suspicious transactions detected. Review them in Fraud Detection.`
    : 'No anomalies detected. Consider lowering the anomaly threshold or contamination setting before rerunning analysis.';
  const runComparison = recentRuns.map((run, index) => ({
    label: `Run ${recentRuns.length - index}`,
    suspicious: run.metrics.suspiciousTransactions,
    anomalyRate: Number(((run.metrics.anomalyRate ?? 0) * 100).toFixed(1)),
  }));
  const modelConfig = workspace?.settings;
  const suspiciousPreview = topEntities.slice(0, 6);
  const reportStatus = !latestRun
    ? 'Run detection to generate a downloadable report.'
    : reportReady
    ? reportOutdated
      ? 'Report available, but outdated against the latest run.'
      : 'Report available for the latest run.'
    : latestRun.status === 'report_generating'
    ? 'Report generating.'
    : 'No report yet.';

  return (
    <FraudPage
      eyebrow="FRAUD OPERATIONS OVERVIEW"
      title="Dashboard"
      description="Server-backed fraud analytics command center with job pipeline clarity, threshold visibility, visual analytics, and direct report access."
      actions={
        <>
          <Link href="/data-upload" className="inline-flex items-center gap-2 rounded-xl bg-sky-500/90 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500">
            <Database className="h-4 w-4" />
            Upload dataset
          </Link>
          <button onClick={() => activeDataset && void runDetection(activeDataset.id)} disabled={!activeDataset} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 hover:bg-white/10 disabled:opacity-40">
            <Play className="h-4 w-4" />
            Run detection
          </button>
          {reportReady ? (
            <a href={`/api/fraud/reports/${activeReport!.id}/download`} className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-50 hover:bg-emerald-500/25">
              <Download className="h-4 w-4" />
              Download full report
            </a>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-400">
              <Download className="h-4 w-4" />
              Run detection to generate a downloadable report
            </span>
          )}
          <Link href="/fraud-detection" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 hover:bg-white/10">
            <FileText className="h-4 w-4" />
            Review suspicious rows
          </Link>
        </>
      }
    >
      {!ready ? <EmptyState title="Initializing large-data workspace" detail="Restoring staged datasets, job pipeline state, run history, and report availability from the server workspace." /> : null}
      {ready && !activeDataset ? <EmptyState title="No dataset uploaded" detail="Start with a CSV or Excel dataset. Once parsed, you can tune thresholds in Settings, run detection, review suspicious rows, and download the full report." ctaHref="/data-upload" ctaLabel="Open Data Upload" /> : null}
      {ready && activeDataset ? (
        <>
          {runDetectionError ? <Card className="border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">{runDetectionError}</Card> : null}
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Workflow guidance</div>
                <div className="mt-2 text-lg font-semibold text-slate-100">{workflowBanner}</div>
                <div className="mt-2 text-sm text-slate-400">{labelExplanation}</div>
              </div>
              <div className="rounded-2xl border border-sky-400/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
                Active dataset: {activeDataset.name}
              </div>
            </div>
          </Card>

          <section className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Active dataset</div>
                  <div className="mt-2 text-xl font-semibold text-slate-100">{activeDataset.name}</div>
                  <div className="mt-2 text-sm text-slate-400">
                    {formatBytes(activeDataset.fileSizeBytes)} | {activeDataset.rowCount.toLocaleString()} rows | {activeDataset.columnCount} columns | readiness {activeDataset.analysisReadiness.replace(/_/g, ' ')}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100">{activeDataset.status}</div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"><div className="text-xs uppercase tracking-wide text-slate-400">Label mode</div><div className="mt-1 text-sm font-semibold text-slate-100">{activeDataset.labelMode}</div></div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"><div className="text-xs uppercase tracking-wide text-slate-400">True fraud label mapped</div><div className="mt-1 text-sm font-semibold text-slate-100">{activeDataset.labelColumnMapped ? activeDataset.labelColumn : 'No'}</div></div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"><div className="text-xs uppercase tracking-wide text-slate-400">Derived label field</div><div className="mt-1 text-sm font-semibold text-slate-100">{activeDataset.derivedLabelGenerated ? activeDataset.derivedLabelField : 'Pending analysis'}</div></div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"><div className="text-xs uppercase tracking-wide text-slate-400">Usable features</div><div className="mt-1 text-sm font-semibold text-slate-100">{activeDataset.usableFeatureCount}</div></div>
              </div>
            </Card>

            <Card className="p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Pipeline state</div>
              <div className="mt-3 space-y-3">
                {stageRows.map((stage) => (
                  <StageRow key={stage.label} label={stage.label} status={stage.status} detail={stage.detail} />
                ))}
              </div>
            </Card>
          </section>

          <section className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-6">
            <MetricCard label="Total Transactions" value={String(latestRun?.metrics.totalTransactions ?? activeDataset.rowCount ?? 0)} hint={activeDataset.name} />
            <ExplainedMetric label="Suspicious Transactions" value={String(latestRun?.metrics.suspiciousTransactions ?? 0)} hint="Latest server-side analysis run" help="Rows that crossed the current combined anomaly-plus-rules risk threshold in the latest analysis run." />
            <ExplainedMetric label="Fraud Rate" value={formatPct(latestRun?.metrics.fraudRate ?? null)} hint={activeDataset.labelColumnMapped ? `Ground-truth source label: ${activeDataset.labelColumn}` : 'Not available because no source fraud label column is mapped'} help="Ground-truth fraud labels from the source dataset only. This is never inferred from anomaly output." />
            <ExplainedMetric label="Derived Risk Rate" value={formatPct(latestRun?.metrics?.derivedHighRiskRate ?? null)} hint={activeDataset.labelColumnMapped ? 'Secondary analyst-support estimate from anomaly and rule outputs' : 'Analyst-support estimate because no source fraud label column was provided'} help="Share of rows classified as high risk by the system-derived label bands when anomaly and rule thresholds are applied." />
            <ExplainedMetric label="Anomaly Rate" value={formatPct(latestRun?.metrics.anomalyRate ?? null)} hint="Computed from the full processed dataset" help="Portion of processed rows marked suspicious by the scalable anomaly and rules pipeline." />
            <MetricCard label="Total Amount" value={formatCurrency(latestRun?.metrics.totalAmount ?? null)} hint="Aggregated server-side" />
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <ChartCard title="Suspicious transactions over time" detail="Aggregated daily anomaly buckets from the latest completed run.">
              {latestRun?.anomaliesByDay?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={latestRun.anomaliesByDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="bucket" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#38bdf8" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">{latestRun ? 'No anomaly events to chart yet.' : 'Run detection to populate time buckets.'}</div>
              )}
            </ChartCard>

            <ChartCard title="Risk band distribution" detail="Distribution of all processed rows across the current risk bands.">
              {latestRun?.riskBandDistribution?.some((item) => item.count > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={latestRun.riskBandDistribution} dataKey="count" nameKey="band" innerRadius={55} outerRadius={90} paddingAngle={2}>
                      {latestRun.riskBandDistribution.map((entry) => (
                        <Cell key={entry.band} fill={{ critical: '#ef4444', high: '#f97316', medium: '#facc15', low: '#22c55e' }[entry.band]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">Run detection to compute risk-band counts.</div>
              )}
            </ChartCard>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-2">
            <ChartCard title="Anomaly score distribution" detail="Histogram buckets are aggregated in the server-side analysis run, not from raw browser rows.">
              {latestRun?.anomalyScoreDistribution?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={latestRun.anomalyScoreDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="bucket" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#22c55e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">No anomaly-score distribution is available until analysis completes.</div>
              )}
            </ChartCard>

            <ChartCard title="Top risky entities" detail="Top suspicious merchants, customers, devices, and locations from suspicious rows only.">
              {topEntities.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topEntities.map((entity) => ({ label: `${entity.entityType}:${entity.value}`.slice(0, 26), count: entity.suspiciousCount }))} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" stroke="#94a3b8" allowDecimals={false} />
                    <YAxis dataKey="label" type="category" stroke="#94a3b8" width={120} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#a78bfa" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">{latestRun ? 'No suspicious entities detected in the latest run.' : 'Run detection to populate entity concentrations.'}</div>
              )}
            </ChartCard>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-100">Model configuration</div>
                <Link href="/settings" className="text-xs text-sky-300 hover:text-sky-200">Adjust thresholds</Link>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"><div className="text-xs text-slate-400">Anomaly threshold</div><div className="mt-1 text-sm font-semibold text-slate-100">{modelConfig?.anomalyThreshold?.toFixed(2) ?? 'Not configured'}</div></div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"><div className="text-xs text-slate-400">Contamination</div><div className="mt-1 text-sm font-semibold text-slate-100">{modelConfig?.contamination?.toFixed(2) ?? 'Not configured'}</div></div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"><div className="text-xs text-slate-400">High amount rule</div><div className="mt-1 text-sm font-semibold text-slate-100">{formatCurrency(modelConfig?.highAmountThreshold ?? null)}</div></div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"><div className="text-xs text-slate-400">Enabled rules</div><div className="mt-1 text-sm font-semibold text-slate-100">{modelConfig?.enabledRules?.join(', ') || 'No rules enabled'}</div></div>
              </div>
              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                Derived label thresholds: high risk at {modelConfig?.derivedHighRiskThreshold ?? 'n/a'}, medium risk at {modelConfig?.derivedMediumRiskThreshold ?? 'n/a'}.
              </div>
            </Card>

            <Card className="p-5">
              <div className="text-sm font-semibold text-slate-100">Report status</div>
              <div className="mt-3 text-sm text-slate-300">{reportStatus}</div>
              <div className="mt-2 text-xs text-slate-400">
                {activeReport ? `${activeReport.filename} | ${new Date(activeReport.generatedAt).toLocaleString()}` : 'No report generated yet.'}
              </div>
              <div className="mt-2 text-xs text-slate-400">
                {reportOutdated ? 'A newer run exists. Re-run detection to regenerate the workbook.' : latestRun?.reportGenerated ? 'The workbook belongs to the latest completed run.' : 'The workbook is generated automatically after analysis completes.'}
              </div>
              {activeReport ? (
                <a href={`/api/fraud/reports/${activeReport.id}/download`} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500/90 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500">
                  <Download className="h-4 w-4" />
                  Download full report
                </a>
              ) : (
                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-400">Run detection to generate a downloadable report.</div>
              )}
            </Card>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-3">
            <ChartCard title="Derived label distribution" detail="System-derived labels stay separate from ground-truth fraud labels.">
              {latestRun ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[{ label: 'High risk', count: derivedCounts.high_risk }, { label: 'Medium risk', count: derivedCounts.medium_risk }, { label: 'Low risk', count: derivedCounts.low_risk }]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="label" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">Run detection to generate derived labels.</div>
              )}
            </ChartCard>

            <ChartCard title="Case status distribution" detail="Generated from the active dataset case queue only.">
              {caseStatusData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={caseStatusData} dataKey="count" nameKey="status" innerRadius={50} outerRadius={85}>
                      {caseStatusData.map((entry, index) => (
                        <Cell key={entry.status} fill={['#38bdf8', '#22c55e', '#f97316', '#ef4444', '#facc15', '#94a3b8'][index % 6]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">{relevantCases.length ? 'Case statuses are present but not chartable yet.' : 'No cases generated for the active dataset yet.'}</div>
              )}
            </ChartCard>

            <ChartCard title="Run comparison" detail="Latest suspicious-row counts for this dataset only.">
              {runComparison.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={runComparison}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="label" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="suspicious" fill="#f97316" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">Run at least two analyses to compare suspicious counts over time.</div>
              )}
            </ChartCard>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-100">Top risky entity summary</div>
                <div className="text-xs text-slate-400">{topEntities.length ? `${topEntities.length} entity concentrations detected` : 'No risky entities yet'}</div>
              </div>
              <div className="mt-4 space-y-2">
                {suspiciousPreview.length ? (
                  suspiciousPreview.map((entity) => (
                    <div key={`${entity.entityType}-${entity.value}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
                      {entity.entityType} | {entity.value} | {entity.suspiciousCount} suspicious | {formatCurrency(entity.suspiciousAmount ?? null)}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-400">{latestRun ? 'No suspicious entities detected in the latest run.' : 'Run detection to populate merchant, customer, device, and location concentrations.'}</div>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <div className="text-sm font-semibold text-slate-100">Data quality and next action</div>
              <div className="mt-3 space-y-2 text-sm text-slate-300">
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">Duplicate rows: {activeDataset.quality.duplicateRows.toLocaleString()}</div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">Null-heavy columns: {activeDataset.quality.nullHeavyColumns.length || 0}</div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">Unsupported schema warnings: {activeDataset.quality.unsupportedSchemaWarnings.length || 0}</div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">{activeDataset.quality.insufficientFeatureWarning ?? 'Data quality checks completed. Threshold tuning is available in Settings.'}</div>
              </div>
            </Card>
          </section>
        </>
      ) : null}
    </FraudPage>
  );
}
