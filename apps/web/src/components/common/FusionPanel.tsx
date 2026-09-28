'use client';

import { ShieldAlert, HelpCircle, CircleSlash, ShieldCheck } from 'lucide-react';
import { cn } from '@iris/ui';
import type { EvidenceItem, FusionResult, QuorumStatus } from '@iris/types';
import { QuorumBadge } from './badges';

const SRC_COLOR: Record<EvidenceItem['key'], string> = {
  sensor: 'bg-navy-500',
  model: 'bg-purple-500',
  camera: 'bg-orange-500',
  neighbor: 'bg-emerald-500',
  weather: 'bg-sky-500',
};

/** Reliability-weighted evidence fusion: E = Σ(wᵢ × eᵢ) / Σwᵢ */
export function FusionPanel({ fusion, showQuorum = true }: { fusion: FusionResult; showQuorum?: boolean }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-[12px] text-slate-700">
        E = Σ(wᵢ × eᵢ) / Σwᵢ = <span className="font-bold text-navy-800">{fusion.E.toFixed(2)}</span>
        <span className="ml-2 text-slate-400">· demo score, not a calibrated probability</span>
      </div>

      <ul className="space-y-3" aria-label="Evidence sources">
        {fusion.evidence.map((e) => (
          <li key={e.key} className={cn(!e.available && 'opacity-50')}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-slate-800">{e.label}</span>
              <span className="tabular text-xs text-slate-500">
                e = <b className="text-slate-800">{e.value.toFixed(2)}</b> · w = <b className="text-slate-800">{e.weight.toFixed(2)}</b> · contributes{' '}
                <b className="text-slate-800">{(e.contribution * 100).toFixed(0)}%</b>
              </span>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-1.5" aria-hidden>
              <div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={cn('h-full rounded-full', SRC_COLOR[e.key])} style={{ width: `${e.value * 100}%` }} /></div>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">evidence eᵢ</p>
              </div>
              <div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-500" style={{ width: `${Math.min(1, e.weight) * 100}%` }} /></div>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">reliability weight wᵢ</p>
              </div>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {e.detail}
              {e.abnormal && <span className="ml-1 font-semibold text-orange-600">· abnormal</span>}
              {!e.available && <span className="ml-1 font-semibold">· unavailable</span>}
            </p>
          </li>
        ))}
      </ul>

      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label="Contribution of each source to fused evidence">
        {fusion.evidence.map((e) => (
          <div key={e.key} className={SRC_COLOR[e.key]} style={{ width: `${(fusion.E > 0 ? e.contribution / fusion.E : 0) * 100}%` }} title={`${e.label}: ${(e.contribution * 100).toFixed(0)}%`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
        {fusion.evidence.map((e) => (
          <span key={e.key} className="inline-flex items-center gap-1.5"><span className={cn('h-2 w-2 rounded-sm', SRC_COLOR[e.key])} />{e.label.split(' ')[0]}</span>
        ))}
      </div>

      {showQuorum && (
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quorum status</span>
            <QuorumBadge status={fusion.quorum} />
          </div>
          <p className="mt-1 text-xs text-slate-600">{quorumExplain(fusion.quorum, fusion.quorum_sources)}</p>
        </div>
      )}
    </div>
  );
}

function quorumExplain(q: QuorumStatus, sources: string[]) {
  switch (q) {
    case 'CONFIRMED':
      return `Multi-source corroboration: ${sources.join(' + ')}. Incident may be created.`;
    case 'SUSPICIOUS':
      return `Single-source abnormality (${sources.join(', ') || 'one source'}). Held as SUSPICIOUS until a second independent source agrees.`;
    case 'SUPPRESSED':
      return 'A degraded sensor is asserting an abnormal reading that other evidence does not support. Weight reduced; alert suppressed and maintenance flagged.';
    default:
      return 'No abnormal quorum-eligible source.';
  }
}

export function QuorumExplainer() {
  const rows = [
    { icon: <HelpCircle className="h-4 w-4 text-amber-600" aria-hidden />, title: 'Single-source abnormality', state: 'SUSPICIOUS' as const, text: 'One sensor looks abnormal; nobody else agrees yet. Watch, but do not alert.' },
    { icon: <ShieldAlert className="h-4 w-4 text-red-600" aria-hidden />, title: 'Multi-source corroboration', state: 'CONFIRMED' as const, text: 'Own sensor + neighbor node (or camera) agree → incident created.' },
    { icon: <CircleSlash className="h-4 w-4 text-sky-600" aria-hidden />, title: 'Faulty sensor', state: 'SUPPRESSED' as const, text: 'Low quality/freshness cuts its weight; contradicted reading is suppressed and a maintenance ticket is raised.' },
    { icon: <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden />, title: 'Nominal', state: 'NONE' as const, text: 'Evidence within baseline.' },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {rows.map((r) => (
        <div key={r.title} className="rounded-lg border border-slate-200 p-3">
          <div className="flex items-center gap-2">{r.icon}<span className="text-sm font-semibold text-slate-800">{r.title}</span></div>
          <div className="mt-1.5"><QuorumBadge status={r.state} /></div>
          <p className="mt-1.5 text-xs text-slate-600">{r.text}</p>
        </div>
      ))}
    </div>
  );
}
