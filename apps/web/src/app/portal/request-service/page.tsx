'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { api, type ApiError } from '../../../lib/api';

type CatalogService = {
  service_key: string;
  name: string;
};

type Me = {
  user?: { name?: string | null; email?: string | null };
};

const inputClass = 'h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-sky-300 focus:bg-white';
const textareaClass = 'min-h-[160px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-300 focus:bg-white';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-medium text-slate-700">{label}{required ? ' *' : ''}</div>
      {children}
    </label>
  );
}

export default function PortalRequestServicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedService = searchParams.get('service') ?? '';
  const [services, setServices] = useState<CatalogService[]>([]);
  const [serviceKey, setServiceKey] = useState(selectedService);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [requester, setRequester] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      api.get<CatalogService[]>('itsm/catalog'),
      fetch('/api/session/me', { cache: 'no-store' }).then(async (res) => (res.ok ? ((await res.json()) as Me) : null)),
    ]).then(([catalog, me]) => {
      if (!active) return;
      if (catalog.ok) {
        const items = catalog.data ?? [];
        setServices(items);
        setServiceKey((value) => value || items[0]?.service_key || '');
      }
      if (me?.user) {
        setRequester(me.user.name || me.user.email || '');
      }
    });
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const resolvedServiceKey = serviceKey || services[0]?.service_key || '';
    if (!resolvedServiceKey) return setError('Select a service item.');
    if (subject.trim().length < 8) return setError('Subject must be at least 8 characters.');
    if (description.trim().length < 12) return setError('Description must be at least 12 characters.');
    setSubmitting(true);
    const result = await api.post<{ id: number }>('itsm/service-requests', {
      service_key: resolvedServiceKey,
      short_description: subject.trim(),
      justification: description.trim(),
      requester: requester.trim(),
      attachment_name: attachmentName.trim(),
    });
    setSubmitting(false);
    if (!result.ok) {
      const err = result.error as ApiError;
      setError(`${err.message} (${err.code}${err.request_id ? ` · ${err.request_id}` : ''})`);
      return;
    }
    router.push(`/portal/requests/service-request/${result.data?.id}?created=SR-${result.data?.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Request Service</div>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Open a service request</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">This creates a real service request that the internal service desk can see in the shared queue.</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <Field label="Service item" required>
          <select value={serviceKey} onChange={(event) => setServiceKey(event.target.value)} className={inputClass}>
            {services.map((service) => <option key={service.service_key} value={service.service_key}>{service.name}</option>)}
          </select>
        </Field>
        <Field label="Subject" required><input value={subject} onChange={(event) => setSubject(event.target.value)} className={inputClass} placeholder="Request access to the finance reporting app" /></Field>
        <Field label="Description" required><textarea value={description} onChange={(event) => setDescription(event.target.value)} className={textareaClass} placeholder="Describe what you need, who it is for, and any time sensitivity." /></Field>
        <Field label="Requester"><input value={requester} onChange={(event) => setRequester(event.target.value)} className={inputClass} /></Field>
        <Field label="Attachment name"><input value={attachmentName} onChange={(event) => setAttachmentName(event.target.value)} className={inputClass} placeholder="optional-reference.pdf" /></Field>
        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        <div className="flex gap-3">
          <Link href="/portal/catalog" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Cancel</Link>
          <button type="submit" disabled={submitting} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
            {submitting ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      </form>
    </div>
  );
}
