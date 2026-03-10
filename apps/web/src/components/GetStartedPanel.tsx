'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BookOpenText, Boxes, Database, Link2, RefreshCw, Siren } from 'lucide-react';

type Variant = 'page' | 'banner';

type SessionMe = {
  user?: {
    email?: string | null;
    name?: string | null;
    role?: string | null;
    orgName?: string | null;
    orgId?: string | null;
  };
  username?: string | null;
  role?: string | null;
  org_name?: string | null;
};

type Counts = {
  services: number | null;
  incidents: number | null;
  knowledge: number | null;
  integrations: number | null;
};

const DISMISS_KEY = 'serviceops.getting-started.dismissed';

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

async function readJson(path: string) {
  const res = await fetch(path, { credentials: 'include', cache: 'no-store' });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  return { ok: res.ok, status: res.status, json };
}

async function readCount(path: string): Promise<number | null> {
  try {
    const { ok, json } = await readJson(path);
    if (!ok) return null;
    if (Array.isArray(json)) return json.length;
    if (Array.isArray(json?.items)) return json.items.length;
    if (typeof json?.total === 'number') return json.total;
    return null;
  } catch {
    return null;
  }
}

function CountPill({ value }: { value: number | null }) {
  return (
    <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-slate-200">
      {value === null ? 'Unknown' : value}
    </span>
  );
}

function SummaryRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-sm text-slate-200">{label}</div>
      <CountPill value={value} />
    </div>
  );
}

function ActionCard({
  icon,
  title,
  description,
  href,
  cta,
  enabled,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href?: string;
  cta: string;
  enabled: boolean;
  badge?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-[0_12px_50px_-20px_rgba(0,0,0,.7)]">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-200">{icon}</div>
        {badge ? (
          <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-slate-300">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="mt-4 text-sm font-semibold text-slate-100">{title}</div>
      <div className="mt-2 text-sm text-slate-400">{description}</div>
      {enabled && href ? (
        <Link
          href={href}
          className="mt-4 inline-flex items-center rounded-xl bg-sky-500/90 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
        >
          {cta}
        </Link>
      ) : (
        <div className="mt-4 inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-400">
          {cta}
        </div>
      )}
    </div>
  );
}

export function GetStartedBanner() {
  return <GetStartedPanel variant="banner" />;
}

export default function GetStartedPanel({ variant = 'page' }: { variant?: Variant }) {
  const [me, setMe] = useState<SessionMe | null>(null);
  const [counts, setCounts] = useState<Counts>({ services: null, incidents: null, knowledge: null, integrations: null });
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const [meResult, services, incidents, knowledge, integrations] = await Promise.all([
          readJson('/api/session/me'),
          readCount('/api/bff/cmdb/cis'),
          readCount('/api/bff/itsm/incidents'),
          readCount('/api/bff/knowledge/documents'),
          readCount('/api/bff/integrations/notifications'),
        ]);

        if (!active) return;
        if (meResult.ok) {
          setMe(meResult.json ?? null);
        }
        setCounts({ services, incidents, knowledge, integrations });
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const role = me?.user?.role ?? me?.role ?? 'ANALYST';
  const displayName = me?.user?.name ?? me?.username ?? me?.user?.email ?? 'Your account';
  const orgName = me?.user?.orgName ?? me?.org_name ?? 'your organization';
  const orgKey = me?.user?.orgId ?? orgName;
  const isAdmin = role === 'ADMIN';
  const canOperate = isAdmin || role === 'ANALYST';
  const isReadonly = role === 'READONLY';

  useEffect(() => {
    if (variant !== 'banner') return;
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      setDismissed(Boolean(parsed[orgKey]));
    } catch {
      setDismissed(false);
    }
  }, [orgKey, variant]);

  const isEmptyOrg = useMemo(() => {
    const coreKnown = [counts.services, counts.incidents, counts.knowledge].every((value) => value !== null);
    if (!coreKnown) return false;
    return (counts.services ?? 0) === 0 && (counts.incidents ?? 0) === 0 && (counts.knowledge ?? 0) === 0;
  }, [counts]);

  function dismissBanner() {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    let parsed: Record<string, boolean> = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = {};
      }
    }
    parsed[orgKey] = true;
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify(parsed));
    setDismissed(true);
  }

  if (variant === 'banner') {
    if (loading || dismissed || !isEmptyOrg) return null;
    return (
      <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-slate-100">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">New here? Add your services, incidents, knowledge, or integrations.</div>
            <div className="mt-1 text-sm text-slate-300">
              Your account gives you access to your organization. To see useful dashboard data, load sample data or add your own services, incidents, knowledge, and integrations.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/getting-started"
              className="inline-flex items-center rounded-xl bg-sky-500/90 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
            >
              Open Get Started
            </Link>
            <button
              type="button"
              onClick={dismissBanner}
              className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/10"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-140px)] bg-[radial-gradient(1200px_circle_at_20%_-10%,rgba(56,189,248,0.18),transparent_40%),radial-gradient(900px_circle_at_90%_0%,rgba(168,85,247,0.14),transparent_35%),radial-gradient(800px_circle_at_50%_120%,rgba(34,197,94,0.10),transparent_45%)] px-5 py-5">
      <div className="mx-auto max-w-[1400px] space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold tracking-wide text-slate-400">GET STARTED</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-100">Add your data</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">
              Your account gives you access to your organization. To see useful dashboard data, load sample data or add your own services, incidents, knowledge, and integrations.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/10"
          >
            Back to dashboard
          </Link>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-[0_12px_50px_-20px_rgba(0,0,0,.7)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">{displayName}</div>
              <div className="mt-1 text-sm text-slate-400">
                Signed in to <span className="text-slate-200">{orgName}</span> as <span className="text-slate-200">{role}</span>.
              </div>
            </div>
            {loading ? (
              <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Checking data sources...
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-8">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-6 xl:col-span-4">
                <ActionCard
                  icon={<Database className="h-5 w-5" />}
                  title="Load Sample Data"
                  description="Quickly test the dashboard with representative services, incidents, knowledge documents, and audit activity. Browser-triggered sample loading is not enabled in this repo yet."
                  cta="Not yet enabled"
                  enabled={false}
                  badge="Not enabled"
                />
              </div>
              <div className="col-span-12 md:col-span-6 xl:col-span-4">
                <ActionCard
                  icon={<Boxes className="h-5 w-5" />}
                  title="Add Services to CMDB"
                  description="Define your company services, applications, resources, dependencies, owners, and environments so incidents and impact views point to real systems."
                  href="/cmdb"
                  cta={isAdmin ? 'Open CMDB' : 'Admin setup required'}
                  enabled={isAdmin}
                  badge={isAdmin ? 'Real route' : 'Admin only'}
                />
              </div>
              <div className="col-span-12 md:col-span-6 xl:col-span-4">
                <ActionCard
                  icon={<Siren className="h-5 w-5" />}
                  title="Create First Incident"
                  description="Enter an operational issue manually in the incidents workflow. Incident data can also come from integrations when those are connected."
                  href="/incidents"
                  cta={canOperate ? 'Open incidents' : 'View incidents'}
                  enabled={canOperate}
                  badge={canOperate ? 'Real route' : 'Readonly guidance'}
                />
              </div>
              <div className="col-span-12 md:col-span-6 xl:col-span-6">
                <ActionCard
                  icon={<BookOpenText className="h-5 w-5" />}
                  title="Upload Knowledge Docs"
                  description="Add runbooks, SOPs, troubleshooting guides, KB articles, postmortems, and other operational documents so search and assistant answers use your organization’s evidence."
                  href="/knowledge-base"
                  cta={canOperate ? 'Open knowledge base' : 'View knowledge base'}
                  enabled={canOperate}
                  badge={canOperate ? 'Upload supported' : 'Readonly guidance'}
                />
              </div>
              <div className="col-span-12 md:col-span-6 xl:col-span-6">
                <ActionCard
                  icon={<Link2 className="h-5 w-5" />}
                  title="Connect Integrations"
                  description="Configure monitoring, alerts, notifications, or other supported data feeds. This repo currently exposes notification history and test-send endpoints, not a full destination catalog."
                  href="/integrations"
                  cta={isAdmin ? 'Open integrations' : 'Admin setup required'}
                  enabled={isAdmin}
                  badge={isAdmin ? 'Real route' : 'Admin only'}
                />
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-[0_12px_50px_-20px_rgba(0,0,0,.7)]">
              <div className="text-sm font-semibold text-slate-100">Current data source status</div>
              <div className="mt-1 text-xs text-slate-400">Only real backend-readable values are shown.</div>
              <div className="mt-4 space-y-2">
                <SummaryRow label="Services configured" value={counts.services} />
                <SummaryRow label="Incidents present" value={counts.incidents} />
                <SummaryRow label="Knowledge docs present" value={counts.knowledge} />
                <SummaryRow label="Integration events recorded" value={counts.integrations} />
              </div>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
                Sample data loaded: not determinable from the current backend. Existing records may come from prior seeds, user-created data, or integrations.
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-[0_12px_50px_-20px_rgba(0,0,0,.7)]">
              <div className="text-sm font-semibold text-slate-100">What happens after login?</div>
              <div className="mt-2 text-sm text-slate-400">
                Signing in gives you access to your organization and role. It does not create incidents, services, knowledge, or integrations data by itself.
              </div>
              <div className="mt-3 text-sm text-slate-400">
                To get value quickly, either load sample data when that browser flow becomes available, or start by adding your own systems and documents.
              </div>
              {isReadonly ? (
                <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-200">
                  Your role is readonly. You can explore the product, but an admin needs to add services and integrations.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
