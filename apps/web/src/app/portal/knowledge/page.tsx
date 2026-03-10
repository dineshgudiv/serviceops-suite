'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { api, type ApiError } from '../../../lib/api';

type Article = {
  id: number;
  title: string;
  excerpt: string;
  service_key?: string;
  tags?: string[];
  updated_at?: string;
};

function formatError(error?: ApiError | null) {
  if (!error) return null;
  return `${error.message} (${error.code}${error.request_id ? ` · ${error.request_id}` : ''})`;
}

export default function PortalKnowledgePage() {
  const searchParams = useSearchParams();
  const initial = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(initial);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void api
      .get<Article[]>(`knowledge/portal/documents?q=${encodeURIComponent(initial)}`)
      .then((result) => {
        if (!active) return;
        if (result.ok) setArticles(result.data ?? []);
        else setError(result.error ?? null);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initial]);

  const title = useMemo(() => (initial ? `Results for "${initial}"` : 'Browse Knowledge'), [initial]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.location.assign(`/portal/knowledge?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Knowledge Search</div>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Only approved requester-safe articles are shown here.</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm md:flex-row">
        <label className="flex flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Search articles, reset password, access, VPN, laptop…" />
        </label>
        <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
          Search
        </button>
      </form>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formatError(error)}</div> : null}
      {loading ? <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading articles…</div> : null}

      {!loading && !articles.length ? (
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-600">No approved knowledge matched this search yet.</div>
      ) : null}

      <div className="grid gap-4">
        {articles.map((article) => (
          <Link key={article.id} href={`/portal/knowledge/${article.id}`} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition hover:border-sky-300 hover:shadow-md">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
              <span>KB-{article.id}</span>
              {article.service_key ? <span className="rounded-full bg-slate-100 px-2 py-1">{article.service_key}</span> : null}
            </div>
            <div className="mt-3 text-lg font-semibold text-slate-950">{article.title}</div>
            <div className="mt-2 text-sm leading-6 text-slate-600">{article.excerpt}</div>
            {article.tags?.length ? <div className="mt-3 flex flex-wrap gap-2">{article.tags.map((tag) => <span key={tag} className="rounded-full bg-sky-50 px-2 py-1 text-xs text-sky-700">{tag}</span>)}</div> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
