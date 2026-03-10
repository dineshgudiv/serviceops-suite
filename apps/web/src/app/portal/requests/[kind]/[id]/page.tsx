'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, type ApiError } from '../../../../../lib/api';

type Comment = {
  id: number;
  entry_type: string;
  actor: string;
  summary: string;
  details: string;
  created_at: string;
};

type RequestDetail = {
  kind: 'incident' | 'service-request';
  id: string;
  numeric_id: number;
  title: string;
  description: string;
  status: string;
  priority?: string | null;
  impact?: string | null;
  urgency?: string | null;
  assignee?: string | null;
  attachment_name?: string | null;
  resolution?: string | null;
  created_at?: string;
  updated_at?: string;
  comments: Comment[];
};

export default function PortalRequestDetailPage({ params }: { params: { kind: string; id: string } }) {
  const searchParams = useSearchParams();
  const created = searchParams.get('created');
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [commentSummary, setCommentSummary] = useState('');
  const [commentDetails, setCommentDetails] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const result = await api.get<RequestDetail>(`itsm/portal/requests/${params.kind}/${params.id}`);
    if (result.ok) {
      setDetail(result.data ?? null);
      setError(null);
    } else {
      setError(result.error ?? null);
    }
  }

  useEffect(() => {
    void load();
  }, [params.kind, params.id]);

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const result = await api.post(`itsm/portal/requests/${params.kind}/${params.id}/comments`, {
      summary: commentSummary.trim(),
      details: commentDetails.trim(),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? null);
      return;
    }
    setCommentSummary('');
    setCommentDetails('');
    await load();
  }

  if (error) return <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error.message}</div>;
  if (!detail) return <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading request details…</div>;

  return (
    <div className="space-y-6">
      {created ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{created} submitted successfully.</div> : null}
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{detail.kind === 'incident' ? 'Incident' : 'Service Request'}</div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">{detail.title}</h1>
            <div className="mt-2 text-sm text-slate-600">{detail.id} · {detail.status}</div>
          </div>
          <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
            <div>Created: {detail.created_at ? new Date(detail.created_at).toLocaleString() : '—'}</div>
            <div className="mt-1">Updated: {detail.updated_at ? new Date(detail.updated_at).toLocaleString() : '—'}</div>
          </div>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div>
            <div className="text-sm font-semibold text-slate-900">Description</div>
            <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{detail.description}</div>
            {detail.resolution ? (
              <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-sm font-semibold text-emerald-900">Resolution</div>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-emerald-800">{detail.resolution}</div>
              </div>
            ) : null}
          </div>
          <div className="space-y-3 rounded-[28px] bg-slate-50 p-5">
            <Meta label="Status" value={detail.status} />
            <Meta label="Priority" value={detail.priority || '—'} />
            <Meta label="Impact" value={detail.impact || '—'} />
            <Meta label="Urgency" value={detail.urgency || '—'} />
            <Meta label="Attachment" value={detail.attachment_name || '—'} />
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-semibold text-slate-950">Comments and updates</div>
          <div className="mt-4 space-y-4">
            {detail.comments.map((comment) => (
              <div key={comment.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">{comment.summary}</div>
                  <div className="text-xs text-slate-500">{new Date(comment.created_at).toLocaleString()}</div>
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{comment.entry_type} · {comment.actor}</div>
                {comment.details ? <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{comment.details}</div> : null}
              </div>
            ))}
            {!detail.comments.length ? <div className="text-sm text-slate-600">No conversation entries yet.</div> : null}
          </div>
        </div>
        <form onSubmit={submitComment} className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-semibold text-slate-950">Add a comment</div>
          <div className="mt-4 space-y-4">
            <input value={commentSummary} onChange={(event) => setCommentSummary(event.target.value)} placeholder="Short update summary" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none" />
            <textarea value={commentDetails} onChange={(event) => setCommentDetails(event.target.value)} placeholder="Add any clarification for the service desk." className="min-h-[180px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none" />
            <button type="submit" disabled={submitting} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
              {submitting ? 'Posting…' : 'Post comment'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-slate-800">{value}</div>
    </div>
  );
}
