'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BookOpen, ClipboardList, LayoutGrid, LifeBuoy, LogOut, Search, Shield, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

type SessionMe = {
  user?: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
    orgName?: string | null;
  };
};

const NAV = [
  { href: '/portal', label: 'Home', icon: LayoutGrid },
  { href: '/portal/knowledge', label: 'Knowledge', icon: Search },
  { href: '/portal/catalog', label: 'Catalog', icon: Sparkles },
  { href: '/portal/report-issue', label: 'Report Issue', icon: LifeBuoy },
  { href: '/portal/my-requests', label: 'My Requests', icon: ClipboardList },
];

function active(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function RequesterPortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<SessionMe | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let mounted = true;
    void fetch('/api/session/me', { cache: 'no-store' })
      .then(async (res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (mounted) setMe(json);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch('/api/session/logout', { method: 'POST', cache: 'no-store' });
    } finally {
      router.push('/login?next=%2Fportal');
      router.refresh();
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(1000px_circle_at_0%_0%,rgba(14,165,233,0.18),transparent_35%),radial-gradient(900px_circle_at_100%_0%,rgba(245,158,11,0.16),transparent_32%),linear-gradient(180deg,#06111f_0%,#0b1727_45%,#f3f6fb_45%,#f3f6fb_100%)]">
      <header className="border-b border-white/10 bg-slate-950/65 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-200/80">Fraud Ops Support</div>
            <div className="mt-1 flex items-center gap-2 text-xl font-semibold text-white">
              <Shield className="h-5 w-5 text-sky-300" />
              Requester Portal
            </div>
            <div className="mt-1 text-sm text-slate-300">Search knowledge, request services, and track only your own support records.</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-right text-sm text-slate-100">
              <div className="font-medium">{me?.user?.name ?? me?.user?.email ?? 'Signed in user'}</div>
              <div className="text-xs text-slate-400">{me?.user?.orgName ?? 'Organization'} · {me?.user?.role ?? 'USER'}</div>
            </div>
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              {loggingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-5 pb-4">
          <nav className="flex flex-wrap gap-2" aria-label="Requester portal">
            {NAV.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                    active(pathname, item.href)
                      ? 'bg-sky-400 text-slate-950'
                      : 'bg-white/5 text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
            <Link href="/dashboard" className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10">
              <BookOpen className="h-4 w-4" />
              Agent Console
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
