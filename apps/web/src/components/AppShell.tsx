'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Palette, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ThemeStudio from './ThemeStudio';
import {
  applyThemeSettings,
  DEFAULT_THEME_SETTINGS,
  persistThemeSettings,
  readStoredThemeSettings,
  sanitizeThemeSettings,
  type ThemeSettings,
} from '../lib/theme';
import { PRODUCT_CREDITS, PRODUCT_NAME } from '../lib/fraud/content';
import { useFraudServerWorkspace } from '../hooks/useFraudServerWorkspace';

type NavItem = { label: string; href: string; key: string };

type SessionMe = {
  username?: string;
  role?: string;
  org_name?: string;
  org_key?: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', key: 'dashboard' },
  { label: 'Data Upload', href: '/data-upload', key: 'data-upload' },
  { label: 'Fraud Detection', href: '/fraud-detection', key: 'fraud-detection' },
  { label: 'Cases', href: '/cases', key: 'cases' },
  { label: 'Audit Log', href: '/audit-log', key: 'audit-log' },
  { label: 'Settings', href: '/settings', key: 'settings' },
  { label: 'About', href: '/about', key: 'about' },
];

function active(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function prefersDarkMode() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readHydratedThemeSettings(): ThemeSettings {
  const doc = document.documentElement.dataset;
  return sanitizeThemeSettings({
    preset: doc.soTheme,
    mode: doc.soMode,
    surfaceContrast: doc.soSurfaceContrast,
    sidebarIntensity: doc.soSidebarIntensity,
    radius: doc.soRadius,
    density: doc.soDensity,
    fontScale: doc.soFontScale,
    chartPalette: doc.soChartPalette,
    reducedMotion: doc.soReducedMotion === 'true',
    highContrast: doc.soHighContrast === 'true',
    accent: readStoredThemeSettings().accent,
  });
}

async function loadOptionalSessionMe(): Promise<SessionMe | null> {
  const res = await fetch('/api/session/me?optional=1', { cache: 'no-store', credentials: 'include' });
  const text = await res.text();
  if (!res.ok || !text) return null;
  const json = JSON.parse(text) as SessionMe & { user?: unknown };
  return json?.user ? json : null;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeDataset, latestRun, workspace, ready } = useFraudServerWorkspace();
  const [menuOpen, setMenuOpen] = useState(false);
  const [me, setMe] = useState<SessionMe | null>(null);
  const [themeStudioOpen, setThemeStudioOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [settings, setSettings] = useState<ThemeSettings>(DEFAULT_THEME_SETTINGS);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let mounted = true;
    const initial = sanitizeThemeSettings({ ...readStoredThemeSettings(), ...readHydratedThemeSettings() });
    setSettings(initial);
    applyThemeSettings(document.documentElement, initial, prefersDarkMode());

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onMediaChange = () => {
      const next = readStoredThemeSettings();
      applyThemeSettings(document.documentElement, next, prefersDarkMode());
      setSettings(next);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key) {
        const next = readStoredThemeSettings();
        applyThemeSettings(document.documentElement, next, prefersDarkMode());
        setSettings(next);
      }
    };

    (async () => {
      try {
        const session = await loadOptionalSessionMe();
        if (mounted) setMe(session);
      } catch {}
    })();

    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setThemeStudioOpen(false);
        setMenuOpen(false);
      }
    };

    media.addEventListener('change', onMediaChange);
    window.addEventListener('storage', onStorage);
    window.addEventListener('keydown', onKey);

    return () => {
      mounted = false;
      media.removeEventListener('change', onMediaChange);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  function updateTheme<K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) {
    setSettings((prev) => {
      const next = sanitizeThemeSettings({ ...prev, [key]: value });
      persistThemeSettings(next);
      applyThemeSettings(document.documentElement, next, prefersDarkMode());
      return next;
    });
  }

  function resetTheme() {
    persistThemeSettings(DEFAULT_THEME_SETTINGS);
    applyThemeSettings(document.documentElement, DEFAULT_THEME_SETTINGS, prefersDarkMode());
    setSettings(DEFAULT_THEME_SETTINGS);
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch('/api/session/logout', { method: 'POST', cache: 'no-store' });
    } finally {
      router.push('/login');
      router.refresh();
      setLoggingOut(false);
    }
  }

  const pageTitle = useMemo(() => {
    const current = NAV_ITEMS.find((n) => active(pathname, n.href));
    return current?.label ?? PRODUCT_NAME;
  }, [pathname]);

  const counts = useMemo(
    () => ({
      dashboard: ready ? latestRun?.metrics.totalTransactions ?? activeDataset?.rowCount ?? null : null,
      'data-upload': ready ? workspace?.datasets.length ?? 0 : null,
      'fraud-detection': ready ? latestRun?.metrics.suspiciousTransactions ?? null : null,
      cases: ready ? workspace?.cases.length ?? null : null,
      'audit-log': ready ? workspace?.auditEvents.length ?? null : null,
      settings: null,
      about: null,
    }),
    [activeDataset?.rowCount, latestRun?.metrics.suspiciousTransactions, latestRun?.metrics.totalTransactions, ready, workspace?.auditEvents.length, workspace?.cases.length, workspace?.datasets.length]
  );

  return (
    <div className="so-app">
      <header className="so-header">
        <div className="so-brand-row">
          <button className="so-icon-btn so-mobile-only" onClick={() => setMenuOpen(true)} aria-label="Open navigation">
            <Menu size={16} />
          </button>
          <div>
            <div className="so-brand-title">{PRODUCT_NAME}</div>
            <div className="so-brand-sub">Fraud Analytics + Case Investigation + Report Generation</div>
          </div>
        </div>

        <div className="so-header-actions">
          <label className="so-search">
            <Search size={14} className="so-search-icon" />
            <input
              ref={searchRef}
              placeholder="Search transactions, cases, merchants, devices (Ctrl/Cmd+K)"
              aria-label="Global search"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  const value = event.currentTarget.value.trim();
                  if (!value) return;
                  router.push(`/fraud-detection?q=${encodeURIComponent(value)}`);
                }
              }}
            />
          </label>

          <div className="so-theme-wrap">
            <button
              className={`so-icon-btn ${themeStudioOpen ? 'is-active' : ''}`}
              aria-label="Open Theme Studio"
              aria-expanded={themeStudioOpen}
              onClick={() => setThemeStudioOpen((v) => !v)}
            >
              <Palette size={16} />
            </button>
            <ThemeStudio
              open={themeStudioOpen}
              settings={settings}
              onClose={() => setThemeStudioOpen(false)}
              onChange={updateTheme}
              onReset={resetTheme}
            />
          </div>

          <Link className="so-icon-btn" aria-label="Open settings" href="/settings">
            <RefreshCw size={16} />
          </Link>
          <div className="so-user-chip">
            <span className="so-user-name">{me?.username ?? 'INVESTIGATOR'}</span>
            <span className="so-role-badge">{me?.role ?? 'ANALYST'}</span>
          </div>
          <button className="so-icon-btn" aria-label="Sign out" onClick={logout} disabled={loggingOut}>
            {loggingOut ? <RefreshCw size={16} className="so-spin" /> : <X size={16} />}
          </button>
        </div>
      </header>

      <nav className="so-tabs" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const selected = active(pathname, item.href);
          const badge = counts[item.key];
          return (
            <Link key={item.href} href={item.href} className={selected ? 'is-active' : ''}>
              <span>{item.label}</span>
              {typeof badge === 'number' ? <span className="so-tab-badge">{badge}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className="so-layout">
        <aside className="so-sidebar">
          <div className="so-org-switch">
            <div className="so-org-label">Workspace</div>
            <div className="so-org-btn" aria-label="Current workspace">
              <ShieldCheck size={14} />
              <span>{me?.org_name ?? workspace?.orgName ?? 'Current workspace'}</span>
            </div>
          </div>

          <div className="so-side-group-title">Fraud Workflow</div>
          <div className="so-side-links">
            {NAV_ITEMS.map((item) => {
              const selected = active(pathname, item.href);
              return (
                <Link key={item.href} href={item.href} className={`so-side-link ${selected ? 'is-active' : ''}`}>
                  <span>{item.label}</span>
                  {typeof counts[item.key] === 'number' ? <span className="so-side-count">{counts[item.key]}</span> : null}
                </Link>
              );
            })}
          </div>

          <div className="so-side-group-title" style={{ marginTop: 12 }}>Active Dataset</div>
          <div className="so-card">
            <div className="text-sm font-semibold">{!ready ? 'Loading workspace...' : activeDataset?.name ?? 'No dataset uploaded'}</div>
            <div className="mt-1 text-xs text-slate-300">
              {!ready ? 'Restoring the active dataset and latest analysis state.' : activeDataset ? `${activeDataset.rowCount} records available for analysis` : 'Upload CSV or Excel data to begin.'}
            </div>
          </div>

          <div className="so-page-title">{pageTitle}</div>
        </aside>

        <main className="so-main">{children}</main>
      </div>

      <div className={`so-mobile-drawer ${menuOpen ? 'is-open' : ''}`}>
        <div className="so-mobile-backdrop" onClick={() => setMenuOpen(false)} />
        <aside className="so-mobile-panel">
          <div className="so-mobile-top">
            <div>
              <div className="so-brand-title">{PRODUCT_NAME}</div>
              <div className="so-brand-sub">{me?.org_name ?? workspace?.orgName ?? 'Current workspace'}</div>
            </div>
            <button className="so-icon-btn" onClick={() => setMenuOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="so-side-links">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`so-side-link ${active(pathname, item.href) ? 'is-active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                <span>{item.label}</span>
                {typeof counts[item.key] === 'number' ? <span className="so-side-count">{counts[item.key]}</span> : null}
              </Link>
            ))}
          </div>
        </aside>
      </div>

      <footer className="px-6 pb-6 pt-2 text-xs text-slate-500">
        <div>{PRODUCT_CREDITS[0]} | {PRODUCT_CREDITS[1]}</div>
      </footer>
    </div>
  );
}
