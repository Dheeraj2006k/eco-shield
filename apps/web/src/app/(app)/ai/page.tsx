'use client';

import { BrainCircuit, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, cn } from '@iris/ui';
import { FusionPanel, QuorumExplainer } from '@/components/common/FusionPanel';
import { PipelineView } from '@/components/common/PipelineView';
import { PageSkeleton } from '@/components/common/states';
import { PageHeader, TableWrap, tdCls, thCls } from '@/components/common/widgets';
import { AI2_CAPABILITIES, LIFECYCLE, MODEL_CARDS } from '@/data/models';
import registry from '@/data/model-registry.json';
import { useCan } from '@/lib/session';
import { useIris } from '@/lib/store';

const statusTone = { ACTIVE: 'ok', STAGED: 'warn', SHADOW: 'info', RESEARCH: 'ai' } as const;

function Metrics({ m }: { m: Record<string, unknown> }) {
  const entries = Object.entries(m);
  return <>{entries.map(([k, v]) => <span key={k} className="mr-2 inline-block whitespace-nowrap text-xs text-slate-600"><span className="text-slate-400">{k.replace(/_/g, ' ')}:</span> <b className="tabular text-slate-800">{String(v)}</b></span>)}</>;
}

export default function AiPage() {
  const d = useIris((s) => s.data);
  const canApprove = useCan('approve_models');
  const [requested, setRequested] = useState<Set<string>>(new Set());
  if (!d) return <PageSkeleton />;

  const best = Object.values(d.fusion).sort((a, b) => b.E - a.E)[0];
  const tiers = [
    { tier: 'AI-0' as const, title: 'Node Intelligence', where: 'ESP32-S3 on every node', blurb: 'Local filtering, change detection, plausibility and health checks. Works with no connectivity.' },
    { tier: 'AI-1' as const, title: 'Gateway Intelligence', where: 'Raspberry Pi 5 (prototype) · Qualcomm Dragonwing IQ-8275 (high-compute / production target)', blurb: 'Multi-model inference, evidence fusion and quorum validation at the edge.' },
    { tier: 'AI-2' as const, title: 'Cloud / Regional Intelligence', where: 'Cloud data platform', blurb: 'Regional aggregation, analytics, alert engine and model lifecycle.' },
  ];

  return (
    <>
      <PageHeader eyebrow="AI-0 → AI-1 → AI-2" title="Edge AI Intelligence" subtitle="Three intelligence layers: local sensing intelligence on the node, multi-model inference at the gateway, and regional intelligence in the cloud." />

      <section className="grid gap-4 xl:grid-cols-3">
        {tiers.map((t) => (
          <div key={t.tier} className="space-y-3">
            <Card className="border-purple-200 bg-purple-50/40 p-4">
              <div className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-purple-600" aria-hidden /><Badge tone="ai">{t.tier}</Badge></div>
              <h2 className="mt-1 text-base font-semibold text-navy-900">{t.title}</h2>
              <p className="text-xs text-slate-600">{t.where}</p>
              <p className="mt-1 text-xs text-slate-500">{t.blurb}</p>
            </Card>
            {t.tier !== 'AI-2' ? MODEL_CARDS.filter((m) => m.tier === t.tier).map((m) => (
              <Card key={m.id} className="p-4">
                <div className="flex items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-slate-900">{m.name}</h3><p className="text-xs text-slate-500">{m.family}</p></div><Badge tone={statusTone[m.status]}>{m.status}</Badge></div>
                <dl className="mt-2 space-y-1.5 text-xs">
                  {([['Purpose', m.purpose], ['Input', m.input], ['Output', m.output], ['Deployment', m.deployment]] as const).map(([k, v]) => (
                    <div key={k}><dt className="inline font-semibold text-slate-500">{k}: </dt><dd className="inline text-slate-700">{v}</dd></div>
                  ))}
                </dl>
              </Card>
            )) : AI2_CAPABILITIES.map((c) => (
              <Card key={c.name} className="p-4">
                <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold text-slate-900">{c.name}</h3><Badge tone="ok">ACTIVE</Badge></div>
                <p className="mt-1 text-xs text-slate-600">{c.text}</p>
                <p className="mt-1 text-xs text-slate-400">Deployment: cloud data platform (FastAPI + PostgreSQL/TimescaleDB)</p>
              </Card>
            ))}
          </div>
        ))}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold text-navy-900">Reliability-weighted evidence fusion</h2>
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <Card>
            <CardHeader><CardTitle>How it works</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              <div className="rounded-lg bg-navy-50 p-3 text-center font-mono text-sm text-navy-900">E = Σ(wᵢ × eᵢ) / Σwᵢ</div>
              <div className="rounded-lg bg-slate-50 p-3 text-center font-mono text-xs text-slate-700">wᵢ = base reliability × data quality × freshness × relevance</div>
              <ul className="list-inside list-disc space-y-1 text-xs text-slate-600">
                <li><b>Inputs:</b> sensor evidence, model evidence, camera evidence, neighbor evidence, weather, sensor health, data quality.</li>
                <li>Sensor health and data quality act through the weights: a faulty sensor loses influence instead of being trusted blindly.</li>
                <li>Values are demo-configured scores — <b>not</b> calibrated probabilities.</li>
              </ul>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live sensor weights</p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {d.nodes.slice(0, 8).map((n) => n.sensors.slice(0, 1).map((s) => (
                  <li key={s.id} className="flex justify-between"><span className="text-slate-600">{n.id} · {s.label}</span><span className="tabular font-semibold">w={s.weight.toFixed(2)}</span></li>
                )))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Live fusion — highest-evidence node{best ? ` (${best.node_id})` : ''}</CardTitle><Badge tone="ai">live</Badge></CardHeader>
            <CardContent>{best && <FusionPanel fusion={best} />}</CardContent>
          </Card>
        </div>
        <h3 className="mb-2 mt-5 text-base font-semibold text-navy-900">Quorum-gated alerting</h3>
        <QuorumExplainer />
      </section>

      <section className="mt-6">
        <Card>
          <CardHeader><CardTitle>Live event pipeline</CardTitle></CardHeader>
          <CardContent><PipelineView stages={d.pipeline} /></CardContent>
        </Card>
      </section>

      <section className="mt-6">
        <Card>
          <CardHeader><CardTitle>Model lifecycle</CardTitle><Badge tone="info">Human approval required</Badge></CardHeader>
          <CardContent>
            <ol className="flex flex-wrap items-center gap-1.5 text-xs">
              {LIFECYCLE.map((s, i) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span className={cn('rounded-md px-2 py-1 font-semibold ring-1', s === 'APPROVE' ? 'bg-amber-50 text-amber-800 ring-amber-300' : 'bg-navy-50 text-navy-700 ring-navy-100')}>{s}</span>
                  {i < LIFECYCLE.length - 1 && <span aria-hidden className="text-slate-300">→</span>}
                </li>
              ))}
            </ol>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600"><ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden />Safety-critical models are never auto-deployed. Deployment requires an explicit approval by an Administrator.</p>
          </CardContent>
        </Card>
      </section>

      <section className="mt-4">
        <Card>
          <CardHeader>
            <div><CardTitle>Model registry</CardTitle><p className="mt-0.5 text-xs text-slate-500">{registry.data_source}. Generated by <code className="font-mono">{registry.generated_by}</code> on {registry.generated_on}.</p></div>
          </CardHeader>
          <CardContent>
            <TableWrap>
              <table className="w-full min-w-[900px]">
                <thead className="border-b border-slate-200 bg-slate-50"><tr>{['Model', 'Version', 'Trained', 'Metrics (synthetic)', 'Target platform', 'Status', 'Deployment', ''].map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {registry.models.map((m) => {
                    const req = requested.has(m.id);
                    return (
                      <tr key={m.id}>
                        <td className={cn(tdCls, 'font-medium')}>{m.name}</td>
                        <td className={cn(tdCls, 'tabular font-mono text-xs')}>{m.version}</td>
                        <td className={cn(tdCls, 'text-xs')}>{m.trained ?? '—'}</td>
                        <td className={tdCls}><Metrics m={m.metrics as Record<string, unknown>} /></td>
                        <td className={cn(tdCls, 'text-xs')}>{m.target}</td>
                        <td className={tdCls}><Badge tone={m.status === 'VALIDATED' ? 'ok' : m.status === 'STAGED' ? 'warn' : 'ai'}>{m.status}</Badge></td>
                        <td className={cn(tdCls, 'text-xs')}>{req ? 'APPROVAL PENDING (recorded)' : m.deployment}</td>
                        <td className={tdCls}>
                          {m.status === 'VALIDATED' && (
                            <Button size="sm" variant="outline" disabled={!canApprove || req} title={canApprove ? undefined : 'Only Administrators can approve deployment'} onClick={() => setRequested((p) => new Set(p).add(m.id))}>
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />{req ? 'Recorded' : 'Approve'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
            <p className="mt-2 text-[11px] text-slate-500">Approve records an intent in this demo only — no model is actually deployed by this button. High scores reflect a deliberately simple synthetic task and say nothing about real-world accuracy.</p>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
