'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api, type ApiError } from '../../../lib/api';

type CatalogService = {
  service_key: string;
  name: string;
  owner?: string;
};

function deriveCategory(service: CatalogService) {
  const hay = `${service.service_key} ${service.name}`.toLowerCase();
  if (hay.includes('hr')) return 'HR Request';
  if (hay.includes('admin')) return 'Admin Request';
  if (hay.includes('access') || hay.includes('laptop') || hay.includes('software') || hay.includes('it') || hay.includes('svc')) return 'IT Request';
  return 'Other';
}

export default function PortalCatalogPage() {
  const [services, setServices] = useState<CatalogService[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let active = true;
    void api.get<CatalogService[]>('itsm/catalog').then((result) => {
      if (!active) return;
      if (result.ok) setServices(result.data ?? []);
      else setError(result.error ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(() => ['All', ...Array.from(new Set(services.map(deriveCategory)))], [services]);
  const filtered = services.filter((service) => {
    const matchesCategory = category === 'All' || deriveCategory(service) === category;
    const hay = `${service.name} ${service.service_key} ${service.owner ?? ''}`.toLowerCase();
    return matchesCategory && hay.includes(query.trim().toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Service Catalog</div>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Request standard services</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Choose a service item and open a real catalog-backed request.</p>
      </div>
      <div className="flex flex-col gap-3 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm md:flex-row">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by service or owner" className="h-12 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none" />
        <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none">
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</div> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((service) => (
          <div key={service.service_key} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{deriveCategory(service)}</div>
            <div className="mt-3 text-lg font-semibold text-slate-950">{service.name}</div>
            <div className="mt-2 text-sm text-slate-600">Service key: {service.service_key}</div>
            <div className="mt-1 text-sm text-slate-600">Owner: {service.owner || 'Service desk'}</div>
            <Link href={`/portal/request-service?service=${encodeURIComponent(service.service_key)}`} className="mt-5 inline-flex rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
              Request this service
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
