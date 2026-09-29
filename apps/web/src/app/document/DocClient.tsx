'use client';

import { ArrowUp, ChevronDown, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/** Mobile/desktop dropdown jump-menu for the document's table of contents. */
export function DocNav({ toc }: { toc: { id: string; title: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Jump to section"
        className="ml-1 flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 sm:gap-1.5"
      >
        {open ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
        <span className="hidden sm:inline">Sections</span>
        <ChevronDown className="hidden h-3.5 w-3.5 sm:inline" aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-pop">
          {toc.map((t) => (
            <a key={t.id} href={`#${t.id}`} onClick={() => setOpen(false)} className="block truncate rounded-lg px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100">
              {t.title}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function ScrollTopButton() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!show) return null;
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      className="fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-navy-800 text-white shadow-pop hover:bg-navy-900"
    >
      <ArrowUp className="h-5 w-5" aria-hidden />
    </button>
  );
}
