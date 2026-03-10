'use client';

import Link from 'next/link';
import { ChevronDown, ClipboardList, Plus, ShieldAlert, TriangleAlert, Wrench } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const ITEMS = [
  { href: '/incidents/new', label: 'New Incident', description: 'Issue or breakage', icon: TriangleAlert },
  { href: '/catalog/request', label: 'New Service Request', description: 'Need access, software, or a standard service', icon: ClipboardList },
  { href: '/changes/new', label: 'New Change', description: 'Planned modification', icon: Wrench },
  { href: '/problems/new', label: 'New Problem', description: 'Root-cause investigation', icon: ShieldAlert },
];

export default function CreateWorkItemLauncher() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/40"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Create work item"
        onClick={() => setOpen((value) => !value)}
      >
        <Plus size={16} />
        Create
        <ChevronDown size={14} className={open ? 'rotate-180 transition' : 'transition'} />
      </button>
      {open ? (
        <div role="menu" aria-label="Create work item menu" className="absolute right-0 z-50 mt-2 w-[320px] rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} role="menuitem" className="flex items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/5 focus:bg-white/5" onClick={() => setOpen(false)}>
                <span className="mt-0.5 rounded-xl bg-white/5 p-2 text-sky-200">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-100">{item.label}</span>
                  <span className="mt-1 block text-xs text-slate-400">{item.description}</span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
