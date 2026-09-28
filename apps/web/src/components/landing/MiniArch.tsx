'use client';

import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@iris/ui';
import { MODULES, ZONES } from '@/data/architecture';

/** Interactive architecture strip for the landing page. */
export function MiniArch() {
  const [zone, setZone] = useState<(typeof ZONES)[number]['id']>('ai1');
  const mods = MODULES.filter((m) => m.zone === zone);
  return (
    <div>
      <ol className="grid gap-2 md:grid-cols-5" aria-label="Architecture stages">
        {ZONES.map((z, i) => (
          <li key={z.id} className="relative">
            <button onClick={() => setZone(z.id)} aria-pressed={zone === z.id} className={cn('w-full rounded-xl border p-3 text-left transition-colors', zone === z.id ? 'border-navy-700 bg-navy-800 text-white' : 'border-navy-100 bg-white text-navy-900 hover:border-navy-300')}>
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Stage {i + 1}</span>
              <span className="block text-sm font-semibold">{z.title}</span>
              <span className="block text-xs opacity-70">{z.sub}</span>
            </button>
            {i < ZONES.length - 1 && <ArrowRight className="absolute -right-2.5 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 rounded-full bg-white text-navy-500 md:block" aria-hidden />}
          </li>
        ))}
      </ol>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
        {mods.map((m) => (
          <div key={m.id} className="rounded-lg border border-navy-100 bg-white p-3">
            <p className="text-sm font-semibold text-navy-900">{m.name}</p>
            <p className="mt-0.5 text-xs text-slate-600">{m.purpose}</p>
            <p className="mt-1 text-[11px] text-slate-500">{m.tech}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
