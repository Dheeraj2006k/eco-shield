'use client';

import { ArrowRight } from 'lucide-react';
import { cn } from '@iris/ui';
import type { PipelineStage } from '@iris/types';

const STATUS_STYLE: Record<PipelineStage['status'], { dot: string; text: string; label: string }> = {
  ACTIVE: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Active' },
  IDLE: { dot: 'bg-slate-400', text: 'text-slate-500', label: 'Idle' },
  DEGRADED: { dot: 'bg-amber-500', text: 'text-amber-700', label: 'Degraded' },
  DOWN: { dot: 'bg-red-500', text: 'text-red-700', label: 'Down' },
};

/** Live sensing → dissemination pipeline with per-stage status, latency and event count. */
export function PipelineView({ stages, highlight, compact }: { stages: PipelineStage[]; highlight?: string; compact?: boolean }) {
  return (
    <ol className={cn('grid gap-2', compact ? 'grid-cols-3 sm:grid-cols-5 2xl:grid-cols-9' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5')} aria-label="Live event pipeline">
      {stages.map((s, i) => {
        const st = STATUS_STYLE[s.status];
        const isHi = highlight === s.key;
        return (
          <li
            key={s.key}
            className={cn(
              'relative rounded-lg border bg-white p-2.5 transition-all',
              s.hot ? 'border-orange-300 bg-orange-50/50 shadow-card' : 'border-slate-200',
              isHi && 'ring-2 ring-navy-500',
            )}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-navy-800">{s.label}</span>
              <span className={cn('h-2 w-2 shrink-0 rounded-full', st.dot, s.hot && 'animate-pulse')} aria-hidden />
            </div>
            <p className={cn('mt-1 text-[10px] font-semibold uppercase', st.text)}>
              {st.label}
              {s.hot && <span className="ml-1 text-orange-600">· abnormal traffic</span>}
            </p>
            <dl className="mt-1.5 space-y-1 text-[11px] text-slate-500">
              <div><dt>Latency</dt><dd className="tabular font-semibold text-slate-800">{s.latency_ms >= 1000 ? `${(s.latency_ms / 1000).toFixed(2)} s` : `${s.latency_ms} ms`}</dd></div>
              <div><dt>Events</dt><dd className="tabular font-semibold text-slate-800">{s.events.toLocaleString()}</dd></div>
            </dl>
            {!compact && s.note && <p className="mt-1.5 text-[10px] leading-snug text-slate-500">{s.note}</p>}
            {i < stages.length - 1 && (
              <>
                <ArrowRight className="absolute -right-2.5 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 rounded-full bg-white text-slate-400 2xl:block" aria-hidden />
                
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}
