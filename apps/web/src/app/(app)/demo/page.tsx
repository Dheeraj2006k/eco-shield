'use client';

import { CheckCircle2, Circle, CloudOff, Flame, Droplets, Wind, Wrench, WifiOff, RefreshCcw, ServerOff, SlidersHorizontal, Loader2 } from 'lucide-react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, cn } from '@iris/ui';
import { RISK_META } from '@iris/config';
import type { ScenarioKind } from '@iris/types';
import { HealthBadge, QuorumBadge, RiskBadge } from '@/components/common/badges';
import { DisseminationFlow } from '@/components/common/DisseminationFlow';
import { PipelineView } from '@/components/common/PipelineView';
import { PageSkeleton, RequireCap } from '@/components/common/states';
import { PageHeader } from '@/components/common/widgets';
import { SCENARIO_META } from '@/lib/engine/scenarios';
import { useIris } from '@/lib/store';
import { fmtClock } from '@/lib/utils';

const BUTTONS: { kind: ScenarioKind; label: string; icon: LucideIcon; tone: 'primary' | 'danger' | 'warning' | 'outline' }[] = [
  { kind: 'NORMAL', label: 'NORMAL SYSTEM', icon: RefreshCcw, tone: 'primary' },
  { kind: 'FLOOD', label: 'SIMULATE FLOOD', icon: Droplets, tone: 'danger' },
  { kind: 'FIRE', label: 'SIMULATE FIRE', icon: Flame, tone: 'warning' },
  { kind: 'POLLUTION', label: 'SIMULATE POLLUTION', icon: Wind, tone: 'warning' },
  { kind: 'SENSOR_FAILURE', label: 'SIMULATE SENSOR FAILURE', icon: SlidersHorizontal, tone: 'outline' },
  { kind: 'NODE_OFFLINE', label: 'SIMULATE NODE OFFLINE', icon: WifiOff, tone: 'outline' },
  { kind: 'BACKHAUL_OUTAGE', label: 'SIMULATE BACKHAUL OUTAGE', icon: CloudOff, tone: 'outline' },
  { kind: 'MAINTENANCE', label: 'TRIGGER MAINTENANCE EVENT', icon: Wrench, tone: 'outline' },
];

function DemoInner() {
  const d = useIris((s) => s.data);
  const run = useIris((s) => s.runScenario);
  const restore = useIris((s) => s.restoreBackhaul);
  if (!d) return <PageSkeleton />;

  const sc = d.scenario;
  const elapsed = sc ? (d.now - sc.started_at) / 1000 : 0;
  const lastDone = sc ? [...sc.steps].reverse().find((s) => s.done) : undefined;
  const total = sc ? Math.max(1, sc.steps[sc.steps.length - 1]?.at ?? 1) : 1;
  const active = d.incidents.filter((i) => i.status !== 'RESOLVED').sort((a, b) => RISK_META[b.severity].rank - RISK_META[a.severity].rank);
  const top = active[0];
  const outage = d.gateways.some((g) => !g.uplink_ok);

  return (
    <>
      <PageHeader
        eyebrow="Presenter console"
        title="Demo Control Center"
        subtitle="Every button drives the same central engine used by the dashboard, map, alerts, nodes and maintenance pages. Everything below is SIMULATED — nothing is live field data."
      />

      <Card>
        <CardHeader><CardTitle>Scenarios</CardTitle>{outage && <Button size="sm" variant="outline" onClick={restore}><ServerOff className="h-3.5 w-3.5" aria-hidden /> Restore backhaul</Button>}</CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {BUTTONS.map((b) => {
              const running = sc?.kind === b.kind && sc.steps.some((s) => !s.done);
              return (
                <Button key={b.kind} variant={b.tone} size="lg" className="h-auto justify-start whitespace-normal py-3 text-left" onClick={() => run(b.kind)} aria-pressed={sc?.kind === b.kind}>
                  {running ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : <b.icon className="h-4 w-4 shrink-0" aria-hidden />}
                  <span>
                    <span className="block text-xs font-bold tracking-wide">{b.label}</span>
                    <span className="mt-0.5 block text-[11px] font-normal leading-snug opacity-80">{SCENARIO_META[b.kind].blurb}</span>
                  </span>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Live event pipeline</CardTitle>{lastDone && <Badge tone="info">Now: {lastDone.stage.replace('_', ' ')}</Badge>}</CardHeader>
            <CardContent><PipelineView stages={d.pipeline} highlight={lastDone?.stage} /></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Node state (live)</CardTitle><Link href="/map" className="text-xs font-medium text-navy-700 underline">Open map</Link></CardHeader>
            <CardContent>
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500"><th className="py-1.5 pr-3">Node</th><th className="pr-3">Health</th><th className="pr-3">Risk</th><th className="pr-3">Quorum</th><th className="pr-3 text-right">E</th><th className="text-right">Anomaly</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {d.nodes.map((n) => (
                      <tr key={n.id}>
                        <td className="py-1.5 pr-3 font-medium"><Link className="text-navy-700 hover:underline" href={`/nodes/${n.id}`}>{n.code}</Link></td>
                        <td className="pr-3"><HealthBadge health={n.health_status} /></td>
                        <td className="pr-3"><RiskBadge level={n.risk_level} /></td>
                        <td className="pr-3"><QuorumBadge status={n.quorum} /></td>
                        <td className="tabular pr-3 text-right">{n.risk_score.toFixed(2)}</td>
                        <td className="tabular text-right">{n.anomaly.score.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{top ? `Dissemination — ${top.id}` : 'Dissemination'}</CardTitle>{top && <Link href={`/alerts/${top.id}`} className="text-xs font-medium text-navy-700 underline">Open alert</Link>}</CardHeader>
            <CardContent><DisseminationFlow status={top?.dissemination} idle={!top} /></CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Scenario timeline</CardTitle>{sc && <Badge tone="ai">{SCENARIO_META[sc.kind].label}</Badge>}</CardHeader>
            <CardContent>
              {!sc ? (
                <p className="text-sm text-slate-500">No scenario running. Choose one above — the timeline appears here and every page updates.</p>
              ) : (
                <>
                  <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-navy-600 transition-all" style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }} /></div>
                  <ol className="space-y-2.5">
                    {sc.steps.map((s, i) => (
                      <li key={i} className={cn('flex gap-2 text-sm', !s.done && 'opacity-50')}>
                        {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden />}
                        <span><span className="tabular mr-1.5 font-mono text-xs text-slate-400">T+{s.at}s</span>{s.label}</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Active incidents</CardTitle><Badge tone={active.length ? 'high' : 'ok'}>{active.length}</Badge></CardHeader>
            <CardContent>
              {active.length === 0 ? <p className="text-sm text-slate-500">None. Evidence within baseline.</p> : (
                <ul className="space-y-2">
                  {active.map((i) => (
                    <li key={i.id}><Link href={`/alerts/${i.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"><span className="text-sm font-medium">{i.id} · {i.hazard}</span><RiskBadge level={i.severity} /></Link></li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Event log</CardTitle><span className="text-xs text-slate-400">newest first</span></CardHeader>
            <CardContent>
              <ul className="scroll-thin max-h-[420px] space-y-1.5 overflow-y-auto font-mono text-[11px] leading-snug" aria-live="polite">
                {d.log.slice(0, 40).map((l) => (
                  <li key={l.id} className="flex gap-2">
                    <span className="shrink-0 text-slate-400">{fmtClock(l.at)}</span>
                    <span className={cn('shrink-0 font-bold', l.level === 'ALERT' ? 'text-red-600' : l.level === 'WARN' ? 'text-amber-600' : l.level === 'OK' ? 'text-emerald-600' : 'text-slate-500')}>{l.level}</span>
                    <span className="text-slate-700"><b>{l.source}</b> {l.message}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}

export default function DemoPage() {
  return (
    <RequireCap cap="simulate" fallbackLabel="The Demo Control Center is available to Operator and Administrator roles.">
      <DemoInner />
    </RequireCap>
  );
}
