'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Card, EmptyState, FraudPage } from '../../components/fraud/FraudUi';
import { useFraudServerWorkspace } from '../../hooks/useFraudServerWorkspace';

export default function EvidencePage() {
  const { workspace } = useFraudServerWorkspace();
  const [query, setQuery] = useState('');
  const casesById = useMemo(() => new Map((workspace?.cases ?? []).map((item) => [item.id, item])), [workspace?.cases]);
  const filtered = (workspace?.documents ?? []).filter((document) => `${document.name} ${document.snippet}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <FraudPage eyebrow="EVIDENCE REVIEW" title="Evidence" description="Inspect server-backed PDF evidence, parser state, snippets, and links back to cases and suspicious records.">
      <Card>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by file name or evidence snippet" className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/50 px-9 text-sm text-slate-100 placeholder:text-slate-500" />
        </label>
      </Card>
      {(workspace?.documents.length ?? 0) === 0 ? (
        <EmptyState title="No evidence uploaded" detail="Upload PDF evidence from the Data Upload tab." ctaHref="/data-upload" ctaLabel="Open Data Upload" />
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {filtered.map((document) => (
            <div key={document.id} className="col-span-12 lg:col-span-6">
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{document.name}</div>
                    <div className="mt-1 text-xs text-slate-400">{document.parseStatus} • {new Date(document.uploadedAt).toLocaleString()}</div>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200">{document.linkedCaseIds.length} cases</div>
                </div>
                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">{document.snippet}</div>
                <div className="mt-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Linked cases</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {document.linkedCaseIds.length === 0 ? <span className="text-sm text-slate-400">No linked cases yet.</span> : document.linkedCaseIds.map((caseId) => <span key={caseId} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200">{casesById.get(caseId)?.title ?? caseId}</span>)}
                  </div>
                </div>
                <div className="mt-4 text-xs text-amber-200">OCR is not implemented in this build. Image-only PDFs remain durably stored but are marked as not fully parsed.</div>
              </Card>
            </div>
          ))}
        </div>
      )}
    </FraudPage>
  );
}
