'use client';

import { Activity, AlertOctagon, Battery, CheckCircle2, Gauge, Layers, Network, Radio, Router, Siren, WifiOff, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@iris/ui';
import { HAZARD_META, RISK_META } from '@iris/config';
import type { HazardClass } from '@iris/types';
import { ConfidenceBadge, RiskBadge, SystemBadge } from '@/components/common/badges';
import { PipelineView } from '@/components/common/PipelineView';
import { EmptyState, PageSkeleton } from '@/components/common/states';
import { Kpi, Meter, PageHeader } from '@/components/common/widgets';
import IrisMap, { type MapLayer } from '@/components/map/IrisMap';
import { kpis } from '@/lib/derive';
import { useIris } from '@/lib/store';
import { fmtClock, timeAgo } from '@/lib/utils';

const DEFAULT_LAYERS = new Set<MapLayer>(['health', 'risk']);

export default function DashboardPage() {
  const d = useIris((s) => s.data);
  const [filter] = useState<HazardClass | 'ALL'>('ALL');
  const k = useMemo(() => (d ? kpis(d) : null), [d]);
  if (!d || !k) return <PageSkeleton />;

  const active = d.incidents.filter((i) => i.status !== 'RESOLVED').sort((a, b) => RISK_META[b.severity].rank - RISK_META[a.severity].rank || b.created_at - a.created_at);

  const hazardDist = (['FLOOD', 'FIRE', 'AIR'] as HazardClass[]).map((h) => ({
    name: HAZARD_META[h].short,
    nodes: d.nodes.filter((n) => n.hazard === h).length,
    alerts: d.incidents.filter((i) => i.hazard === h && i.status !== 'RESOLVED').length,
    color: HAZARD_META[h].hex,
  }));
  const health = [
    { name: 'Healthy', value: d.nodes.filter((n) => n.health_status === 'HEALTHY').length, color: '#16a34a' },
    { name: 'Degraded', value: d.nodes.filter((n) => n.health_status === 'DEGRADED').length, color: '#eab308' },
    { name: 'Maintenance', value: d.nodes.filter((n) => n.health_status === 'MAINTENANCE_REQUIRED').length, color: '#0ea5e9' },
    { name: 'Offline', value: d.nodes.filter((n) => n.health_status === 'OFFLINE').length, color: '#94a3b8' },
  ].filter((x) => x.value > 0);
  const timeline = d.log.filter((l) => l.level === 'ALERT' || l.level === 'OK' || l.level === 'WARN').slice(0, 7);

  return (
    <>
      <PageHeader
        eyebrow={`System status: ${d.system.health.replace('_', ' ')}`}
        title="Operations Command Center"
        subtitle="Live view of the sensor → edge → validated risk → warning chain across the demo network. All values are simulated."
        actions={<SystemBadge health={d.system.health} />}
      />
      {d.system.reasons.length > 0 && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">{d.system.reasons.join(' · ')}</p>
      )}

      <section aria-label="Key indicators" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Active nodes" value={k.total} icon={<Radio className="h-4 w-4" aria-hidden />} sub={`${d.gateways.length} gateways`} />
        <Kpi label="Online" value={k.online} tone="ok" icon={<CheckCircle2 className="h-4 w-4" aria-hidden />} sub={`${k.networkAvailability.toFixed(0)}% availability`} />
        <Kpi label="Degraded" value={k.degraded} tone={k.degraded ? 'warn' : 'ok'} icon={<Wrench className="h-4 w-4" aria-hidden />} sub="incl. maintenance required" />
        <Kpi label="Offline" value={k.offline} tone={k.offline ? 'off' : 'ok'} icon={<WifiOff className="h-4 w-4" aria-hidden />} />
        <Kpi label="Active alerts" value={k.activeAlerts} tone={k.activeAlerts ? 'bad' : 'ok'} icon={<Siren className="h-4 w-4" aria-hidden />} />
        <Kpi label="Critical events" value={k.critical} tone={k.critical ? 'crit' : 'ok'} icon={<AlertOctagon className="h-4 w-4" aria-hidden />} />
      </section>

      <section aria-label="Secondary indicators" className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { label: 'Gateway health', value: `${k.gwOk}/${k.gwTotal} uplinks`, icon: Router, pct: (k.gwOk / k.gwTotal) * 100 },
          { label: 'Network availability', value: `${k.networkAvailability.toFixed(0)}%`, icon: Network, pct: k.networkAvailability },
          { label: 'Battery health', value: `${k.avgBattery.toFixed(0)}% avg`, icon: Battery, pct: k.avgBattery },
          { label: 'Sensor health', value: `${k.sensorHealth.toFixed(0)}% healthy`, icon: Activity, pct: k.sensorHealth },
        ].map((x) => (
          <Card key={x.label} className="p-3">
            <div className="flex items-center gap-2 text-slate-500"><x.icon className="h-4 w-4" aria-hidden /><span className="text-[11px] font-semibold uppercase tracking-wide">{x.label}</span></div>
            <p className="tabular mt-1 text-sm font-semibold text-slate-900">{x.value}</p>
            <div className="mt-1.5"><Meter value={x.pct} tone={x.pct > 85 ? 'ok' : x.pct > 60 ? 'warn' : 'crit'} label={x.label} /></div>
          </Card>
        ))}
        <Card className="col-span-2 p-3 md:col-span-1">
          <div className="flex items-center gap-2 text-slate-500"><Gauge className="h-4 w-4" aria-hidden /><span className="text-[11px] font-semibold uppercase tracking-wide">Current regional risk</span></div>
          <div className="mt-1.5"><RiskBadge level={k.regionalRisk} /></div>
        </Card>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <div>
              <CardTitle>Live GIS map</CardTitle>
              <p className="text-xs text-slate-500">Node markers colored by risk (letter = hazard: W water · F fire · A air) · demo sites</p>
            </div>
            <Link href="/map" className="text-xs font-medium text-navy-700 underline">Full-screen map</Link>
          </CardHeader>
          <div className="px-3 pb-3">
            <IrisMap className="h-[380px] sm:h-[460px]" nodes={d.nodes} gateways={d.gateways} incidents={d.incidents} now={d.now} layers={DEFAULT_LAYERS} hazardFilter={filter} onSelect={(id) => (window.location.href = `/nodes/${id}`)} />
          </div>
        </Card>

        <Card className="flex max-h-[560px] flex-col">
          <CardHeader>
            <CardTitle>Active incidents</CardTitle>
            <Badge tone={active.length ? 'high' : 'ok'}>{active.length} active</Badge>
          </CardHeader>
          <CardContent className="scroll-thin flex-1 overflow-y-auto">
            {active.length === 0 ? (
              <EmptyState title="No active incidents" hint="All monitored hazards are within baseline. Open Demo Control to simulate an event." action={<Link href="/demo" className="text-xs font-medium text-navy-700 underline">Open Demo Control</Link>} />
            ) : (
              <ul className="space-y-2">
                {active.map((i) => (
                  <li key={i.id}>
                    <Link href={`/alerts/${i.id}`} className="block rounded-lg border border-slate-200 p-3 hover:border-navy-300 hover:bg-slate-50">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-slate-900">{i.id}</span>
                        <RiskBadge level={i.severity} />
                        <ConfidenceBadge level={i.confidence_level} />
                      </div>
                      <p className="mt-1 text-xs font-medium text-slate-700">{HAZARD_META[i.hazard].label}</p>
                      <p className="text-xs text-slate-500">{i.location}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{i.status === 'ACKNOWLEDGED' ? 'Acknowledged · ' : ''}{timeAgo(i.created_at, d.now)} · {i.node_ids.length} node(s) · {i.duplicates_suppressed} duplicate detections merged</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mt-4">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Live event pipeline</CardTitle>
              <p className="text-xs text-slate-500">Event counts are cumulative for this session (simulated).</p>
            </div>
            <Layers className="h-4 w-4 text-slate-400" aria-hidden />
          </CardHeader>
          <CardContent><PipelineView stages={d.pipeline} compact /></CardContent>
        </Card>
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader><CardTitle>Hazard distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="h-48" role="img" aria-label="Nodes and active alerts by hazard">
              <ResponsiveContainer>
                <BarChart data={hazardDist} margin={{ left: -20, right: 4 }}>
                  <CartesianGrid vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="nodes" name="Nodes" fill="#3563a8" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="alerts" name="Active alerts" fill="#ea580c" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Risk trend (max fused evidence)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-48" role="img" aria-label="Risk trend by hazard">
              <ResponsiveContainer>
                <LineChart data={d.riskTrend} margin={{ left: -20, right: 4 }}>
                  <CartesianGrid vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="t" tickFormatter={(t) => fmtClock(t).slice(3)} tick={{ fontSize: 10 }} minTickGap={40} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip labelFormatter={(t) => fmtClock(t as number)} formatter={(v: number) => v.toFixed(2)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line dataKey="FLOOD" name="Flood" stroke={HAZARD_META.FLOOD.hex} dot={false} strokeWidth={2} isAnimationActive={false} />
                  <Line dataKey="FIRE" name="Fire" stroke={HAZARD_META.FIRE.hex} dot={false} strokeWidth={2} isAnimationActive={false} />
                  <Line dataKey="AIR" name="Air" stroke={HAZARD_META.AIR.hex} dot={false} strokeWidth={2} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Node health</CardTitle></CardHeader>
          <CardContent>
            <div className="h-48" role="img" aria-label="Node health distribution">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={health} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2} isAnimationActive={false}>
                    {health.map((h) => <Cell key={h.name} fill={h.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Alert timeline</CardTitle></CardHeader>
          <CardContent>
            {timeline.length === 0 ? <EmptyState title="No events yet" /> : (
              <ol className="space-y-2">
                {timeline.map((l) => (
                  <li key={l.id} className="flex gap-2 text-xs">
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${l.level === 'ALERT' ? 'bg-red-500' : l.level === 'WARN' ? 'bg-amber-500' : 'bg-emerald-500'}`} aria-hidden />
                    <span>
                      <span className="tabular font-mono text-slate-400">{fmtClock(l.at)}</span> <span className="font-semibold text-slate-700">{l.source}</span>
                      <span className="block text-slate-600">{l.message}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
