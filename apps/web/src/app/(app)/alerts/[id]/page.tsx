'use client';

import { AlertTriangle, ArrowLeft, CheckCheck, Copy, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, cn } from '@iris/ui';
import { HAZARD_META, RISK_META } from '@iris/config';
import type { IncidentState } from '@iris/types';
import { ConfidenceBadge, RiskBadge, SensorHealthBadge, StateBadge } from '@/components/common/badges';
import { DisseminationFlow } from '@/components/common/DisseminationFlow';
import { FusionPanel } from '@/components/common/FusionPanel';
import { ErrorState, PageSkeleton } from '@/components/common/states';
import { Dl, PageHeader } from '@/components/common/widgets';
import { TrendChart } from '@/components/charts/TrendChart';
import { PRIMARY_SENSOR } from '@/lib/engine/fusion';
import { useCan, useSession } from '@/lib/session';
import { useIris } from '@/lib/store';
import { fmtClock, fmtDateTime, timeAgo } from '@/lib/utils';

const FLOW: IncidentState[] = ['WATCH', 'HIGH', 'CRITICAL', 'ACKNOWLEDGED', 'RESOLVED'];

export default function AlertDetailPage() {
  const { id } = useParams<{ id: string }>();
  const d = useIris((s) => s.data);
  const ack = useIris((s) => s.acknowledge);
  const canAck = useCan('ack_alerts');
  const user = useSession((s) => s.user);
  if (!d) return <PageSkeleton />;
  const inc = d.incidents.find((i) => i.id === id);
  if (!inc) return <ErrorState title={`Incident ${id} not found`} detail="It may have been created in a previous demo session." />;

  const primary = d.nodes.find((n) => n.id === inc.primary_node_id);
  const hist = primary ? d.history[primary.id] ?? {} : {};
  const primType = primary ? PRIMARY_SENSOR[primary.hazard] : undefined;
  const sens = (t: string) => primary?.sensors.find((s) => s.type === t);
  const neighbors = d.nodes.filter((n) => inc.node_ids.includes(n.id) && n.id !== inc.primary_node_id);
  const cam = primary ? d.camera[primary.id] : undefined;
  const flowIdx = inc.status === 'RESOLVED' ? 4 : inc.status === 'ACKNOWLEDGED' ? 3 : FLOW.indexOf(inc.severity as IncidentState);
  const evidenceRows = inc.fusion.evidence;

  return (
    <>
      <Link href="/alerts" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-navy-700 hover:underline"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All alerts</Link>
      <PageHeader
        title={inc.id}
        subtitle={`${HAZARD_META[inc.hazard].label} · ${inc.location}`}
        actions={
          inc.status === 'ACTIVE' ? (
            <Button variant="primary" disabled={!canAck} title={canAck ? undefined : 'Requires Authority, Operator or Administrator'} onClick={() => ack(inc.id, user?.name ?? 'operator')}>
              <CheckCheck className="h-4 w-4" aria-hidden /> Acknowledge
            </Button>
          ) : undefined
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Severity</p><div className="mt-2"><RiskBadge level={inc.severity} /></div><p className="mt-2 text-xs text-slate-500">How serious the hazard is (from fused evidence E = {inc.fusion.E.toFixed(2)}).</p></Card>
        <Card className="p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Confidence</p><div className="mt-2"><ConfidenceBadge level={inc.confidence_level} value={inc.confidence} /></div><p className="mt-2 text-xs text-slate-500">How well independent evidence supports it. Demo-configured, not a calibrated probability.</p></Card>
        <Card className="p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Current state</p><div className="mt-2"><StateBadge state={inc.state} /></div><p className="mt-2 text-xs text-slate-500">Detected {fmtDateTime(inc.created_at)} ({timeAgo(inc.created_at, d.now)}).</p></Card>
        <Card className="p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Deduplication</p><p className="tabular mt-1.5 text-2xl font-semibold text-slate-900">{inc.detections}<span className="ml-1 text-sm font-normal text-slate-500">detections</span></p><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Copy className="h-3 w-3" aria-hidden />{inc.duplicates_suppressed} merged into this one incident.</p></Card>
      </section>

      <Card className="mt-4">
        <CardHeader><CardTitle>Alert state machine</CardTitle></CardHeader>
        <CardContent>
          <ol className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Alert lifecycle">
            <li className="rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 ring-1 ring-emerald-200">NORMAL</li>
            {FLOW.map((s, i) => {
              const reached = i <= flowIdx || (i < 3 && RISK_META[inc.peak_severity].rank >= i + 1);
              const current = i === flowIdx;
              return (
                <li key={s} className="flex items-center gap-1.5">
                  <span aria-hidden className="text-slate-300">→</span>
                  <span className={cn('rounded-md px-2 py-1 font-semibold ring-1', current ? 'bg-navy-700 text-white ring-navy-700' : reached ? 'bg-navy-50 text-navy-700 ring-navy-100' : 'bg-white text-slate-400 ring-slate-200')}>{s}{current && <span className="sr-only"> (current)</span>}</span>
                </li>
              );
            })}
          </ol>
          <ul className="mt-3 space-y-1 text-xs text-slate-600">
            {inc.history.map((h, i) => <li key={i}><span className="tabular font-mono text-slate-400">{fmtClock(h.at)}</span> <span className="font-semibold text-slate-700">{h.state}</span> — {h.note}</li>)}
          </ul>
        </CardContent>
      </Card>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Evidence</CardTitle><Badge tone="ai">Reliability-weighted</Badge></CardHeader>
          <CardContent>
            <Dl cols={1} items={[
              ...(inc.hazard === 'FLOOD' ? [['Water level', sens('water_level') ? `${sens('water_level')!.last_value.toFixed(0)} cm (${primary?.id})` : '—'] as [string, string], ['Rainfall', sens('rainfall') ? `${sens('rainfall')!.last_value.toFixed(1)} mm/h` : '—'] as [string, string]] : []),
              ...(inc.hazard === 'FIRE' ? [['Smoke index', sens('smoke') ? sens('smoke')!.last_value.toFixed(0) : '—'] as [string, string], ['Temperature', sens('temperature') ? `${sens('temperature')!.last_value.toFixed(1)} °C` : '—'] as [string, string]] : []),
              ...(inc.hazard === 'AIR' ? [['PM2.5', sens('pm25') ? `${sens('pm25')!.last_value.toFixed(0)} µg/m³` : '—'] as [string, string], ['PM10', sens('pm10') ? `${sens('pm10')!.last_value.toFixed(0)} µg/m³` : '—'] as [string, string]] : []),
              ['Neighbor-node corroboration', neighbors.length ? neighbors.map((n) => `${n.id} (${n.risk_level})`).join(', ') : 'none yet'],
              ['Sensor reliability', primary ? `${(primary.anomaly.sensor_reliability * 100).toFixed(0)}%` : '—'],
              ['Trend', primary ? `${primary.anomaly.trend} (${primary.anomaly.trend_rate >= 0 ? '+' : ''}${primary.anomaly.trend_rate.toFixed(1)} / sample)` : '—'],
              ['Camera evidence', cam ? `${cam.state} · ${cam.label} · ${(cam.confidence * 100).toFixed(0)}%` : 'no camera on this node'],
              ['External weather context', evidenceRows.find((e) => e.key === 'weather')?.detail ?? '—'],
            ]} />
            <div className="mt-3 flex flex-wrap gap-2">
              {primary && Object.entries(primary.sensors.reduce<Record<string, string>>((acc, s) => ({ ...acc, [s.label]: s.health }), {})).map(([k, v]) => (
                <span key={k} className="inline-flex items-center gap-1 text-xs text-slate-600">{k}: <SensorHealthBadge health={v as never} /></span>
              ))}
            </div>
            {primary && primType && (
              <div className="mt-4">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600"><TrendingUp className="h-3.5 w-3.5" aria-hidden />{primary.id} · {sens(primType)?.label} (simulated)</p>
                <TrendChart data={hist[primType] ?? []} unit={sens(primType)?.unit} name={sens(primType)?.label} color={HAZARD_META[inc.hazard].hex} height={150} decimals={0} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Contribution &amp; quorum</CardTitle></CardHeader>
          <CardContent><FusionPanel fusion={inc.fusion} /></CardContent>
        </Card>
      </section>

      <Card className="mt-4 border-2 border-navy-100">
        <CardHeader><CardTitle>Risk assessment</CardTitle><Badge tone="info">Decision support</Badge></CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Severity</p><div className="mt-1"><RiskBadge level={inc.severity} /></div></div>
            <div><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Confidence</p><div className="mt-1"><ConfidenceBadge level={inc.confidence_level} /></div></div>
            <div className="md:col-span-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recommended action</p>
              <p className="mt-1 flex items-start gap-2 text-base font-medium text-slate-900"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" aria-hidden />&ldquo;{inc.recommended_action}&rdquo;</p>
              <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">Decision support — not autonomous emergency command. A human authority decides and issues any public warning.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>Dissemination &amp; local response</CardTitle></CardHeader>
        <CardContent><DisseminationFlow status={inc.dissemination} idle={inc.status === 'RESOLVED' && false} /></CardContent>
      </Card>
    </>
  );
}
