'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type ApiError } from '../../../../lib/api';

type Article = {
  id: number;
  title: string;
  content: string;
  excerpt: string;
  service_key?: string;
  tags?: string[];
};

export default function PortalKnowledgeDetailPage({ params }: { params: { id: string } }) {
  const [article, setArticle] = useState<Article | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let active = true;
    void api.get<Article>(`knowledge/portal/documents/${params.id}`).then((result) => {
      if (!active) return;
      if (result.ok) setArticle(result.data ?? null);
      else setError(result.error ?? null);
    });
    return () => {
      active = false;
    };
  }, [params.id]);

  if (error) return <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error.message}</div>;
  if (!article) return <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading article…</div>;

  return (
    <div className="space-y-5">
      <Link href="/portal/knowledge" className="inline-flex text-sm font-medium text-sky-700 hover:text-sky-600">Back to knowledge search</Link>
      <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">KB-{article.id}</div>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">{article.title}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
          {article.service_key ? <span className="rounded-full bg-slate-100 px-2 py-1">{article.service_key}</span> : null}
          {article.tags?.map((tag) => <span key={tag} className="rounded-full bg-sky-50 px-2 py-1 text-sky-700">{tag}</span>)}
        </div>
        <div className="mt-6 whitespace-pre-wrap text-sm leading-7 text-slate-700">{article.content}</div>
      </article>
    </div>
  );
}
