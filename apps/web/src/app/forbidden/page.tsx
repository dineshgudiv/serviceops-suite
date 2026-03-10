import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <div className="min-h-[calc(100vh-140px)] bg-[radial-gradient(1200px_circle_at_20%_-10%,rgba(56,189,248,0.18),transparent_40%),radial-gradient(900px_circle_at_90%_0%,rgba(248,113,113,0.12),transparent_35%),radial-gradient(800px_circle_at_50%_120%,rgba(34,197,94,0.08),transparent_45%)] px-5 py-10">
      <div className="mx-auto max-w-[720px] rounded-2xl border border-white/10 bg-slate-950/40 p-8 text-slate-100 shadow-[0_12px_50px_-20px_rgba(0,0,0,.7)] backdrop-blur">
        <div className="text-[13px] font-semibold tracking-wide text-slate-400">SERVICEOPS SUITE</div>
        <h1 className="mt-2 text-3xl font-semibold">Forbidden</h1>
        <p className="mt-3 text-sm text-slate-400">
          Your account is authenticated, but it does not have permission to access this area.
        </p>
        <div className="mt-6 flex gap-3">
          <Link href="/dashboard" className="inline-flex items-center rounded-xl bg-sky-500/90 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500">
            Back to dashboard
          </Link>
          <Link href="/login" className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-white/10">
            Switch account
          </Link>
        </div>
      </div>
    </div>
  );
}
