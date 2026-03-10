'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function FraudPage({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[calc(100vh-140px)] bg-[radial-gradient(1200px_circle_at_18%_-10%,rgba(14,165,233,0.20),transparent_42%),radial-gradient(900px_circle_at_88%_0%,rgba(251,191,36,0.12),transparent_36%),radial-gradient(1000px_circle_at_50%_120%,rgba(16,185,129,0.12),transparent_45%)] px-4 py-5 xl:px-6 2xl:px-8">
      <div className="mx-auto w-full max-w-[1760px] space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold tracking-wide text-slate-400">{eyebrow}</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-100">{title}</h1>
            <p className="mt-1 text-sm text-slate-400">{description}</p>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-[0_12px_50px_-20px_rgba(0,0,0,.7)] backdrop-blur',
        className
      )}
    >
      {children}
    </div>
  );
}

export function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-100">{value}</div>
      <div className="mt-2 text-sm text-slate-400">{hint}</div>
    </Card>
  );
}

export function EmptyState({
  title,
  detail,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  detail: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <Card className="border-dashed">
      <div className="text-sm font-semibold text-slate-100">{title}</div>
      <div className="mt-1 text-sm text-slate-400">{detail}</div>
      {ctaHref && ctaLabel ? (
        <Link
          href={ctaHref}
          className="mt-4 inline-flex rounded-xl bg-sky-500/90 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
        >
          {ctaLabel}
        </Link>
      ) : null}
    </Card>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
}) {
  const tone =
    variant === 'primary'
      ? 'bg-sky-500/90 text-white hover:bg-sky-500'
      : variant === 'secondary'
      ? 'bg-white/10 text-slate-100 hover:bg-white/15'
      : 'bg-transparent text-slate-100 hover:bg-white/10';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60',
        tone,
        className
      )}
    >
      {children}
    </button>
  );
}

export function formatPct(value: number | null) {
  return value === null ? 'Not available' : `${(value * 100).toFixed(1)}%`;
}

export function formatCurrency(value: number | null) {
  return value === null
    ? 'Not available'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}
