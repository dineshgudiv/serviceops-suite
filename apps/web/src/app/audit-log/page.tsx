'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { Button, Card, EmptyState, FraudPage } from '../../components/fraud/FraudUi';
import type { ServerAuditEvent } from '../../lib/fraud/server-types';

type AuditResponse = {
  page: number;
  pageSize: number;
  total: number;
  rows: ServerAuditEvent[];
  eventTypes: string[];
  datasets: Array<{ id: string; name: string }>;
  users: string[];
};

function severityTone(severity: ServerAuditEvent['severity']) {
  if (severity === 'ERROR') return 'border-red-400/30 bg-red-500/10 text-red-100';
  if (severity === 'WARNING') return 'border-amber-400/30 bg-amber-500/10 text-amber-100';
  if (severity === 'SECURITY') return 'border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100';
  return 'border-sky-400/25 bg-sky-500/10 text-sky-100';
}

function contextLink(event: ServerAuditEvent) {
  if (event.action === 'analysis_completed') return { href: '/fraud-detection', label: 'Open Fraud Detection' };
  if (event.action === 'report_generated' && event.details?.report_id) return { href: `/api/fraud/reports/${event.details.report_id}/download`, label: 'Download report' };
  if (event.action === 'dataset_parsed' || event.action === 'upload_started' || event.action === 'dataset_deleted') return { href: '/data-upload', label: 'Open Data Upload' };
  if (event.action === 'settings_updated') return { href: '/settings', label: 'Open Settings' };
  if (event.action.includes('case')) return { href: '/cases', label: 'Open Cases' };
  return null;
}

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [eventType, setEventType] = useState('');
  const [dataset, setDataset] = useState('');
  const [user, setUser] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const searchParams = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '50' });
    if (query) params.set('query', query);
    if (eventType) params.set('eventType', eventType);
    if (dataset) params.set('dataset', dataset);
    if (user) params.set('user', user);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    return params.toString();
  }, [page, query, eventType, dataset, user, dateFrom, dateTo]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/fraud/audit?${searchParams}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((payload: AuditResponse) => {
        if (!cancelled) setData(payload);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return (
    <FraudPage
      eyebrow="OPERATOR AUDIT"
      title="Audit Log"
      description="Searchable, filterable, server-backed audit trail for uploads, parsing, analysis, reporting, and investigator actions."
      actions={
        <>
          <a href={`/api/fraud/audit/export?${searchParams}&format=csv`} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 hover:bg-white/10">
            <Download className="h-4 w-4" />
            Download audit log CSV
          </a>
          <a href={`/api/fraud/audit/export?${searchParams}&format=json`} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 hover:bg-white/10">
            <Download className="h-4 w-4" />
            Download audit log JSON
          </a>
        </>
      }
    >
      <Card>
        <div className="grid gap-3 xl:grid-cols-6">
          <input value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder="Search dataset id, job id, report id, filename, username" className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none xl:col-span-2" />
          <select value={eventType} onChange={(event) => { setPage(1); setEventType(event.target.value); }} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100 outline-none">
            <option value="">All event types</option>
            {(data?.eventTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={dataset} onChange={(event) => { setPage(1); setDataset(event.target.value); }} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100 outline-none">
            <option value="">All datasets</option>
            {(data?.datasets ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select value={user} onChange={(event) => { setPage(1); setUser(event.target.value); }} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100 outline-none">
            <option value="">All users</option>
            {(data?.users ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input value={dateFrom} onChange={(event) => { setPage(1); setDateFrom(event.target.value); }} type="date" className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100 outline-none" />
            <input value={dateTo} onChange={(event) => { setPage(1); setDateTo(event.target.value); }} type="date" className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100 outline-none" />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button variant="secondary" onClick={() => { setPage(1); setQuery(''); setEventType(''); setDataset(''); setUser(''); setDateFrom(''); setDateTo(''); }}>Reset filters</Button>
        </div>
      </Card>

      <Card>
        <div className="text-sm font-semibold text-slate-100">Active dataset timeline</div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          {['upload_started', 'dataset_parsed', 'analysis_completed', 'report_generated'].map((action) => {
            const event = data?.rows.find((item) => item.action === action);
            return (
              <div key={action} className={`rounded-xl border px-4 py-3 ${event ? severityTone(event.severity) : 'border-white/10 bg-white/5 text-slate-300'}`}>
                <div className="text-xs uppercase tracking-[0.18em]">{action.replace(/_/g, ' ')}</div>
                <div className="mt-2 text-sm">{event ? new Date(event.at).toLocaleString() : 'pending'}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {loading ? (
        <EmptyState title="Loading audit trail" detail="Querying the server-backed audit log with the current filters." />
      ) : !data?.rows.length ? (
        <EmptyState title="No audit events found" detail="Adjust the current filters or generate uploads, analysis runs, reports, or settings changes to populate the audit trail." ctaHref="/data-upload" ctaLabel="Open Data Upload" />
      ) : (
        <div className="space-y-3">
          {data.rows.map((event) => {
            const link = contextLink(event);
            return (
              <Card key={event.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-slate-100">{event.action}</div>
                      <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${severityTone(event.severity)}`}>{event.severity}</span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-slate-300">{event.category}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{event.resource}</div>
                  </div>
                  <div className="text-xs text-slate-400">{new Date(event.at).toLocaleString()} • {event.actor}</div>
                </div>
                {event.details ? <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">{Object.entries(event.details).map(([key, value]) => `${key}: ${String(value)}`).join(' | ')}</div> : null}
                {link ? (
                  <div className="mt-3">
                    <Link href={link.href} className="text-sm text-sky-300 hover:text-sky-200">{link.label}</Link>
                  </div>
                ) : null}
              </Card>
            );
          })}

          <Card>
            <div className="flex items-center justify-between gap-3">
              <Button variant="secondary" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>Previous</Button>
              <div className="text-xs text-slate-400">Server-side page {data.page} of {Math.max(1, Math.ceil(data.total / data.pageSize))} • {data.total.toLocaleString()} matching events</div>
              <Button variant="secondary" onClick={() => setPage((value) => (value * (data.pageSize || 50) < data.total ? value + 1 : value))} disabled={page * (data.pageSize || 50) >= data.total}>Next</Button>
            </div>
          </Card>
        </div>
      )}
    </FraudPage>
  );
}
