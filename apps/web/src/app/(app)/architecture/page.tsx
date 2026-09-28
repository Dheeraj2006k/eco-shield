'use client';

import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { Badge, Card, CardContent, CardHeader, CardTitle, cn } from '@iris/ui';
import { PageHeader } from '@/components/common/widgets';
import { EXTERNAL, LIFECYCLE_MODULES, MODULES, ZONES, type ArchModule, type ModuleStatus } from '@/data/architecture';

const STATUS_TONE: Record<ModuleStatus, 'ok' | 'maint' | 'warn' | 'off'> = { 'DEMO-LIVE': 'ok', SIMULATED: 'maint', STAGED: 'warn', PLANNED: 'off' };
const FLOW = ['FIELD', 'AI-0', 'LoRaWAN', 'AI-1', 'EVIDENCE FUSION', 'QUORUM VALIDATION', 'RISK + CONFIDENCE', 'AI-2', 'ALERT ENGINE', 'ACTION / DISSEMINATION'];

function ModuleButton({ m, active, onClick }: { m: ArchModule; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={active} className={cn('w-full rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-colors', active ? 'border-navy-600 bg-navy-700 text-white' : 'border-slate-200 bg-white text-slate-800 hover:border-navy-300 hover:bg-navy-50')}>
      {m.name}
    </button>
  );
}

export default function ArchitecturePage() {
  const [sel, setSel] = useState<ArchModule>(MODULES.find((m) => m.id === 'fusion')!);
  const all = [...MODULES, ...EXTERNAL, ...LIFECYCLE_MODULES];
  const pick = (m: ArchModule) => setSel(all.find((x) => x.id === m.id) ?? m);

  return (
    <>
      <PageHeader title="System architecture" subtitle="Five primary stages, external intelligence across the top and lifecycle operations underneath. Click any module for its purpose, inputs, outputs, technology, deployment layer and status." demo={false} />

      <Card className="mb-4 p-3">
        <ol className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-navy-800" aria-label="Main flow">
          {FLOW.map((f, i) => (
            <li key={f} className="flex items-center gap-1.5"><span className="rounded-md bg-navy-50 px-2 py-1 ring-1 ring-navy-100">{f}</span>{i < FLOW.length - 1 && <ArrowRight className="h-3 w-3 text-slate-400" aria-hidden />}</li>
          ))}
        </ol>
      </Card>

      <div className="mb-3 rounded-xl border border-dashed border-sky-300 bg-sky-50/50 p-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-sky-700">External intelligence <span className="font-normal normal-case tracking-normal text-sky-600">— optional contextual evidence</span></p>
        <div className="grid gap-2 sm:grid-cols-3">{EXTERNAL.map((m) => <ModuleButton key={m.id} m={m} active={sel.id === m.id} onClick={() => pick(m)} />)}</div>
      </div>

      <div className="grid gap-3 xl:grid-cols-5">
        {ZONES.map((z, i) => (
          <div key={z.id} className="relative rounded-xl border border-slate-200 bg-white p-3 shadow-card">
            <p className="text-[11px] font-bold uppercase tracking-wide text-navy-800">{i + 1}. {z.title}</p>
            <p className="mb-2 text-[11px] text-slate-500">{z.sub}</p>
            <div className="space-y-1.5">{MODULES.filter((m) => m.zone === z.id).map((m) => <ModuleButton key={m.id} m={m} active={sel.id === m.id} onClick={() => pick(m)} />)}</div>
            {i < ZONES.length - 1 && <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 rounded-full bg-white text-navy-500 xl:block" aria-hidden />}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">Node → gateway uses LoRaWAN (star-of-stars topology, not a self-healing mesh). Gateway → cloud uses ordinary backhaul; the edge keeps working if it is lost.</p>

      <div className="mt-3 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 p-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-emerald-700">Lifecycle &amp; community operations</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{LIFECYCLE_MODULES.map((m) => <ModuleButton key={m.id} m={m} active={sel.id === m.id} onClick={() => pick(m)} />)}</div>
      </div>

      <Card className="mt-4 border-2 border-navy-100" aria-live="polite">
        <CardHeader><CardTitle>{sel.name}</CardTitle><Badge tone={STATUS_TONE[sel.status]}>{sel.status}</Badge></CardHeader>
        <CardContent>
          <p className="text-sm text-slate-700">{sel.purpose}</p>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {([['Inputs', sel.inputs], ['Outputs', sel.outputs], ['Technology', sel.tech], ['Deployment layer', sel.layer]] as const).map(([k, v]) => (
              <div key={k}><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k}</dt><dd className="mt-0.5 text-slate-800">{v}</dd></div>
            ))}
          </dl>
          <p className="mt-3 text-[11px] text-slate-400">Status legend: DEMO-LIVE = implemented and running in this demo · SIMULATED = represented with simulated data · STAGED = designed, not deployed · PLANNED = integration point not built.</p>
        </CardContent>
      </Card>
    </>
  );
}
