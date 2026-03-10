'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type ApiError } from '../../../lib/api';

type RequestItem = {
  id: string;
  numeric_id: number;
  kind: 'incident' | 'service-request';
  title: string;
  type: string;
  status: string;
  priority?: string | null;
  updated_at?: string;
};

export default function PortalMyRequestsPage() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<RequestItem[]>([]);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let active = true;
    void api.get<RequestItem[]>(`itsm/portal/requests?q=${encodeURIComponent(query)}`).then((result) => {
      if (!active) return;
      if (result.ok) setItems(result.data ?? []);
      else setError(result.error ?? null);
    });
    return () => {
      active = false;
    };
  }, [query]);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">My Requests</div>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Only your own records</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">This view is filtered to the logged-in requester. It does not expose queue-wide records.</p>
      </div>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by ID or title" className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none shadow-sm" />
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</div> : null}
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[1.2fr_3fr_1.4fr_1.4fr_1.4fr] gap-3 border-b border-slate-200 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          <div>ID</div>
          <div>Title</div>
          <div>Type</div>
          <div>Status</div>
          <div>Updated</div>
        </div>
        {items.map((item) => (
          <Link key={`${item.kind}-${item.numeric_id}`} href={`/portal/requests/${item.kind}/${item.numeric_id}`} className="grid grid-cols-[1.2fr_3fr_1.4fr_1.4fr_1.4fr] gap-3 border-b border-slate-100 px-5 py-4 text-sm transition hover:bg-slate-50">
            <div className="font-semibold text-slate-950">{item.id}</div>
            <div className="text-slate-700">{item.title}</div>
            <div className="text-slate-600">{item.type}</div>
            <div className="text-slate-600">{item.status}</div>
            <div className="text-slate-500">{item.updated_at ? new Date(item.updated_at).toLocaleString() : '—'}</div>
          </Link>
        ))}
        {!items.length ? <div className="px-5 py-6 text-sm text-slate-600">No requests found for this requester yet.</div> : null}
      </div>
    </div>
  );
}
