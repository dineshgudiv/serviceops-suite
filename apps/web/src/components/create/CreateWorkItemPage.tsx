'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, BriefcaseBusiness, ClipboardList, Loader2, Plus, ShieldAlert, TriangleAlert, Wrench } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, type ApiError } from '../../lib/api';

type SessionMe = {
  user?: {
    id?: string;
    email?: string;
    name?: string;
    role?: string;
  };
  role?: string;
};

type CatalogService = {
  service_key: string;
  name: string;
};

type IncidentChoice = {
  id: string;
  title: string;
};

type CreateKind = 'incident' | 'service-request' | 'change' | 'problem';

const inputClass =
  'h-12 w-full rounded-2xl border border-white/10 bg-slate-950/55 px-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400/40 focus:ring-2 focus:ring-sky-400/20';

const textareaClass =
  'min-h-[120px] w-full rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400/40 focus:ring-2 focus:ring-sky-400/20';

const CONFIG = {
  incident: {
    title: 'New Incident',
    subtitle: 'Issue or breakage',
    helper: 'Use incidents for active service degradation, outages, and user-facing breakage.',
    routeBack: '/incidents',
    submitPath: 'itsm/incidents',
    successPrefix: 'INC',
    successRoute: '/incidents',
    allowedRoles: ['ADMIN', 'ANALYST'],
  },
  'service-request': {
    title: 'New Service Request',
    subtitle: 'Need access, software, or a standard service',
    helper: 'Use service requests for catalog-backed asks such as access, software, and standard fulfillment.',
    routeBack: '/catalog',
    submitPath: 'itsm/service-requests',
    successPrefix: 'SR',
    successRoute: '/catalog',
    allowedRoles: ['ADMIN', 'ANALYST'],
  },
  change: {
    title: 'New Change',
    subtitle: 'Planned modification',
    helper: 'Use changes for planned production modifications that need implementation planning and rollback readiness.',
    routeBack: '/changes',
    submitPath: 'itsm/changes',
    successPrefix: 'CHG',
    successRoute: '/changes',
    allowedRoles: ['ADMIN', 'ANALYST'],
  },
  problem: {
    title: 'New Problem',
    subtitle: 'Root-cause investigation',
    helper: 'Use problems for recurring or high-impact issues that need deeper root-cause analysis.',
    routeBack: '/problems',
    submitPath: 'itsm/problems',
    successPrefix: 'PRB',
    successRoute: '/problems',
    allowedRoles: ['ADMIN', 'ANALYST'],
  },
} as const;

function formatApiError(error?: ApiError | null) {
  if (!error) return null;
  return `${error.code}: ${error.message}${error.request_id ? ` (request_id=${error.request_id})` : ''}`;
}

function derivePriority(impact: string, urgency: string) {
  if (impact === 'HIGH' && urgency === 'HIGH') return 'P1';
  if (impact === 'HIGH' || urgency === 'HIGH') return 'P2';
  if (impact === 'MEDIUM' && urgency === 'MEDIUM') return 'P3';
  return 'P4';
}

export default function CreateWorkItemPage({ kind }: { kind: CreateKind }) {
  const config = CONFIG[kind];
  const router = useRouter();
  const [session, setSession] = useState<SessionMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<ApiError | null>(null);
  const [services, setServices] = useState<CatalogService[]>([]);
  const [incidents, setIncidents] = useState<IncidentChoice[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [incidentTitle, setIncidentTitle] = useState('');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [incidentImpact, setIncidentImpact] = useState('MEDIUM');
  const [incidentUrgency, setIncidentUrgency] = useState('MEDIUM');
  const [incidentCategory, setIncidentCategory] = useState('GENERAL');
  const [incidentRequester, setIncidentRequester] = useState('');
  const [incidentService, setIncidentService] = useState('');
  const [incidentCi, setIncidentCi] = useState('');
  const [incidentAttachment, setIncidentAttachment] = useState('');

  const [requestService, setRequestService] = useState('');
  const [requestShortDescription, setRequestShortDescription] = useState('');
  const [requestJustification, setRequestJustification] = useState('');
  const [requestRequester, setRequestRequester] = useState('');
  const [requestApprovalTarget, setRequestApprovalTarget] = useState('');

  const [changeTitle, setChangeTitle] = useState('');
  const [changeDescription, setChangeDescription] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [changeRisk, setChangeRisk] = useState('P3');
  const [changeImplementationPlan, setChangeImplementationPlan] = useState('');
  const [changeRollbackPlan, setChangeRollbackPlan] = useState('');
  const [changeWindowStart, setChangeWindowStart] = useState('');
  const [changeWindowEnd, setChangeWindowEnd] = useState('');
  const [changeRequester, setChangeRequester] = useState('');
  const [changeService, setChangeService] = useState('');
  const [changeCi, setChangeCi] = useState('');

  const [problemTitle, setProblemTitle] = useState('');
  const [problemDescription, setProblemDescription] = useState('');
  const [problemLinkedIncident, setProblemLinkedIncident] = useState('');
  const [problemImpactSummary, setProblemImpactSummary] = useState('');
  const [problemRootCause, setProblemRootCause] = useState('');
  const [problemService, setProblemService] = useState('');

  const currentRole = session?.user?.role ?? session?.role ?? '';
  const allowed = (config.allowedRoles as readonly string[]).includes(currentRole);
  const incidentPriority = useMemo(() => derivePriority(incidentImpact, incidentUrgency), [incidentImpact, incidentUrgency]);

  useEffect(() => {
    let active = true;
    async function load() {
      const [me, servicesRes, incidentsRes] = await Promise.all([
        fetch('/api/session/me', { cache: 'no-store' }).then(async (res) => (res.ok ? res.json() : null)),
        api.get<CatalogService[]>('itsm/catalog'),
        api.get<Array<{ id: string | number; title: string }>>('itsm/incidents'),
      ]);
      if (!active) return;
      setSession(me);
      if (servicesRes.ok) {
        const nextServices = servicesRes.data ?? [];
        setServices(nextServices);
        if (nextServices.length) {
          const defaultKey = nextServices[0].service_key;
          setIncidentService((value) => value || defaultKey);
          setRequestService((value) => value || defaultKey);
          setChangeService((value) => value || defaultKey);
          setProblemService((value) => value || defaultKey);
        }
      } else {
        setCatalogError(servicesRes.error ?? null);
      }
      if (incidentsRes.ok) {
        setIncidents((incidentsRes.data ?? []).map((item) => ({ id: String(item.id), title: item.title })));
      }
      if (me?.user) {
        const requesterDefault = me.user.name ?? me.user.email ?? '';
        setIncidentRequester((value) => value || requesterDefault);
        setRequestRequester((value) => value || requesterDefault);
        setChangeRequester((value) => value || requesterDefault);
      }
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!allowed) {
      setFormError('Your role is not allowed to create this work item.');
      return;
    }
    let payload: Record<string, string> = {};
    if (kind === 'incident') {
      if (incidentTitle.trim().length < 3) return setFormError('Title must be at least 3 characters.');
      if (incidentDescription.trim().length < 12) return setFormError('Description must be at least 12 characters.');
      if (!incidentRequester.trim()) return setFormError('Requester is required.');
      payload = {
        title: incidentTitle.trim(),
        description: incidentDescription.trim(),
        impact: incidentImpact,
        urgency: incidentUrgency,
        category: incidentCategory,
        requester: incidentRequester.trim(),
        service_key: incidentService,
        ci_key: incidentCi.trim(),
        attachment_name: incidentAttachment.trim(),
      };
    } else if (kind === 'service-request') {
      if (!requestService) return setFormError('Service selection is required.');
      if (requestShortDescription.trim().length < 8) return setFormError('Short description must be at least 8 characters.');
      if (requestJustification.trim().length < 12) return setFormError('Justification must be at least 12 characters.');
      if (!requestRequester.trim()) return setFormError('Requester is required.');
      payload = {
        service_key: requestService,
        short_description: requestShortDescription.trim(),
        justification: requestJustification.trim(),
        requester: requestRequester.trim(),
        approval_target: requestApprovalTarget.trim(),
      };
    } else if (kind === 'change') {
      if (changeTitle.trim().length < 3) return setFormError('Title must be at least 3 characters.');
      if (changeDescription.trim().length < 12) return setFormError('Description must be at least 12 characters.');
      if (changeReason.trim().length < 8) return setFormError('Reason must be at least 8 characters.');
      if (changeImplementationPlan.trim().length < 12) return setFormError('Implementation plan must be at least 12 characters.');
      if (changeRollbackPlan.trim().length < 8) return setFormError('Rollback plan must be at least 8 characters.');
      if (!changeWindowStart || !changeWindowEnd) return setFormError('Scheduled window start and end are required.');
      payload = {
        title: changeTitle.trim(),
        description: changeDescription.trim(),
        reason: changeReason.trim(),
        risk: changeRisk,
        plan: changeImplementationPlan.trim(),
        rollback_plan: changeRollbackPlan.trim(),
        change_window_start: new Date(changeWindowStart).toISOString(),
        change_window_end: new Date(changeWindowEnd).toISOString(),
        service_key: changeService,
        ci_key: changeCi.trim(),
        requester: changeRequester.trim(),
      };
    } else {
      if (problemTitle.trim().length < 3) return setFormError('Title must be at least 3 characters.');
      if (problemDescription.trim().length < 12) return setFormError('Description must be at least 12 characters.');
      payload = {
        title: problemTitle.trim(),
        description: problemDescription.trim(),
        impact_summary: problemImpactSummary.trim(),
        suspected_root_cause: problemRootCause.trim(),
        incident_id: problemLinkedIncident,
        service_key: problemService,
      };
    }

    setSubmitting(true);
    const result = await api.post<{ id: string | number }>(config.submitPath, payload);
    setSubmitting(false);
    if (!result.ok) {
      setFormError(formatApiError(result.error));
      return;
    }
    router.push(`${config.successRoute}?created=${encodeURIComponent(`${config.successPrefix}-${result.data?.id}`)}`);
    router.refresh();
  }

  return (
    <div className="min-h-[calc(100vh-140px)] bg-[radial-gradient(1200px_circle_at_20%_-10%,rgba(56,189,248,0.18),transparent_40%),radial-gradient(900px_circle_at_90%_0%,rgba(16,185,129,0.14),transparent_35%),radial-gradient(800px_circle_at_50%_120%,rgba(245,158,11,0.10),transparent_45%)] px-5 py-5">
      <div className="mx-auto max-w-[980px]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold tracking-wide text-slate-400">CREATE WORK</div>
            <h1 className="mt-1 text-3xl font-semibold text-slate-100">{config.title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">{config.helper}</p>
          </div>
          <Link href={config.routeBack} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 transition hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_0.9fr]">
          <section className="rounded-3xl border border-white/10 bg-slate-950/45 p-6 shadow-[0_12px_50px_-20px_rgba(0,0,0,.7)] backdrop-blur">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading create form…
              </div>
            ) : catalogError ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{formatApiError(catalogError)}</div>
            ) : !allowed ? (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-5 text-amber-100">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 h-5 w-5" />
                  <div>
                    <div className="font-semibold">Forbidden</div>
                    <div className="mt-1 text-sm text-amber-50/90">Your current role is `{currentRole || 'UNKNOWN'}`. In this repo’s RBAC model, only `ADMIN` and `ANALYST` can create {config.subtitle.toLowerCase()} records.</div>
                    <Link href="/forbidden" className="mt-3 inline-flex text-sm font-medium text-amber-100 underline underline-offset-4">
                      Open forbidden page
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-5">
                {formError ? <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{formError}</div> : null}

                {kind === 'incident' ? (
                  <>
                    <Field label="Title" required><input value={incidentTitle} onChange={(e) => setIncidentTitle(e.target.value)} className={inputClass} placeholder="Database writes failing for checkout service" /></Field>
                    <Field label="Description" required helper="Include symptoms, business impact, and what users are seeing."><textarea value={incidentDescription} onChange={(e) => setIncidentDescription(e.target.value)} className={textareaClass} placeholder="Order submissions started failing after the last deployment…" /></Field>
                    <div className="grid gap-4 md:grid-cols-3">
                      <Field label="Impact" required><select value={incidentImpact} onChange={(e) => setIncidentImpact(e.target.value)} className={inputClass}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></Field>
                      <Field label="Urgency" required><select value={incidentUrgency} onChange={(e) => setIncidentUrgency(e.target.value)} className={inputClass}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></Field>
                      <Field label="Priority"><div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100">{incidentPriority}</div></Field>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Category" required><select value={incidentCategory} onChange={(e) => setIncidentCategory(e.target.value)} className={inputClass}><option value="GENERAL">General</option><option value="APPLICATION">Application</option><option value="DATABASE">Database</option><option value="ACCESS">Access</option><option value="NETWORK">Network</option></select></Field>
                      <Field label="Requester" required><input value={incidentRequester} onChange={(e) => setIncidentRequester(e.target.value)} className={inputClass} placeholder="requester@company.com" /></Field>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Affected service / catalog item"><select value={incidentService} onChange={(e) => setIncidentService(e.target.value)} className={inputClass}>{services.map((service) => <option key={service.service_key} value={service.service_key}>{service.name}</option>)}</select></Field>
                      <Field label="Affected CI"><input value={incidentCi} onChange={(e) => setIncidentCi(e.target.value)} className={inputClass} placeholder="ci-db-01" /></Field>
                    </div>
                    <Field label="Attachment name" helper="The repo does not have file-upload transport yet, so this stores the attachment reference name only."><input value={incidentAttachment} onChange={(e) => setIncidentAttachment(e.target.value)} className={inputClass} placeholder="error-screenshot.png" /></Field>
                  </>
                ) : null}

                {kind === 'service-request' ? (
                  <>
                    <Field label="Service / catalog item" required><select value={requestService} onChange={(e) => setRequestService(e.target.value)} className={inputClass}>{services.map((service) => <option key={service.service_key} value={service.service_key}>{service.name}</option>)}</select></Field>
                    <Field label="Short description" required helper="Be specific about what is needed."><input value={requestShortDescription} onChange={(e) => setRequestShortDescription(e.target.value)} className={inputClass} placeholder="Need Okta group access for the payments support team" /></Field>
                    <Field label="Justification" required><textarea value={requestJustification} onChange={(e) => setRequestJustification(e.target.value)} className={textareaClass} placeholder="Support engineers need access to triage payment failures during business hours…" /></Field>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Requester" required><input value={requestRequester} onChange={(e) => setRequestRequester(e.target.value)} className={inputClass} placeholder="requester@company.com" /></Field>
                      <Field label="Approval target"><input value={requestApprovalTarget} onChange={(e) => setRequestApprovalTarget(e.target.value)} className={inputClass} placeholder="team-lead@company.com" /></Field>
                    </div>
                  </>
                ) : null}

                {kind === 'change' ? (
                  <>
                    <Field label="Title" required><input value={changeTitle} onChange={(e) => setChangeTitle(e.target.value)} className={inputClass} placeholder="Rotate production database connection secrets" /></Field>
                    <Field label="Description" required><textarea value={changeDescription} onChange={(e) => setChangeDescription(e.target.value)} className={textareaClass} placeholder="Describe the planned change, scope, and user impact." /></Field>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Reason" required><input value={changeReason} onChange={(e) => setChangeReason(e.target.value)} className={inputClass} placeholder="Quarterly secret rotation" /></Field>
                      <Field label="Risk" required><select value={changeRisk} onChange={(e) => setChangeRisk(e.target.value)} className={inputClass}><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option><option value="P4">P4</option></select></Field>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Affected service"><select value={changeService} onChange={(e) => setChangeService(e.target.value)} className={inputClass}>{services.map((service) => <option key={service.service_key} value={service.service_key}>{service.name}</option>)}</select></Field>
                      <Field label="Affected CI"><input value={changeCi} onChange={(e) => setChangeCi(e.target.value)} className={inputClass} placeholder="ci-app-02" /></Field>
                    </div>
                    <Field label="Implementation plan" required><textarea value={changeImplementationPlan} onChange={(e) => setChangeImplementationPlan(e.target.value)} className={textareaClass} placeholder="1. Drain traffic. 2. Rotate secret. 3. Validate health checks." /></Field>
                    <Field label="Rollback plan" required><textarea value={changeRollbackPlan} onChange={(e) => setChangeRollbackPlan(e.target.value)} className={textareaClass} placeholder="Restore prior secret version and redeploy service." /></Field>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Scheduled start" required><input type="datetime-local" value={changeWindowStart} onChange={(e) => setChangeWindowStart(e.target.value)} className={inputClass} /></Field>
                      <Field label="Scheduled end" required><input type="datetime-local" value={changeWindowEnd} onChange={(e) => setChangeWindowEnd(e.target.value)} className={inputClass} /></Field>
                    </div>
                    <Field label="Requester"><input value={changeRequester} onChange={(e) => setChangeRequester(e.target.value)} className={inputClass} placeholder="requester@company.com" /></Field>
                  </>
                ) : null}

                {kind === 'problem' ? (
                  <>
                    <Field label="Title" required><input value={problemTitle} onChange={(e) => setProblemTitle(e.target.value)} className={inputClass} placeholder="Repeated checkout latency spike during morning peak" /></Field>
                    <Field label="Description" required><textarea value={problemDescription} onChange={(e) => setProblemDescription(e.target.value)} className={textareaClass} placeholder="Describe the recurring pattern and what has already been observed." /></Field>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Linked incident"><select value={problemLinkedIncident} onChange={(e) => setProblemLinkedIncident(e.target.value)} className={inputClass}><option value="">Select incident</option>{incidents.map((incident) => <option key={incident.id} value={incident.id}>#{incident.id} {incident.title}</option>)}</select></Field>
                      <Field label="Affected service"><select value={problemService} onChange={(e) => setProblemService(e.target.value)} className={inputClass}>{services.map((service) => <option key={service.service_key} value={service.service_key}>{service.name}</option>)}</select></Field>
                    </div>
                    <Field label="Impact summary"><textarea value={problemImpactSummary} onChange={(e) => setProblemImpactSummary(e.target.value)} className={textareaClass} placeholder="Intermittent checkout failures affect roughly 18% of users during peak periods." /></Field>
                    <Field label="Suspected root cause"><textarea value={problemRootCause} onChange={(e) => setProblemRootCause(e.target.value)} className={textareaClass} placeholder="Suspected lock contention between order and inventory updates." /></Field>
                  </>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <div className="text-xs text-slate-400">Backend validation and audit logging are enforced on submit. Request IDs are preserved on errors.</div>
                  <div className="flex items-center gap-2">
                    <Link href={config.routeBack} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5">Cancel</Link>
                    <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60">
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Create
                    </button>
                  </div>
                </div>
              </form>
            )}
          </section>

          <aside className="space-y-4">
            <InfoCard icon={<TriangleAlert className="h-4 w-4" />} title="Work item guide" lines={['Issue or breakage -> Incident', 'Need access/software/service -> Service Request', 'Planned modification -> Change', 'Root-cause investigation -> Problem']} />
            <InfoCard icon={<ClipboardList className="h-4 w-4" />} title="Real routes" lines={[`${CONFIG.incident.title} -> ${CONFIG.incident.submitPath}`, `${CONFIG['service-request'].title} -> ${CONFIG['service-request'].submitPath}`, `${CONFIG.change.title} -> ${CONFIG.change.submitPath}`, `${CONFIG.problem.title} -> ${CONFIG.problem.submitPath}`]} />
            <InfoCard icon={kind === 'incident' ? <TriangleAlert className="h-4 w-4" /> : kind === 'service-request' ? <BriefcaseBusiness className="h-4 w-4" /> : kind === 'change' ? <Wrench className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />} title={config.subtitle} lines={[config.helper]} />
          </aside>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, helper, children }: { label: string; required?: boolean; helper?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-100">
        <span>{label}</span>
        {required ? <span className="text-amber-300">*</span> : null}
      </div>
      {children}
      {helper ? <div className="mt-2 text-xs text-slate-400">{helper}</div> : null}
    </label>
  );
}

function InfoCard({ icon, title, lines }: { icon: React.ReactNode; title: string; lines: string[] }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-5 shadow-[0_12px_50px_-20px_rgba(0,0,0,.7)] backdrop-blur">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
        {icon}
        {title}
      </div>
      <div className="mt-3 space-y-2 text-sm text-slate-300">
        {lines.map((line) => (
          <div key={line} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">{line}</div>
        ))}
      </div>
    </div>
  );
}
