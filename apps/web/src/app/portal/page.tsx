'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, ClipboardList, LifeBuoy, Search, Sparkles } from 'lucide-react';
import { FormEvent, useState } from 'react';

const ACTIONS = [
  {
    href: '/portal/knowledge',
    title: 'Browse Knowledge',
    description: 'Search approved support articles before opening a new ticket.',
    icon: BookOpen,
  },
  {
    href: '/portal/catalog',
    title: 'Request a Service',
    description: 'Open a catalog-backed service request for access, software, or standard fulfillment.',
    icon: Sparkles,
  },
  {
    href: '/portal/report-issue',
    title: 'Report an Issue',
    description: 'Create an incident for breakage, outage symptoms, or degraded user experience.',
    icon: LifeBuoy,
  },
  {
    href: '/portal/my-requests',
    title: 'My Requests',
    description: 'Track the status, comments, and latest updates for your own records only.',
    icon: ClipboardList,
  },
];

export default function PortalHomePage() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(`/portal/knowledge?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] bg-slate-950 px-6 py-8 text-white shadow-[0_30px_80px_-40px_rgba(2,6,23,0.9)] lg:px-10">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-200/75">Self Service</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Support for requesters without the admin console overhead.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Search approved knowledge, request a standard service, report an issue, and track your own records from one simpler surface.
          </p>
          <form onSubmit={onSearch} className="mt-6 flex flex-col gap-3 sm:flex-row">
            <label className="flex flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search knowledge articles, password resets, VPN access, onboarding…"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-400"
                aria-label="Knowledge search"
              />
            </label>
            <button type="submit" className="rounded-2xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300">
              Search Knowledge
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.55)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_70px_-40px_rgba(14,165,233,0.35)]"
            >
              <div className="inline-flex rounded-2xl bg-sky-100 p-3 text-sky-700">
                <Icon className="h-5 w-5" />
              </div>
              <div className="mt-4 text-lg font-semibold text-slate-900">{action.title}</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">{action.description}</div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
