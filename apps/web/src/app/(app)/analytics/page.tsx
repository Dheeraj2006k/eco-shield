'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from 'recharts';
import { Badge, Card, CardContent, CardHeader, CardTitle, Tabs } from '@iris/ui';
import { HAZARD_META, RISK_META } from '@iris/config';
import type { HazardClass } from '@iris/types';
import { RiskBadge } from '@/components/common/badges';
import { PageSkeleton } from '@/components/common/states';
import { Dl, PageHeader } from '@/components/common/widgets';
import IrisMap, { type MapLayer, type RegionMode } from '@/components/map/IrisMap';
import { regionRisks, riskFromScore } from '@/lib/derive';
import { RANGE_META, nodeUptime, syntheticSeries, type Range } from '@/lib/engine/analytics';
import { INFRASTRUCTURE } from '@/lib/engine/seed';
import { useIris } from '@/lib/store';

const sel = 'h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700';
const tip = { fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' } as const;
const NO_LAYERS = new Set<MapLayer>();
const POP_LAYERS = new Set<MapLayer>(['population', 'infra']);

export default function AnalyticsPage() {
  const d = useIris((s) => s.data);
  const [range, setRange] = useState<Range>('7D');
  const [hazard, setHazard] = useState<HazardClass | 'ALL'>('ALL');
  const [region, setRegion] = useState('ALL');
  const [mode, setMode] = useState<RegionMode>('COMPOSITE');
  const [picked, setPicked] = useState<string | null>(null);
  const series = useMemo(() => syntheticSeries(range, hazard), [range, hazard]);
  const regions = useMemo(() => (d ? regionRisks(d) : []), [d]);
  if (!d) return <PageSkeleton />;

  const nodes = d.nodes.filter((n) => (hazard === 'ALL' || n.hazard === hazard) && (region === 'ALL' || n.location.district === region));
  const live = (h: HazardClass) => d.incidents.filter((i) => i.hazard === h && (RANGE_META[range].days * 86_400_000 >= d.now - i.created_at)).length;
  const histTotals = (['FLOOD', 'FIRE', 'AIR'] as HazardClass[]).map((h) => ({ name: HAZARD_META[h].short, total: series.reduce((a, s) => a + (s as never)[h], 0) + live(h), color: HAZARD_META[h].hex }));
  const uptime = nodes.map((n) => ({ name: n.id, uptime: n.health_status === 'OFFLINE' ? 0 : nodeUptime(n.id, range) }));
  const reliab = ['water_level', 'rainfall', 'pm25', 'pm10', 'smoke', 'temperature', 'humidity'].map((t) => {
    const ss = nodes.flatMap((n) => n.sensors).filter((s) => s.type === t);
    return { name: t.replace('_', ' '), reliability: ss.length ? (ss.reduce((a, s) => a + s.base_reliability * s.quality_score, 0) / ss.length) * 100 : 0 };
  }).filter((x) => x.reliability > 0);
  const battery = nodes.map((n) => ({ name: n.id, battery: Math.round(n.battery) }));
  const selected = regions.find((r) => r.id === picked) ?? null;
  const filteredRegions = region === 'ALL' ? regions : regions.filter((r) => r.name.startsWith(region));

  return (
    <>
      <PageHeader title="Analytics" subtitle="Fleet and hazard analytics. Historical series are SYNTHETIC; live sensor, battery and alert figures come from the running demo engine." />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs<Range> tabs={(['24H', '7D', '30D', '90D'] as Range[]).map((r) => ({ value: r, label: r }))} value={range} onChange={setRange} />
        <select aria-label="Hazard" className={sel} value={hazard} onChange={(e) => setHazard(e.target.value as HazardClass | 'ALL')}>
          <option value="ALL">All hazards</option>{(['FLOOD', 'FIRE', 'AIR'] as HazardClass[]).map((h) => <option key={h} value={h}>{HAZARD_META[h].short}</option>)}
        </select>
        <select aria-label="District" className={sel} value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="ALL">All districts</option>{['Haridwar', 'Dehradun', 'Tehri Garhwal'].map((r) => <option key={r}>{r}</option>)}
        </select>
        <Badge tone="maint">Historical series: synthetic</Badge>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Hazard frequency</CardTitle></CardHeader>
          <CardContent>
            <div className="h-56" role="img" aria-label="Hazard frequency over time">
              <ResponsiveContainer><BarChart data={series} margin={{ left: -22, right: 4 }}>
                <CartesianGrid vertical={false} stroke="#eef2f7" /><XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={16} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tip} /><Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="FLOOD" name="Flood" stackId="a" fill={HAZARD_META.FLOOD.hex} isAnimationActive={false} /><Bar dataKey="FIRE" name="Fire" stackId="a" fill={HAZARD_META.FIRE.hex} isAnimationActive={false} /><Bar dataKey="AIR" name="Air" stackId="a" fill={HAZARD_META.AIR.hex} isAnimationActive={false} />
              </BarChart></ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Risk trend</CardTitle></CardHeader>
          <CardContent>
            <div className="h-56" role="img" aria-label="Risk trend over time">
              <ResponsiveContainer><AreaChart data={series} margin={{ left: -22, right: 4 }}>
                <CartesianGrid vertical={false} stroke="#eef2f7" /><XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={16} axisLine={false} tickLine={false} /><YAxis domain={[0, 1]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tip} formatter={(v: number) => v.toFixed(2)} /><Area dataKey="risk" name="Composite risk" stroke="#3563a8" fill="#3563a8" fillOpacity={0.12} strokeWidth={2} isAnimationActive={false} />
              </AreaChart></ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Alerts by hazard</CardTitle><span className="text-xs text-slate-400">incl. live incidents</span></CardHeader>
          <CardContent>
            <div className="h-56" role="img" aria-label="Alerts by hazard">
              <ResponsiveContainer><BarChart data={histTotals} margin={{ left: -22, right: 4 }}>
                <CartesianGrid vertical={false} stroke="#eef2f7" /><XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tip} /><Bar dataKey="total" name="Alerts" radius={[4, 4, 0, 0]} isAnimationActive={false}>{histTotals.map((h) => <Cell key={h.name} fill={h.color} />)}</Bar>
              </BarChart></ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Node uptime</CardTitle><span className="text-xs text-slate-400">%</span></CardHeader>
          <CardContent>
            <div className="h-56" role="img" aria-label="Node uptime">
              <ResponsiveContainer><BarChart data={uptime} layout="vertical" margin={{ left: 6, right: 12 }}>
                <CartesianGrid horizontal={false} stroke="#eef2f7" /><XAxis type="number" domain={[90, 100]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={60} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tip} formatter={(v: number) => `${v.toFixed(1)}%`} /><Bar dataKey="uptime" fill="#16a34a" radius={[0, 4, 4, 0]} isAnimationActive={false} />
              </BarChart></ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Sensor reliability</CardTitle><span className="text-xs text-slate-400">live · base × quality</span></CardHeader>
          <CardContent>
            <div className="h-56" role="img" aria-label="Sensor reliability">
              <ResponsiveContainer><BarChart data={reliab} margin={{ left: -22, right: 4 }}>
                <CartesianGrid vertical={false} stroke="#eef2f7" /><XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tip} formatter={(v: number) => `${v.toFixed(0)}%`} /><Bar dataKey="reliability" fill="#7c3aed" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart></ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Battery health</CardTitle><span className="text-xs text-slate-400">live · %</span></CardHeader>
          <CardContent>
            <div className="h-56" role="img" aria-label="Battery health by node">
              <ResponsiveContainer><BarChart data={battery} margin={{ left: -22, right: 4 }}>
                <CartesianGrid vertical={false} stroke="#eef2f7" /><XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tip} /><Bar dataKey="battery" radius={[4, 4, 0, 0]} isAnimationActive={false}>{battery.map((b) => <Cell key={b.name} fill={b.battery > 50 ? '#16a34a' : b.battery > 25 ? '#eab308' : '#dc2626'} />)}</Bar>
              </BarChart></ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Response time</CardTitle><span className="text-xs text-slate-400">minutes to acknowledge (synthetic)</span></CardHeader>
          <CardContent>
            <div className="h-56" role="img" aria-label="Response time trend">
              <ResponsiveContainer><LineChart data={series} margin={{ left: -22, right: 4 }}>
                <CartesianGrid vertical={false} stroke="#eef2f7" /><XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={16} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tip} formatter={(v: number) => `${v.toFixed(1)} min`} /><Line dataKey="response" stroke="#0891b2" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart></ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 xl:col-span-2">
          <CardHeader><CardTitle>Regional risk (live composite)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-56" role="img" aria-label="Regional risk">
              <ResponsiveContainer><BarChart data={filteredRegions.map((r) => ({ name: r.name.replace(' (demo)', ''), Flood: +(r.risk.FLOOD * 100).toFixed(0), Fire: +(r.risk.FIRE * 100).toFixed(0), Air: +(r.risk.AIR * 100).toFixed(0), Landslide: +(r.risk.LANDSLIDE * 100).toFixed(0) }))} margin={{ left: -22, right: 4 }}>
                <CartesianGrid vertical={false} stroke="#eef2f7" /><XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tip} /><Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Flood" fill={HAZARD_META.FLOOD.hex} isAnimationActive={false} /><Bar dataKey="Fire" fill={HAZARD_META.FIRE.hex} isAnimationActive={false} /><Bar dataKey="Air" fill={HAZARD_META.AIR.hex} isAnimationActive={false} /><Bar dataKey="Landslide" fill={HAZARD_META.LANDSLIDE.hex} isAnimationActive={false} />
              </BarChart></ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-6" id="regional-risk">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-navy-900">Regional risk map</h2>
          <div className="flex items-center gap-2"><Badge tone="maint">Demo data</Badge>
            <Tabs<RegionMode> tabs={[{ value: 'COMPOSITE', label: 'Composite' }, { value: 'FLOOD', label: 'Flood' }, { value: 'FIRE', label: 'Fire' }, { value: 'AIR', label: 'Air' }, { value: 'LANDSLIDE', label: 'Landslide' }]} value={mode} onChange={setMode} />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="p-2">
            <IrisMap className="h-[420px]" nodes={d.nodes} gateways={d.gateways} incidents={d.incidents} now={d.now} layers={mode === 'COMPOSITE' ? POP_LAYERS : NO_LAYERS} hazardFilter="ALL" regions={regions} regionMode={mode} selectedRegion={picked} onRegion={setPicked} />
          </Card>
          <Card>
            <CardHeader><CardTitle>{selected ? selected.name : 'Select a region'}</CardTitle></CardHeader>
            <CardContent>
              {!selected ? <p className="text-sm text-slate-500">Click a district polygon on the map to see its risk score, active alerts, nodes, population exposure and critical infrastructure. Landslide risk is a static illustrative baseline — no landslide pods are deployed.</p> : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between"><span className="text-xs text-slate-500">{mode.toLowerCase()} risk score</span><span className="flex items-center gap-2"><b className="tabular text-lg">{(selected.risk[mode] * 100).toFixed(0)}</b><RiskBadge level={riskFromScore(selected.risk[mode])} /></span></div>
                  <Dl cols={1} items={[
                    ['Active alerts', String(selected.activeAlerts)],
                    ['Nodes', String(selected.nodes)],
                    ['Population exposure', `≈ ${selected.population.toLocaleString()} (demo estimate)`],
                    ['Critical infrastructure', `${INFRASTRUCTURE.filter((c) => selected.critical_infrastructure.includes(c.name)).length} facilities`],
                  ]} />
                  <ul className="list-inside list-disc text-xs text-slate-600">{selected.critical_infrastructure.map((c) => <li key={c}>{c}</li>)}</ul>
                  <ul className="grid grid-cols-2 gap-1 text-xs">{(['FLOOD', 'FIRE', 'AIR', 'LANDSLIDE', 'COMPOSITE'] as const).map((k) => <li key={k} className="flex justify-between rounded bg-slate-50 px-2 py-1"><span className="text-slate-500">{k.toLowerCase()}</span><b className="tabular" style={{ color: RISK_META[riskFromScore(selected.risk[k])].hex }}>{(selected.risk[k] * 100).toFixed(0)}</b></li>)}</ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
