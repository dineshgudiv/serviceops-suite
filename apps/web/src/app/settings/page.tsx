'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Download, RotateCcw, Save, SlidersHorizontal, Upload } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, Legend } from 'recharts';
import { Button, Card, EmptyState, FraudPage } from '../../components/fraud/FraudUi';
import { useFraudServerWorkspace } from '../../hooks/useFraudServerWorkspace';
import type { WorkspaceSettings } from '../../lib/fraud/types';

const RULE_OPTIONS: Array<{ id: WorkspaceSettings['enabledRules'][number]; label: string; detail: string; logic: string }> = [
  { id: 'high_amount', label: 'High amount', detail: 'Escalate unusually large transaction values.', logic: 'Triggers when the mapped amount field exceeds the configured high amount threshold.' },
  { id: 'unusual_hour', label: 'Unusual hour', detail: 'Flag transactions in the unusual-hour watch window.', logic: 'Triggers when the mapped timestamp falls between the configured unusual-hour boundaries.' },
  { id: 'new_device_high_amount', label: 'New device + high amount', detail: 'Boost risk when sparse device context appears with a high amount.', logic: 'Triggers when a device change signal appears alongside an elevated amount.' },
  { id: 'new_location_high_amount', label: 'New location + high amount', detail: 'Boost risk for unfamiliar location context with elevated amount.', logic: 'Triggers when a location change signal appears with a high amount.' },
  { id: 'rapid_repeat', label: 'Rapid repeat', detail: 'Reserved for repeated transactions when data supports it.', logic: 'Intended to trigger when a customer exceeds the configured transaction count inside the configured time window.' },
  { id: 'risky_merchant_cluster', label: 'Risky merchant cluster', detail: 'Reserved for merchant concentration patterns when data supports it.', logic: 'Intended to trigger when suspicious activity exceeds the configured merchant cluster size.' },
];

type SettingsResponse = {
  settings: WorkspaceSettings;
  defaults: WorkspaceSettings;
  history: Array<{
    id: string;
    at: string;
    actor: string;
    previous: WorkspaceSettings;
    next: WorkspaceSettings;
  }>;
  canEdit: boolean;
  role: string;
  authenticated: boolean;
};

function cloneSettings(settings: WorkspaceSettings): WorkspaceSettings {
  return {
    ...settings,
    enabledRules: [...settings.enabledRules],
    riskBands: { ...settings.riskBands },
  };
}

function validateSettings(settings: WorkspaceSettings) {
  const errors: string[] = [];
  if (settings.anomalyThreshold <= 0 || settings.anomalyThreshold > 1) errors.push('Anomaly threshold must be between 0 and 1.');
  if (settings.contamination <= 0 || settings.contamination > 0.5) errors.push('Contamination must be between 0 and 0.5.');
  if (settings.highAmountThreshold <= 0) errors.push('High amount threshold must be positive.');
  if (settings.rapidRepeatTransactionCount <= 0) errors.push('Rapid repeat transaction count must be positive.');
  if (settings.rapidRepeatWindowMinutes <= 0) errors.push('Rapid repeat window must be positive.');
  if (settings.merchantClusterSize <= 0) errors.push('Merchant cluster size must be positive.');
  if (settings.deviceChangeWindowMinutes <= 0) errors.push('Device change window must be positive.');
  if (settings.riskBands.medium >= settings.riskBands.high || settings.riskBands.high >= settings.riskBands.critical) errors.push('Risk band values must be ordered from medium to high to critical.');
  if (settings.derivedMediumRiskThreshold >= settings.derivedHighRiskThreshold) errors.push('Derived medium-risk threshold must be lower than the high-risk threshold.');
  return errors;
}

export default function SettingsPage() {
  const { activeDataset, latestRun, ready, refresh, runDetection, runDetectionError, workspace } = useFraudServerWorkspace();
  const [form, setForm] = useState<WorkspaceSettings | null>(null);
  const [defaults, setDefaults] = useState<WorkspaceSettings | null>(null);
  const [history, setHistory] = useState<SettingsResponse['history']>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(true);
  const [role, setRole] = useState('local_workspace');
  const importRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void fetch('/api/fraud/settings', { cache: 'no-store' })
      .then((res) => res.json())
      .then((payload: SettingsResponse) => {
        if (cancelled) return;
        setForm(cloneSettings(payload.settings));
        setDefaults(cloneSettings(payload.defaults));
        setHistory(payload.history);
        setCanEdit(payload.canEdit);
        setRole(payload.role);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, workspace?.updatedAt]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(workspace?.settings ?? null), [form, workspace?.settings]);
  const expectedSuspiciousRows = useMemo(() => {
    if (!latestRun || !form || !latestRun.anomalyScoreDistribution?.length) return null;
    const threshold = form.anomalyThreshold;
    return latestRun.anomalyScoreDistribution.reduce((sum, bucket) => {
      const start = Number(bucket.bucket.split('-')[0]);
      return start >= threshold ? sum + bucket.count : sum;
    }, 0);
  }, [form, latestRun]);
  const thresholdCurve = useMemo(() => {
    if (!latestRun?.anomalyScoreDistribution?.length) return [];
    return [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((threshold) => ({
      threshold: threshold.toFixed(2),
      expected: latestRun.anomalyScoreDistribution.reduce((sum, bucket) => {
        const start = Number(bucket.bucket.split('-')[0]);
        return start >= threshold ? sum + bucket.count : sum;
      }, 0),
    }));
  }, [latestRun]);

  if (!ready) {
    return (
      <FraudPage eyebrow="SETTINGS + HISTORY" title="Settings" description="Tune fraud thresholds, enabled rules, and run behavior for the server-backed workspace.">
        <Card>
          <div className="text-sm font-semibold text-slate-100">Loading configurable settings</div>
          <div className="mt-2 text-sm text-slate-400">Restoring the active workspace settings, threshold defaults, and configuration history.</div>
        </Card>
      </FraudPage>
    );
  }

  const settings = form;
  const runs = workspace?.runs ?? [];

  async function reloadSettingsMeta() {
    const payload = (await fetch('/api/fraud/settings', { cache: 'no-store' }).then((res) => res.json())) as SettingsResponse;
    setForm(cloneSettings(payload.settings));
    setDefaults(cloneSettings(payload.defaults));
    setHistory(payload.history);
    setCanEdit(payload.canEdit);
    setRole(payload.role);
  }

  async function onSave() {
    if (!settings) return;
    const errors = validateSettings(settings);
    setValidationErrors(errors);
    setMessage(null);
    setError(null);
    if (errors.length) return;
    setSaving(true);
    try {
      const response = await fetch('/api/fraud/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.details?.join(' ') ?? payload?.message ?? 'Failed to save settings.');
        return;
      }
      setMessage(payload.message);
      await reloadSettingsMeta();
      refresh();
    } finally {
      setSaving(false);
    }
  }

  async function onReset() {
    setValidationErrors([]);
    setMessage(null);
    setError(null);
    setSaving(true);
    try {
      const response = await fetch('/api/fraud/settings', { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.message ?? 'Failed to reset settings.');
        return;
      }
      setMessage(payload.message);
      await reloadSettingsMeta();
      refresh();
    } finally {
      setSaving(false);
    }
  }

  async function rollback(versionId: string) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch('/api/fraud/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rollback', versionId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.message ?? 'Failed to rollback configuration.');
        return;
      }
      setMessage(payload.message);
      await reloadSettingsMeta();
      refresh();
    } finally {
      setSaving(false);
    }
  }

  async function importConfiguration(file?: File) {
    if (!file) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const text = await file.text();
      const settings = JSON.parse(text) as WorkspaceSettings;
      const errors = validateSettings(settings);
      setValidationErrors(errors);
      if (errors.length) {
        setSaving(false);
        return;
      }
      const response = await fetch('/api/fraud/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', settings }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.details?.join(' ') ?? payload?.message ?? 'Failed to import configuration.');
        return;
      }
      setMessage(payload.message);
      await reloadSettingsMeta();
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to import configuration.');
    } finally {
      setSaving(false);
    }
  }

  const toggleRule = (ruleId: WorkspaceSettings['enabledRules'][number]) => {
    if (!settings) return;
    const nextRules = settings.enabledRules.includes(ruleId) ? settings.enabledRules.filter((item) => item !== ruleId) : [...settings.enabledRules, ruleId];
    setForm({ ...settings, enabledRules: nextRules });
  };

  return (
    <FraudPage
      eyebrow="SETTINGS + HISTORY"
      title="Settings"
      description="Safe fraud model configuration center with validation, rollback, impact preview, and import/export controls."
      actions={
        <>
          <Button onClick={onSave} disabled={!settings || saving || !dirty || !canEdit}>
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save settings'}
          </Button>
          <Button variant="secondary" onClick={onReset} disabled={saving || !canEdit}>
            <RotateCcw className="h-4 w-4" />
            Reset defaults
          </Button>
          <Button variant="secondary" onClick={() => activeDataset && void runDetection(activeDataset.id)} disabled={!activeDataset || saving}>
            <SlidersHorizontal className="h-4 w-4" />
            Re-run analysis
          </Button>
          <a href="/api/fraud/settings/export" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 hover:bg-white/10">
            <Download className="h-4 w-4" />
            Export configuration JSON
          </a>
          <input ref={importRef} type="file" accept=".json,application/json" className="hidden" onChange={(event) => void importConfiguration(event.target.files?.[0])} />
          <Button variant="secondary" onClick={() => importRef.current?.click()} disabled={!canEdit || saving}>
            <Upload className="h-4 w-4" />
            Import configuration JSON
          </Button>
        </>
      }
    >
      {!settings ? <EmptyState title="Settings unavailable" detail="The server-backed workspace did not return a settings profile." /> : null}
      {settings ? (
        <>
          {!canEdit ? <Card className="border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">Read-only mode is active for role `{role}`. Only admin users can change fraud settings.</Card> : null}
          {message ? <Card className="border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">{message}</Card> : null}
          {error ? <Card className="border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{error}</Card> : null}
          {runDetectionError ? <Card className="border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">{runDetectionError}</Card> : null}
          {validationErrors.length ? (
            <Card className="border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
              <div className="font-semibold">Validation errors</div>
              <ul className="mt-2 list-disc pl-5">
                {validationErrors.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </Card>
          ) : null}

          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 xl:col-span-8 space-y-4">
              <Card>
                <div className="text-sm font-semibold text-slate-100">Model thresholds</div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Anomaly threshold</div>
                    <input type="number" min="0.01" max="1" step="0.01" value={settings.anomalyThreshold} onChange={(event) => setForm({ ...settings, anomalyThreshold: Number(event.target.value) })} disabled={!canEdit} className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none disabled:opacity-60" />
                    <div className="mt-2 text-xs text-slate-400">Expected suspicious rows ≈ {expectedSuspiciousRows?.toLocaleString() ?? 'Not available'} based on historical score buckets.</div>
                  </label>
                  <label className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Contamination</div>
                    <input type="number" min="0.01" max="0.5" step="0.01" value={settings.contamination} onChange={(event) => setForm({ ...settings, contamination: Number(event.target.value) })} disabled={!canEdit} className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none disabled:opacity-60" />
                    <div className="mt-2 text-xs text-slate-400">Expected suspicious share in the dataset. This steers the model sensitivity.</div>
                  </label>
                </div>
              </Card>

              <Card>
                <div className="text-sm font-semibold text-slate-100">Rule thresholds</div>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-400">High amount threshold</div>
                    <input type="number" min="1" step="50" value={settings.highAmountThreshold} onChange={(event) => setForm({ ...settings, highAmountThreshold: Number(event.target.value) })} disabled={!canEdit} className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none disabled:opacity-60" />
                  </label>
                  <label className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Rapid repeat count</div>
                    <input type="number" min="1" step="1" value={settings.rapidRepeatTransactionCount} onChange={(event) => setForm({ ...settings, rapidRepeatTransactionCount: Number(event.target.value) })} disabled={!canEdit} className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none disabled:opacity-60" />
                  </label>
                  <label className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Rapid repeat window (minutes)</div>
                    <input type="number" min="1" step="1" value={settings.rapidRepeatWindowMinutes} onChange={(event) => setForm({ ...settings, rapidRepeatWindowMinutes: Number(event.target.value) })} disabled={!canEdit} className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none disabled:opacity-60" />
                  </label>
                  <label className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Merchant cluster size</div>
                    <input type="number" min="1" step="1" value={settings.merchantClusterSize} onChange={(event) => setForm({ ...settings, merchantClusterSize: Number(event.target.value) })} disabled={!canEdit} className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none disabled:opacity-60" />
                  </label>
                  <label className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Device change window (minutes)</div>
                    <input type="number" min="1" step="1" value={settings.deviceChangeWindowMinutes} onChange={(event) => setForm({ ...settings, deviceChangeWindowMinutes: Number(event.target.value) })} disabled={!canEdit} className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none disabled:opacity-60" />
                  </label>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 md:col-span-2">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Unusual-hour watch window</div>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <input type="number" min="0" max="23" value={settings.unusualHourStart} onChange={(event) => setForm({ ...settings, unusualHourStart: Number(event.target.value) })} disabled={!canEdit} className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none disabled:opacity-60" />
                      <input type="number" min="0" max="23" value={settings.unusualHourEnd} onChange={(event) => setForm({ ...settings, unusualHourEnd: Number(event.target.value) })} disabled={!canEdit} className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none disabled:opacity-60" />
                    </div>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="text-sm font-semibold text-slate-100">Derived label and risk-band settings</div>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Derived high-risk threshold</div>
                    <input type="number" min="1" max="100" step="1" value={settings.derivedHighRiskThreshold} onChange={(event) => setForm({ ...settings, derivedHighRiskThreshold: Number(event.target.value) })} disabled={!canEdit} className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none disabled:opacity-60" />
                  </label>
                  <label className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Derived medium-risk threshold</div>
                    <input type="number" min="1" max="100" step="1" value={settings.derivedMediumRiskThreshold} onChange={(event) => setForm({ ...settings, derivedMediumRiskThreshold: Number(event.target.value) })} disabled={!canEdit} className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none disabled:opacity-60" />
                  </label>
                  <label className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Critical risk band</div>
                    <input type="number" min="1" max="100" step="1" value={settings.riskBands.critical} onChange={(event) => setForm({ ...settings, riskBands: { ...settings.riskBands, critical: Number(event.target.value) } })} disabled={!canEdit} className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none disabled:opacity-60" />
                  </label>
                  <label className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-400">High / medium bands</div>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <input type="number" min="1" max="100" step="1" value={settings.riskBands.high} onChange={(event) => setForm({ ...settings, riskBands: { ...settings.riskBands, high: Number(event.target.value) } })} disabled={!canEdit} className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none disabled:opacity-60" />
                      <input type="number" min="1" max="100" step="1" value={settings.riskBands.medium} onChange={(event) => setForm({ ...settings, riskBands: { ...settings.riskBands, medium: Number(event.target.value) } })} disabled={!canEdit} className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none disabled:opacity-60" />
                    </div>
                  </label>
                </div>
              </Card>

              <Card>
                <div className="text-sm font-semibold text-slate-100">Rule controls and explanations</div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {RULE_OPTIONS.map((rule) => {
                    const checked = settings.enabledRules.includes(rule.id);
                    return (
                      <label key={rule.id} className={`rounded-xl border px-4 py-3 ${checked ? 'border-sky-400/25 bg-sky-500/10' : 'border-white/10 bg-white/5'}`}>
                        <div className="flex items-start gap-3">
                          <input type="checkbox" checked={checked} disabled={!canEdit} onChange={() => toggleRule(rule.id)} className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950/60 text-sky-400 disabled:opacity-60" />
                          <div>
                            <div className="text-sm font-semibold text-slate-100">{rule.label}</div>
                            <div className="mt-1 text-xs text-slate-400">{rule.detail}</div>
                            <div className="mt-2 text-xs text-slate-500">{rule.logic}</div>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </Card>
            </div>

            <div className="col-span-12 xl:col-span-4 space-y-4">
              <Card>
                <div className="text-sm font-semibold text-slate-100">Threshold preview and impact</div>
                <div className="mt-3 rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-3 text-sm text-sky-100">
                  Expected suspicious rows ≈ {expectedSuspiciousRows?.toLocaleString() ?? 'Not available'}
                </div>
                <div className="mt-4 grid gap-4">
                  <div className="h-56">
                    {latestRun?.riskBandDistribution?.some((item) => item.count > 0) ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={latestRun.riskBandDistribution} dataKey="count" nameKey="band" innerRadius={45} outerRadius={80}>
                            {latestRun.riskBandDistribution.map((item) => <Cell key={item.band} fill={{ critical: '#ef4444', high: '#f97316', medium: '#facc15', low: '#22c55e' }[item.band]} />)}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : <div className="flex h-full items-center justify-center text-sm text-slate-400">Run analysis to view risk-band impact.</div>}
                  </div>
                  <div className="h-56">
                    {latestRun?.anomalyScoreDistribution?.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={latestRun.anomalyScoreDistribution}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="bucket" stroke="#94a3b8" />
                          <YAxis stroke="#94a3b8" allowDecimals={false} />
                          <Tooltip />
                          <Bar dataKey="count" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <div className="flex h-full items-center justify-center text-sm text-slate-400">Run analysis to view anomaly-score distribution.</div>}
                  </div>
                  <div className="h-56">
                    {thresholdCurve.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={thresholdCurve}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="threshold" stroke="#94a3b8" />
                          <YAxis stroke="#94a3b8" allowDecimals={false} />
                          <Tooltip />
                          <Line type="monotone" dataKey="expected" stroke="#a78bfa" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : <div className="flex h-full items-center justify-center text-sm text-slate-400">Historical run summaries are required for threshold impact analytics.</div>}
                  </div>
                </div>
              </Card>

              <Card>
                <div className="text-sm font-semibold text-slate-100">Configuration history</div>
                <div className="mt-3 space-y-2">
                  {history.length === 0 ? (
                    <div className="text-sm text-slate-400">No settings history recorded yet.</div>
                  ) : (
                    history.slice(0, 8).map((version) => (
                      <div key={version.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-slate-100">{new Date(version.at).toLocaleString()}</div>
                          <Button variant="ghost" onClick={() => void rollback(version.id)} disabled={!canEdit || saving}>Restore</Button>
                        </div>
                        <div className="mt-1 text-xs text-slate-400">{version.actor}</div>
                        <div className="mt-2 text-xs text-slate-300">
                          anomaly {version.previous.anomalyThreshold.toFixed(2)} → {version.next.anomalyThreshold.toFixed(2)} |
                          contamination {version.previous.contamination.toFixed(2)} → {version.next.contamination.toFixed(2)} |
                          high amount {version.previous.highAmountThreshold} → {version.next.highAmountThreshold}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card>
                <div className="text-sm font-semibold text-slate-100">Current workspace context</div>
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><div className="text-xs text-slate-400">Role</div><div className="mt-1 text-sm text-slate-100">{role}</div></div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><div className="text-xs text-slate-400">Active dataset</div><div className="mt-1 text-sm text-slate-100">{activeDataset?.name ?? 'No dataset selected'}</div></div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><div className="text-xs text-slate-400">Readiness</div><div className="mt-1 text-sm text-slate-100">{activeDataset?.analysisReadiness?.replace(/_/g, ' ') ?? 'No dataset selected'}</div></div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><div className="text-xs text-slate-400">Latest run</div><div className="mt-1 text-sm text-slate-100">{latestRun ? `${new Date(latestRun.completedAt ?? latestRun.startedAt).toLocaleString()} | ${latestRun.metrics.suspiciousTransactions.toLocaleString()} suspicious` : 'No runs executed yet'}</div></div>
                </div>
                <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-3 text-sm text-amber-100">
                  <AlertCircle className="mr-2 inline h-4 w-4" />
                  Threshold changes do not retroactively change an existing run. Save first, then rerun analysis.
                </div>
              </Card>

              <Card>
                <div className="text-sm font-semibold text-slate-100">Run history</div>
                <div className="mt-3 space-y-2">
                  {runs.length === 0 ? (
                    <div className="text-sm text-slate-400">No runs executed yet.</div>
                  ) : (
                    runs.slice(0, 8).map((run) => (
                      <div key={run.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        <div className="text-sm font-semibold text-slate-100">
                          {workspace?.datasets.find((dataset) => dataset.id === run.datasetId)?.name ?? run.datasetId}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {new Date(run.completedAt ?? run.startedAt).toLocaleString()} | {run.metrics.totalTransactions.toLocaleString()} rows | {run.metrics.suspiciousTransactions.toLocaleString()} suspicious | threshold {run.threshold.toFixed(2)} | contamination {run.contamination.toFixed(2)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>
          </div>

          {!activeDataset ? <EmptyState title="No dataset selected" detail="Upload a dataset to apply settings against a real fraud analysis workflow." ctaHref="/data-upload" ctaLabel="Open Data Upload" /> : null}
        </>
      ) : null}
    </FraudPage>
  );
}
